// 📁 app/api/caterbook/upload/route.ts
// Accepts a multipart POST with:
//   - sales_file:     Caterbook Sales report export (.xlsx) — revenue figures
//   - occupancy_file: Caterbook Room export (.csv) — occupancy KPIs
//   - week_start:     ISO date string for the Monday of that week (e.g. 2026-04-27)
//
// Reconciliation logic:
//   Sales report Exc VAT total → reconcile against Xero Hotel revenue account
//   Occupancy CSV → calculate occupancy %, ADR, RevPAR, ALOS — stored as KPIs only
//
// Route: POST /api/caterbook/upload
// Access: owner only

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import * as XLSX from "xlsx";

const RECONCILIATION_TOLERANCE = 1.00;

// Parse Caterbook Sales XLSX
// Columns: Created, Booking Ref, Booking Id, Room Type, Name, Inc VAT, Exc VAT
function parseSalesXlsx(buffer: ArrayBuffer): {
  excVat: number;
  incVat: number;
  bookingCount: number;
} {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let excVat = 0;
  let incVat = 0;
  let bookingCount = 0;

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 7) continue;
    const incVal = parseFloat(String(row[5] || "0"));
    const excVal = parseFloat(String(row[6] || "0"));
    if (!isNaN(excVal) && excVal > 0) {
      incVat += incVal;
      excVat += excVal;
      bookingCount++;
    }
  }

  return {
    excVat: Math.round(excVat * 100) / 100,
    incVat: Math.round(incVat * 100) / 100,
    bookingCount,
  };
}

// Parse Caterbook Room export CSV
// Columns: Room, Available, Booked, Percent, Revenue, DateRange
function parseOccupancyCsv(csvText: string): {
  totalRooms: number;
  availableNights: number;
  bookedNights: number;
  occupancyPct: number;
  adr: number;
  revpar: number;
  alos: number;
} {
  const clean = csvText.replace(/^\uFEFF/, "").trim();
  const lines = clean.split(/\r?\n/).filter(Boolean);
  const dataLines = lines.slice(1);

  let totalRooms = 0;
  let availableNights = 0;
  let bookedNights = 0;
  let totalRevenueIncVat = 0;

  for (const line of dataLines) {
    const cols = line.split(",");
    if (cols.length < 5) continue;
    const available = parseInt(cols[1] || "0");
    const booked = parseInt(cols[2] || "0");
    const revenue = parseFloat(cols[4] || "0");
    totalRooms++;
    availableNights += available;
    bookedNights += booked;
    totalRevenueIncVat += revenue;
  }

  const revExVat = totalRevenueIncVat / 1.2;
  const occupancyPct = availableNights > 0 ? Math.round((bookedNights / availableNights) * 10000) / 100 : 0;
  const adr = bookedNights > 0 ? Math.round((revExVat / bookedNights) * 100) / 100 : 0;
  const revpar = availableNights > 0 ? Math.round((revExVat / availableNights) * 100) / 100 : 0;
  const alos = totalRooms > 0 ? Math.round((bookedNights / totalRooms) * 100) / 100 : 0;

  return { totalRooms, availableNights, bookedNights, occupancyPct, adr, revpar, alos };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: clientUserRecord } = await supabaseAdmin
    .from("client_users").select("client_id, role")
    .eq("user_id", user.id).eq("role", "owner").single();
  if (!clientUserRecord) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const clientId = clientUserRecord.client_id;

  const formData = await req.formData();
  const salesFile = formData.get("sales_file") as File | null;
  const occupancyFile = formData.get("occupancy_file") as File | null;
  const weekStart = formData.get("week_start") as string | null;

  if (!weekStart) return NextResponse.json({ error: "Missing week_start" }, { status: 400 });
  if (!salesFile && !occupancyFile) return NextResponse.json({ error: "Please upload at least one file" }, { status: 400 });

  const weekDate = new Date(weekStart);
  if (isNaN(weekDate.getTime())) return NextResponse.json({ error: "Invalid week_start date" }, { status: 400 });

  // ── Parse Sales XLSX ─────────────────────────────────────────────────────
  let salesData: { excVat: number; incVat: number; bookingCount: number } | null = null;
  if (salesFile) {
    try {
      const buffer = await salesFile.arrayBuffer();
      salesData = parseSalesXlsx(buffer);
    } catch (err: any) {
      return NextResponse.json({ error: `Sales file error: ${err.message}` }, { status: 400 });
    }
  }

  // ── Parse Occupancy CSV ──────────────────────────────────────────────────
  let occupancyData: { totalRooms: number; availableNights: number; bookedNights: number; occupancyPct: number; adr: number; revpar: number; alos: number } | null = null;
  if (occupancyFile) {
    try {
      const csvText = await occupancyFile.text();
      occupancyData = parseOccupancyCsv(csvText);
    } catch (err: any) {
      return NextResponse.json({ error: `Occupancy file error: ${err.message}` }, { status: 400 });
    }
  }

  // ── Xero lookup — Hotel revenue ──────────────────────────────────────────
  let xeroHotelRevenue = 0;
  let isReconciled = false;
  let difference = 0;

  if (salesData) {
    const { data: xeroRows } = await supabaseAdmin
      .from("gl_transactions")
      .select("credit")
      .eq("client_id", clientId)
      .eq("txn_date", weekStart)
      .in("account_name", ["Hotel revenue", "Sub-Contracted Laundry"]);

    xeroHotelRevenue = Math.round((xeroRows || []).reduce((sum, r) => sum + (r.credit || 0), 0) * 100) / 100;
    difference = Math.round(Math.abs(salesData.excVat - xeroHotelRevenue) * 100) / 100;
    isReconciled = difference <= RECONCILIATION_TOLERANCE;
  }

  // ── Upsert hotel_kpis ────────────────────────────────────────────────────
  const upsertData: any = {
    client_id: clientId,
    week_start: weekStart,
    reconciled_at: new Date().toISOString(),
  };

  if (salesData) {
    upsertData.hotel_revenue_ex_vat = salesData.excVat;
    upsertData.hotel_revenue_inc_vat = salesData.incVat;
    upsertData.booking_count = salesData.bookingCount;
    upsertData.xero_hotel_revenue = xeroHotelRevenue;
    upsertData.difference = difference;
    upsertData.is_reconciled = isReconciled;
  }

  if (occupancyData) {
    upsertData.total_rooms = occupancyData.totalRooms;
    upsertData.available_nights = occupancyData.availableNights;
    upsertData.booked_nights = occupancyData.bookedNights;
    upsertData.occupancy_pct = occupancyData.occupancyPct;
    upsertData.adr = occupancyData.adr;
    upsertData.revpar = occupancyData.revpar;
    upsertData.alos = occupancyData.alos;
  }

  const { error: upsertError } = await supabaseAdmin
    .from("hotel_kpis")
    .upsert(upsertData, { onConflict: "client_id,week_start" });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    week_start: weekStart,
    sales: salesData,
    occupancy: occupancyData,
    xero_hotel_revenue: xeroHotelRevenue,
    difference,
    is_reconciled: isReconciled,
    message: !salesData
      ? "Occupancy data saved. Upload Sales report to complete revenue reconciliation."
      : isReconciled
      ? `✓ Reconciled — Caterbook and Xero hotel revenue match within £${RECONCILIATION_TOLERANCE}.`
      : `⚠ Not reconciled — difference of £${difference.toFixed(2)}. Check your Xero hotel journal for this week and re-sync before uploading again.`,
  });
}
