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
const SYNC_FROM = new Date("2025-05-01");

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
  const tokenSet = {
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expires_at: tokenRow.expires_at
      ? new Date(tokenRow.expires_at).getTime() / 1000
      : undefined,
  };
  await xero.setTokenSet(tokenSet);

  // Refresh if expired or expiring within 60 seconds
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = tokenSet.expires_at ?? 0;
  if (expiresAt < now + 60) {
    await xero.refreshWithRefreshToken(
      process.env.XERO_CLIENT_ID!,
      process.env.XERO_CLIENT_SECRET!,
      tokenRow.refresh_token
    );
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

  // Load tenants so API calls work
  await xero.updateTenants();

  const tenantId = clientRecord.xero_tenant_id;
  const weeks = getWeeks(SYNC_FROM, new Date());
  const inserted: string[] = [];
  const errors: string[] = [];

  // Load all known account mappings so we can detect unmapped accounts
  const { data: knownMappings } = await supabaseAdmin
    .from("stream_mappings")
    .select("match_value")
    .eq("client_id", clientRecord.id);

  const knownAccountCodes = new Set((knownMappings || []).map((m) => m.match_value));
  const newUnmappedAccounts: Record<string, { name: string; section: string; date: string }> = {};

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

      const rowsToInsert: any[] = [];

      for (const section of report.rows) {
        // Skip header, summary-only sections and the gross/net profit rows
        if (!section.rows || section.rowType === RowType.Header) continue;

        const sectionTitle = section.title || "";

        const isIncome = sectionTitle === "Income";
        const isCOGS = sectionTitle === "Less Cost of Sales";
        const isOpex = sectionTitle === "Less Operating Expenses";

        // Skip sections we don't care about (gross profit, net profit rows)
        if (!isIncome && !isCOGS && !isOpex) continue;

        for (const row of section.rows) {
          if (row.rowType !== RowType.Row) continue;
          const cells = row.cells || [];

          // Cell 0: account name (+ attributes with account UUID)
          // Cell 1: amount
          const accountName = cells[0]?.value || "";
          const accountId = cells[0]?.attributes?.[0]?.value || "";
          const amountStr = cells[1]?.value || "0";
          const amount = parseAmount(amountStr);

          if (!accountName || amount === 0) continue;

          // Failsafe: flag any account not in stream_mappings
          if (accountId && !knownAccountCodes.has(accountId)) {
            newUnmappedAccounts[accountId] = {
              name: accountName,
              section: sectionTitle,
              date: fromDate,
            };
          }

          rowsToInsert.push({
            client_id: clientRecord.id,
            txn_date: fromDate,
            period_end: toDate,
            account_code: accountId, // using Xero account UUID as the code
            account_name: accountName,
            description: sectionTitle,
            debit: isIncome ? 0 : Math.abs(amount),
            credit: isIncome ? Math.abs(amount) : 0,
            source_type: "pl_report",
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

  // Write unmapped accounts to the database
  const unmappedList = Object.entries(newUnmappedAccounts);
  if (unmappedList.length > 0) {
    for (const [accountCode, { name, section, date }] of unmappedList) {
      // Upsert — update last_seen_date and increment times_seen if already exists
      const { data: existing } = await supabaseAdmin
        .from("unmapped_accounts")
        .select("id, times_seen")
        .eq("client_id", clientRecord.id)
        .eq("account_code", accountCode)
        .single();

      if (existing) {
        await supabaseAdmin
          .from("unmapped_accounts")
          .update({
            last_seen_date: date,
            times_seen: (existing.times_seen || 1) + 1,
            is_resolved: false, // re-flag if it was marked resolved but reappeared
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("unmapped_accounts").insert({
          client_id: clientRecord.id,
          account_code: accountCode,
          account_name: name,
          section,
          first_seen_date: date,
          last_seen_date: date,
          times_seen: 1,
          is_resolved: false,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    weeks_synced: inserted.length,
    inserted,
    errors,
    unmapped_accounts: unmappedList.length > 0 ? unmappedList.map(([code, { name, section }]) => ({ code, name, section })) : [],
    unmapped_warning: unmappedList.length > 0
      ? `⚠ ${unmappedList.length} account(s) found in Xero P&L with no stream mapping — check Alerts tab`
      : null,
  });
}
