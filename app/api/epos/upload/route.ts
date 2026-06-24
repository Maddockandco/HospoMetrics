// app/api/epos/upload/route.ts
// Accepts a multipart POST with:
//   - file: the EPOS Now Wet and Dry CSV export
//   - week_start: ISO date string for the Monday of that week (e.g. 2026-06-16)
// Parses the CSV, reconciles the total against Xero, and stores the result.
// Route: POST /api/epos/upload
// Access: owner only

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const RECONCILIATION_TOLERANCE = 1.00; // £1 tolerance for rounding differences

interface EposRow {
  name: string;
  qty: number;
  salesExcVat: number;
  vatTotal: number;
  totalPrice: number;
  discount: number;
}

function parseEposCsv(csvText: string): EposRow[] {
  // Strip BOM if present
  const clean = csvText.replace(/^\uFEFF/, "").trim();
  const lines = clean.split(/\r?\n/).filter(Boolean);

  // Skip header row
  const dataLines = lines.slice(1);

  return dataLines.map((line) => {
    const cols = line.split(",");
    return {
      name: cols[0]?.trim() || "",
      qty: parseInt(cols[1] || "0"),
      salesExcVat: parseFloat(cols[2] || "0"),
      vatTotal: parseFloat(cols[3] || "0"),
      totalPrice: parseFloat(cols[4] || "0"),
      discount: parseFloat(cols[7] || "0"),
    };
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get client record
  const { data: clientUserRecord } = await supabaseAdmin
    .from("client_users").select("client_id, role")
    .eq("user_id", user.id).eq("role", "owner").single();
  if (!clientUserRecord) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const clientId = clientUserRecord.client_id;

  // Parse multipart form
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const weekStart = formData.get("week_start") as string | null;

  if (!file || !weekStart) {
    return NextResponse.json({ error: "Missing file or week_start" }, { status: 400 });
  }

  // Validate week_start is a Monday
  const weekDate = new Date(weekStart);
  if (isNaN(weekDate.getTime())) {
    return NextResponse.json({ error: "Invalid week_start date" }, { status: 400 });
  }

  // Parse CSV
  const csvText = await file.text();
  const rows = parseEposCsv(csvText);

  const dryRow = rows.find((r) => r.name.toLowerCase() === "dry");
  const wetRow = rows.find((r) => r.name.toLowerCase() === "wet");
  const totalRow = rows.find((r) => r.name.toLowerCase().startsWith("total"));

  if (!dryRow || !wetRow || !totalRow) {
    return NextResponse.json({
      error: "CSV format not recognised — expected Dry, Wet and Total rows",
    }, { status: 400 });
  }

  // Look up Xero GL total for bar+restaurant revenue for this week
  const { data: xeroRows } = await supabaseAdmin
    .from("gl_transactions")
    .select("credit")
    .eq("client_id", clientId)
    .eq("txn_date", weekStart)
    .eq("account_name", "Gales Bar and Restuarant Revenue"); // note: typo matches Xero

  const xeroTotal = (xeroRows || []).reduce((sum, r) => sum + (r.credit || 0), 0);
  const eposTotal = totalRow.salesExcVat;
  const difference = Math.abs(eposTotal - xeroTotal);
  const isReconciled = difference <= RECONCILIATION_TOLERANCE;

  // Store EPOS sales data
  await supabaseAdmin.from("epos_sales").upsert({
    client_id: clientId,
    week_start: weekStart,
    dry_sales_ex_vat: dryRow.salesExcVat,
    wet_sales_ex_vat: wetRow.salesExcVat,
    total_sales_ex_vat: eposTotal,
    dry_qty: dryRow.qty,
    wet_qty: wetRow.qty,
    dry_discount: dryRow.discount,
    wet_discount: wetRow.discount,
    imported_at: new Date().toISOString(),
  });

  // Store reconciliation result
  await supabaseAdmin.from("epos_reconciliation").upsert({
    client_id: clientId,
    week_start: weekStart,
    epos_total: eposTotal,
    xero_total: xeroTotal,
    difference: Math.round(difference * 100) / 100,
    tolerance: RECONCILIATION_TOLERANCE,
    is_reconciled: isReconciled,
    reconciled_at: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    week_start: weekStart,
    epos: {
      dry: dryRow.salesExcVat,
      wet: wetRow.salesExcVat,
      total: eposTotal,
    },
    xero_total: Math.round(xeroTotal * 100) / 100,
    difference: Math.round(difference * 100) / 100,
    is_reconciled: isReconciled,
    message: isReconciled
      ? `✓ Reconciled — EPOS and Xero totals match within £${RECONCILIATION_TOLERANCE}. Bar/Restaurant split will use EPOS actuals.`
      : `⚠ Not reconciled — difference of £${difference.toFixed(2)} exceeds tolerance. Figures not used until resolved.`,
  });
}
