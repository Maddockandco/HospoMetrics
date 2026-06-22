// app/api/xero/sync/route.ts
// Pulls the Xero P&L report week by week and stores account-level rows
// into gl_transactions. Safe to re-run — uses upsert logic.
// Route: /api/xero/sync
// Access: owner only (called manually or via cron)

import { NextRequest, NextResponse } from "next/server";
import { getXeroClient } from "@/lib/xero";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ReportWithRow, RowType } from "xero-node";

// Sync starts from this date — earliest reliable data for Tangerine Trees
const SYNC_FROM = new Date("2026-03-01");

function getWeeks(from: Date, to: Date): { start: Date; end: Date }[] {
  const weeks = [];
  let current = new Date(from);

  // Align to Monday
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);

  while (current < to) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

    weeks.push({
      start: weekStart,
      end: weekEnd < to ? weekEnd : to,
    });

    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  return parseFloat(cleaned) || 0;
}

export async function GET(req: NextRequest) {
  // Check the caller is an authenticated owner
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the client record + token for this user
  const { data: clientRecord } = await supabaseAdmin
    .from("clients")
    .select("id, xero_tenant_id")
    .eq("owner_user_id", user.id)
    .single();

  if (!clientRecord?.xero_tenant_id) {
    return NextResponse.json(
      { error: "No Xero connection found" },
      { status: 400 }
    );
  }

  const { data: tokenRow } = await supabaseAdmin
    .from("xero_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("client_id", clientRecord.id)
    .single();

  if (!tokenRow) {
    return NextResponse.json(
      { error: "No Xero token found — reconnect Xero" },
      { status: 400 }
    );
  }

  // Restore the token into the xero-node client
  const xero = getXeroClient();
  await xero.setTokenSet({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expires_at: tokenRow.expires_at
      ? new Date(tokenRow.expires_at).getTime() / 1000
      : undefined,
  });

  // Refresh the token if needed and save the new one
  const refreshed = await xero.refreshToken();
  if (refreshed) {
    const newTokenSet = await xero.readTokenSet();
    await supabaseAdmin.from("xero_tokens").upsert({
      client_id: clientRecord.id,
      access_token: newTokenSet.access_token,
      refresh_token: newTokenSet.refresh_token,
      expires_at: newTokenSet.expires_at
        ? new Date(newTokenSet.expires_at * 1000).toISOString()
        : null,
    });
  }

  const tenantId = clientRecord.xero_tenant_id;
  const weeks = getWeeks(SYNC_FROM, new Date());
  const inserted: string[] = [];
  const errors: string[] = [];

  for (const week of weeks) {
    const fromDate = formatDate(week.start);
    const toDate = formatDate(week.end);

    try {
      const response = await xero.accountingApi.getReportProfitAndLoss(
        tenantId,
        fromDate,  // fromDate
        toDate,    // toDate
        undefined, // periods
        undefined, // timeframe
        undefined, // trackingCategoryID
        undefined, // trackingCategoryID2
        undefined, // trackingOptionID
        undefined, // trackingOptionID2
        false,     // standardLayout
        false      // paymentsOnly
      );

      const report: ReportWithRow | undefined =
        response.body.reports?.[0];

      if (!report?.rows) {
        errors.push(`${fromDate}: no rows returned`);
        continue;
      }

      // Walk the report rows, which are nested: Section > Row > Cell
      // Each Row has cells: [AccountName, AccountCode, Amount]
      const rowsToInsert: any[] = [];

      for (const section of report.rows) {
        if (!section.rows) continue;

        const sectionTitle = section.title || "Unknown";

        for (const row of section.rows) {
          if (row.rowType !== RowType.Row) continue;
          const cells = row.cells || [];

          const accountName = cells[0]?.value || "";
          const accountCode = cells[1]?.value || "";
          const amountStr = cells[2]?.value || "0";
          const amount = parseAmount(amountStr);

          if (!accountName || amount === 0) continue;

          // Determine if this is revenue (income section) or cost
          const isIncome =
            sectionTitle.toLowerCase().includes("income") ||
            sectionTitle.toLowerCase().includes("revenue") ||
            sectionTitle.toLowerCase().includes("sales");

          rowsToInsert.push({
            client_id: clientRecord.id,
            txn_date: fromDate,
            account_code: accountCode,
            account_name: accountName,
            description: sectionTitle,
            // Income = credit, Expenses = debit (standard P&L convention)
            debit: isIncome ? 0 : Math.abs(amount),
            credit: isIncome ? Math.abs(amount) : 0,
            source_type: "pl_report",
            // Store week end date as a custom field via description suffix
          });
        }
      }

      if (rowsToInsert.length > 0) {
        // Delete existing rows for this week before re-inserting (clean re-sync)
        await supabaseAdmin
          .from("gl_transactions")
          .delete()
          .eq("client_id", clientRecord.id)
          .eq("txn_date", fromDate)
          .eq("source_type", "pl_report");

        await supabaseAdmin.from("gl_transactions").insert(rowsToInsert);
        inserted.push(`${fromDate} → ${toDate}: ${rowsToInsert.length} rows`);
      }

      // Xero rate limit: 60 calls/min — small delay between weeks
      await new Promise((r) => setTimeout(r, 1100));
    } catch (err: any) {
      errors.push(`${fromDate}: ${err.message || "unknown error"}`);
    }
  }

  return NextResponse.json({
    success: true,
    weeks_synced: inserted.length,
    inserted,
    errors,
  });
}
