// 📁 app/api/epos/upload/route.ts
// Accepts a multipart POST with:
//   - file:      the EPOS Now Wet and Dry CSV export
//   - misc_file: the EPOS Now Misc Sales CSV export (optional but needed for full reconciliation)
//   - week_start: ISO date string for the Monday of that week (e.g. 2026-06-16)
//
// Reconciliation logic:
//   Bar revenue    = Wet + Misc  (both map to Bar revenue(WetStock) in Xero)
//   Restaurant     = Dry
//   Sense check    = Wet + Misc + Dry === Xero total (within £1 tolerance)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const RECONCILIATION_TOLERANCE = 1.00;

interface EposRow {
  name: string;
  qty: number;
  salesExcVat: number;
  vatTotal: number;
  totalPrice: number;
  discount: number;
}

function parseEposCsv(csvText: string): EposRow[] {
  const clean = csvText.replace(/^\uFEFF/, "").trim();
  const lines = clean.split(/\r?\n/).filter(Boolean);
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

// For the Misc CSV — sum all non-header, non-total rows' SalesExcVAT
function parseMiscCsv(csvText: string): { total: number; qty: number } {
  const clean = csvText.replace(/^\uFEFF/, "").trim();
  const lines = clean.split(/\r?\n/).filter(Boolean);
  const dataLines = lines.slice(1); // skip header

  let total = 0;
  let qty = 0;

  for (const line of dataLines) {
    const cols = line.split(",");
    const name = cols[0]?.trim().toLowerCase() || "";
    if (name.startsWith("total")) continue; // skip total row
    total += parseFloat(cols[2] || "0"); // SalesExcVAT
    qty += parseInt(cols[1] || "0");
  }

  return { total: Math.round(total * 100) / 100, qty };
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
  const file = formData.get("file") as File | null;
  const miscFile = formData.get("misc_file") as File | null;
  const weekStart = formData.get("week_start") as string | null;

  if (!file || !weekStart) {
    return NextResponse.json({ error: "Missing file or week_start" }, { status: 400 });
  }

  const weekDate = new Date(weekStart);
  if (isNaN(weekDate.getTime())) {
    return NextResponse.json({ error: "Invalid week_start date" }, { status: 400 });
  }

  // ── Parse Wet & Dry CSV ──────────────────────────────────────────────────
  const csvText = await file.text();
  const rows = parseEposCsv(csvText);

  const dryRow = rows.find((r) => r.name.toLowerCase() === "dry");
  const wetRow = rows.find((r) => r.name.toLowerCase() === "wet");

  if (!dryRow || !wetRow) {
    return NextResponse.json({
      error: "Wet & Dry CSV format not recognised — expected Dry and Wet rows",
    }, { status: 400 });
  }

  const wetSales = wetRow.salesExcVat;
  const drySales = dryRow.salesExcVat;

  // ── Parse Misc CSV (if provided) ─────────────────────────────────────────
  let miscSales = 0;
  let miscQty = 0;
  let miscProvided = false;

  if (miscFile) {
    const miscText = await miscFile.text();
    const parsed = parseMiscCsv(miscText);
    miscSales = parsed.total;
    miscQty = parsed.qty;
    miscProvided = true;
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const barTotal = wetSales + miscSales;       // Bar = Wet + Misc
  const eposGrandTotal = barTotal + drySales;  // Total = Bar + Dry

  // ── Xero lookup ──────────────────────────────────────────────────────────
  // Sum Bar + Restaurant revenue accounts — Hotel is handled separately in Caterbook import
  const { data: xeroRows } = await supabaseAdmin
    .from("gl_transactions")
    .select("credit")
    .eq("client_id", clientId)
    .eq("txn_date", weekStart)
    .in("account_name", ["Bar revenue(WetStock)", "Restaurant Sales(DryStock)"]);

  const xeroTotal = (xeroRows || []).reduce((sum, r) => sum + (r.credit || 0), 0);
  const difference = Math.abs(eposGrandTotal - xeroTotal);
  const isReconciled = difference <= RECONCILIATION_TOLERANCE;

  // ── Store EPOS sales ─────────────────────────────────────────────────────
  await supabaseAdmin.from("epos_sales").upsert({
    client_id: clientId,
    week_start: weekStart,
    wet_sales_ex_vat: wetSales,
    dry_sales_ex_vat: drySales,
    misc_sales_ex_vat: miscSales,
    bar_total_ex_vat: barTotal,
    total_sales_ex_vat: eposGrandTotal,
    wet_qty: wetRow.qty,
    dry_qty: dryRow.qty,
    misc_qty: miscQty,
    dry_discount: dryRow.discount,
    wet_discount: wetRow.discount,
    imported_at: new Date().toISOString(),
  });

  // ── Store reconciliation result ──────────────────────────────────────────
  await supabaseAdmin.from("epos_reconciliation").upsert({
    client_id: clientId,
    week_start: weekStart,
    epos_total: eposGrandTotal,
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
      wet: wetSales,
      dry: drySales,
      misc: miscSales,
      bar: barTotal,
      total: eposGrandTotal,
    },
    misc_provided: miscProvided,
    xero_total: Math.round(xeroTotal * 100) / 100,
    difference: Math.round(difference * 100) / 100,
    is_reconciled: isReconciled,
    message: isReconciled
      ? `✓ Reconciled — EPOS and Xero totals match within £${RECONCILIATION_TOLERANCE}. Bar/Restaurant split will use EPOS actuals.`
      : `⚠ Not reconciled — difference of £${difference.toFixed(2)} exceeds tolerance. Figures not used until resolved.`,
  });
}
