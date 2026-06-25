// 📁 app/api/reports/weekly/route.ts
// Full weekly report with stream P&L, opex, spike detection, trend data,
// week-on-week comparisons, year-on-year comparisons, and 4-week rolling averages.
//
// Revenue gating:
//   Bar + Restaurant revenue only shown if EPOS CSV has been uploaded AND reconciled.
//   If not, revenue = 0 and streams are flagged epos_pending = true.
//   Hotel revenue shown from Xero directly until Caterbook import is built.
//   Costs (COGS, wages, opex) always shown regardless of EPOS status.
//
// Route: /api/reports/weekly?week=2026-03-02
// Access: owner or viewer

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SPIKE_THRESHOLD = 0.25;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Compute stream P&L for a set of GL rows using mappings + allocation rules
// eposSplit: only used if is_reconciled = true — otherwise Bar/Restaurant revenue = 0
function computeStreams(
  glRows: any[],
  streams: any[],
  mappingByAccount: Record<string, any>,
  allocRules: any[],
  weeklyWageAvg: number,
  totalOpex: number,
  eposSplit?: { bar: number; restaurant: number; is_reconciled: boolean } | null
) {
  const result: Record<string, any> = {};
  for (const s of streams) {
    result[s.id] = {
      stream: s.name,
      revenue: 0,
      cogs: 0,
      wages: 0,
      overhead: 0,
      events: 0,
      is_estimated: false,
      epos_pending: false,
    };
  }

  const sharedStream = streams.find((s) => s.name === "Shared");
  const barStream = streams.find((s) => s.name === "Bar");
  const restaurantStream = streams.find((s) => s.name === "Restaurant");

  for (const row of glRows) {
    const mapping = mappingByAccount[row.account_code];
    if (!mapping) continue;
    const amount = row.credit > 0 ? row.credit : row.debit;
    const streamId = mapping.revenue_stream_id;
    const costType = mapping.cost_type;
    if (!result[streamId]) continue;

    if (costType === "revenue") {
      if (streamId === sharedStream?.id) {
        // Bar + Restaurant revenue: only use if EPOS is reconciled
        if (eposSplit?.is_reconciled && barStream && restaurantStream) {
          result[barStream.id].revenue += eposSplit.bar;
          result[restaurantStream.id].revenue += eposSplit.restaurant;
        } else {
          // No reconciled EPOS — block revenue, flag as pending
          if (barStream) result[barStream.id].epos_pending = true;
          if (restaurantStream) result[restaurantStream.id].epos_pending = true;
          // Revenue stays 0 — do NOT apply allocation rules
        }
      } else {
        // Hotel and any other directly-mapped streams — show from Xero
        result[streamId].revenue += amount;
      }
    } else if (costType === "cogs") {
      if (
        row.account_name.toLowerCase().includes("artist") ||
        row.account_name.toLowerCase().includes("event")
      ) {
        result[streamId].events += amount;
      } else {
        result[streamId].cogs += amount;
      }
    } else if (costType === "wages") {
      // handled via rolling average below
    }
  }

  // Apply rolling wage average
  const wageRules = allocRules.filter((r) => r.rule_type === "wages");
  for (const rule of wageRules) {
    if (result[rule.revenue_stream_id]) {
      result[rule.revenue_stream_id].wages += weeklyWageAvg * rule.percentage;
      result[rule.revenue_stream_id].is_estimated = true;
    }
  }

  // Split opex equally across non-shared streams
  const mainStreams = streams.filter((s) => s.name !== "Shared");
  const opexPerStream = mainStreams.length > 0 ? totalOpex / mainStreams.length : 0;

  return Object.values(result)
    .filter((r: any) => r.stream !== "Shared")
    .map((r: any) => {
      const grossMargin = r.revenue - r.cogs - r.wages - r.events;
      const netProfit = grossMargin - opexPerStream;
      return {
        stream: r.stream,
        revenue: Math.round(r.revenue * 100) / 100,
        cogs: Math.round(r.cogs * 100) / 100,
        wages: Math.round(r.wages * 100) / 100,
        events: Math.round(r.events * 100) / 100,
        overhead: Math.round(opexPerStream * 100) / 100,
        gross_margin: Math.round(grossMargin * 100) / 100,
        gross_margin_pct: r.revenue > 0 ? Math.round((grossMargin / r.revenue) * 10000) / 100 : 0,
        net_profit: Math.round(netProfit * 100) / 100,
        net_profit_pct: r.revenue > 0 ? Math.round((netProfit / r.revenue) * 10000) / 100 : 0,
        wage_pct_of_revenue: r.revenue > 0 ? Math.round((r.wages / r.revenue) * 10000) / 100 : 0,
        is_estimated: r.is_estimated,
        epos_pending: r.epos_pending,
      };
    });
}

function sumTotals(streamResults: any[]) {
  const t = streamResults.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cogs: acc.cogs + r.cogs,
      wages: acc.wages + r.wages,
      events: acc.events + r.events,
      overhead: acc.overhead + r.overhead,
      gross_margin: acc.gross_margin + r.gross_margin,
      net_profit: acc.net_profit + r.net_profit,
    }),
    { revenue: 0, cogs: 0, wages: 0, events: 0, overhead: 0, gross_margin: 0, net_profit: 0 }
  );
  return {
    ...t,
    gross_margin_pct: t.revenue > 0 ? Math.round((t.gross_margin / t.revenue) * 10000) / 100 : 0,
    net_profit_pct: t.revenue > 0 ? Math.round((t.net_profit / t.revenue) * 10000) / 100 : 0,
    wage_pct_of_revenue: t.revenue > 0 ? Math.round((t.wages / t.revenue) * 10000) / 100 : 0,
  };
}

function buildChange(current: number, prior: number) {
  if (!prior || prior === 0) return null;
  return Math.round(((current - prior) / Math.abs(prior)) * 10000) / 100;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get("week");

  let weekStart: Date;
  if (weekParam) {
    weekStart = new Date(weekParam);
  } else {
    weekStart = new Date();
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
  }
  const weekStartStr = toStr(weekStart);
  const priorWeekStr = toStr(addDays(weekStart, -7));
  const yearAgoStr = toStr(addDays(weekStart, -364));

  const { data: clientUserRecord } = await supabaseAdmin
    .from("client_users").select("client_id, role").eq("user_id", user.id).single();
  if (!clientUserRecord) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const clientId = clientUserRecord.client_id;

  const [
    { data: glRows },
    { data: priorWeekRows },
    { data: yearAgoRows },
    { data: wageRows },
    { data: priorWageRows },
    { data: yearAgoWageRows },
    { data: historicalRows },
    { data: mappings },
    { data: streams },
    { data: allocRules },
    { data: eposSalesRow },
    { data: eposReconRow },
    { data: unmappedAccounts },
  ] = await Promise.all([
    supabaseAdmin.from("gl_transactions").select("*").eq("client_id", clientId)
      .eq("txn_date", weekStartStr).neq("source_granularity", "monthly"),
    supabaseAdmin.from("gl_transactions").select("*").eq("client_id", clientId)
      .eq("txn_date", priorWeekStr).neq("source_granularity", "monthly"),
    supabaseAdmin.from("gl_transactions").select("*").eq("client_id", clientId)
      .eq("txn_date", yearAgoStr).neq("source_granularity", "monthly"),
    supabaseAdmin.from("gl_transactions").select("debit").eq("client_id", clientId)
      .eq("account_name", "Wages and Salaries")
      .gte("txn_date", toStr(addDays(weekStart, -21))).lte("txn_date", weekStartStr),
    supabaseAdmin.from("gl_transactions").select("debit").eq("client_id", clientId)
      .eq("account_name", "Wages and Salaries")
      .gte("txn_date", toStr(addDays(weekStart, -28))).lte("txn_date", priorWeekStr),
    supabaseAdmin.from("gl_transactions").select("debit").eq("client_id", clientId)
      .eq("account_name", "Wages and Salaries")
      .gte("txn_date", toStr(addDays(weekStart, -364 - 21))).lte("txn_date", yearAgoStr),
    supabaseAdmin.from("gl_transactions").select("*").eq("client_id", clientId)
      .gte("txn_date", toStr(addDays(weekStart, -56))).lte("txn_date", weekStartStr)
      .neq("source_granularity", "monthly"),
    supabaseAdmin.from("stream_mappings").select("*, revenue_streams(name)").eq("client_id", clientId),
    supabaseAdmin.from("revenue_streams").select("*").eq("client_id", clientId).order("sort_order"),
    supabaseAdmin.from("allocation_rules").select("*, revenue_streams(name)")
      .eq("client_id", clientId).lte("effective_from", weekStartStr)
      .or("effective_to.is.null,effective_to.gte." + weekStartStr),
    // EPOS — now includes bar_total (Wet + Misc) and dry
    supabaseAdmin.from("epos_sales")
      .select("wet_sales_ex_vat, dry_sales_ex_vat, misc_sales_ex_vat, bar_total_ex_vat, total_sales_ex_vat")
      .eq("client_id", clientId).eq("week_start", weekStartStr).maybeSingle(),
    supabaseAdmin.from("epos_reconciliation").select("is_reconciled, difference")
      .eq("client_id", clientId).eq("week_start", weekStartStr).maybeSingle(),
    supabaseAdmin.from("unmapped_accounts").select("*")
      .eq("client_id", clientId).eq("is_resolved", false),
  ]);

  if (!glRows || !mappings || !streams || !allocRules) {
    return NextResponse.json({ error: "Data fetch failed" }, { status: 500 });
  }

  const mappingByAccount: Record<string, any> = {};
  for (const m of mappings) mappingByAccount[m.match_value] = m;

  const weeklyWageAvg = (wageRows || []).reduce((s, r) => s + (r.debit || 0), 0) / 4;
  const priorWageAvg = (priorWageRows || []).reduce((s, r) => s + (r.debit || 0), 0) / 4;
  const yearAgoWageAvg = (yearAgoWageRows || []).reduce((s, r) => s + (r.debit || 0), 0) / 4;

  function getOpex(rows: any[]) {
    const lines: Record<string, { name: string; amount: number }> = {};
    for (const row of rows) {
      const mapping = mappingByAccount[row.account_code];
      if (!mapping || mapping.cost_type !== "overhead") continue;
      const amt = row.credit > 0 ? row.credit : row.debit;
      lines[row.account_name] = {
        name: row.account_name,
        amount: (lines[row.account_name]?.amount || 0) + amt,
      };
    }
    return lines;
  }

  const opexLines = getOpex(glRows);
  const totalOpex = Object.values(opexLines).reduce((s, l) => s + l.amount, 0);
  const priorTotalOpex = Object.values(getOpex(priorWeekRows || [])).reduce((s, l) => s + l.amount, 0);
  const yearAgoTotalOpex = Object.values(getOpex(yearAgoRows || [])).reduce((s, l) => s + l.amount, 0);

  // ── EPOS split — use bar_total (Wet + Misc) for Bar, dry for Restaurant ──
  const eposSplit = (eposSalesRow && eposReconRow?.is_reconciled)
    ? {
        bar: eposSalesRow.bar_total_ex_vat ?? eposSalesRow.wet_sales_ex_vat, // fallback for old rows
        restaurant: eposSalesRow.dry_sales_ex_vat,
        is_reconciled: true,
      }
    : null;

  // ── Determine EPOS status for the response ────────────────────────────────
  const eposStatus = eposSplit?.is_reconciled
    ? { source: "epos_actuals", message: "Bar/Restaurant revenue from reconciled EPOS data (Wet + Misc + Dry)" }
    : eposReconRow && !eposReconRow.is_reconciled
    ? { source: "epos_pending", message: `EPOS uploaded but not reconciled — difference of £${eposReconRow.difference?.toFixed(2)}. Revenue hidden until resolved.` }
    : { source: "epos_pending", message: "No EPOS upload for this week — Bar & Restaurant revenue hidden until uploaded and reconciled." };

  // ── Current week ──────────────────────────────────────────────────────────
  const streamResults = computeStreams(glRows, streams, mappingByAccount, allocRules, weeklyWageAvg, totalOpex, eposSplit);
  const totals = sumTotals(streamResults);

  // ── Prior week ────────────────────────────────────────────────────────────
  const priorStreams = computeStreams(priorWeekRows || [], streams, mappingByAccount, allocRules, priorWageAvg, priorTotalOpex);
  const priorTotals = sumTotals(priorStreams);

  // ── Year ago ──────────────────────────────────────────────────────────────
  const yearAgoStreams = computeStreams(yearAgoRows || [], streams, mappingByAccount, allocRules, yearAgoWageAvg, yearAgoTotalOpex);
  const yearAgoTotals = sumTotals(yearAgoStreams);

  // ── 4-week rolling average ────────────────────────────────────────────────
  const allWeekDates = [...new Set((historicalRows || []).map((r: any) => r.txn_date))].sort();
  const last4Weeks = allWeekDates.filter((d) => d <= weekStartStr).slice(-4);

  const rollingStreamBuckets: Record<string, any> = {};
  for (const s of streams) {
    rollingStreamBuckets[s.id] = { stream: s.name, revenue: 0, cogs: 0, wages: 0, overhead: 0, events: 0, is_estimated: false };
  }

  for (const week of last4Weeks) {
    const weekRows = (historicalRows || []).filter((r: any) => r.txn_date === week);
    const weekWage = (wageRows || []).reduce((s: number, r: any) => s + (r.debit || 0), 0) / 4;
    const weekOpex = Object.values(getOpex(weekRows)).reduce((s: number, l: any) => s + l.amount, 0);

    // For rolling average, check if that specific week had a reconciled EPOS upload
    // If not, exclude its revenue from the rolling calc to keep it consistent
    const weekStreams = computeStreams(weekRows, streams, mappingByAccount, allocRules, weekWage, weekOpex);
    for (const s of weekStreams) {
      const key = streams.find((st: any) => st.name === s.stream)?.id;
      if (!key || !rollingStreamBuckets[key]) continue;
      rollingStreamBuckets[key].revenue += s.revenue;
      rollingStreamBuckets[key].cogs += s.cogs;
      rollingStreamBuckets[key].wages += s.wages;
      rollingStreamBuckets[key].events += s.events;
      rollingStreamBuckets[key].overhead += s.overhead;
    }
  }

  const weeksCount = last4Weeks.length || 1;
  const rollingAvgOpex = last4Weeks.reduce((sum, week) => {
    const weekRows = (historicalRows || []).filter((r: any) => r.txn_date === week);
    return sum + Object.values(getOpex(weekRows)).reduce((s: number, l: any) => s + l.amount, 0);
  }, 0) / weeksCount;

  const rollingStreams = Object.values(rollingStreamBuckets)
    .filter((r: any) => r.stream !== "Shared")
    .map((r: any) => {
      const rev = r.revenue / weeksCount;
      const cogs = r.cogs / weeksCount;
      const wages = r.wages / weeksCount;
      const events = r.events / weeksCount;
      const overhead = rollingAvgOpex / (streams.filter((s: any) => s.name !== "Shared").length || 1);
      const gm = rev - cogs - wages - events;
      const np = gm - overhead;
      return {
        stream: r.stream,
        revenue: Math.round(rev * 100) / 100,
        cogs: Math.round(cogs * 100) / 100,
        wages: Math.round(wages * 100) / 100,
        events: Math.round(events * 100) / 100,
        overhead: Math.round(overhead * 100) / 100,
        gross_margin: Math.round(gm * 100) / 100,
        gross_margin_pct: rev > 0 ? Math.round((gm / rev) * 10000) / 100 : 0,
        net_profit: Math.round(np * 100) / 100,
        net_profit_pct: rev > 0 ? Math.round((np / rev) * 10000) / 100 : 0,
        wage_pct_of_revenue: rev > 0 ? Math.round((wages / rev) * 10000) / 100 : 0,
        is_estimated: true,
        epos_pending: false,
      };
    });
  const rollingTotals = sumTotals(rollingStreams);

  // ── Spike detection ───────────────────────────────────────────────────────
  const accountHistory: Record<string, number[]> = {};
  const priorWeeks = allWeekDates.filter((d) => d < weekStartStr).slice(-4);
  for (const row of historicalRows || []) {
    if (!priorWeeks.includes(row.txn_date)) continue;
    const amt = row.debit > 0 ? row.debit : row.credit;
    if (!accountHistory[row.account_name]) accountHistory[row.account_name] = [];
    accountHistory[row.account_name].push(amt);
  }
  const spikes: any[] = [];
  for (const row of glRows) {
    const mapping = mappingByAccount[row.account_code];
    if (!mapping || mapping.cost_type !== "overhead") continue;
    const amount = row.debit > 0 ? row.debit : row.credit;
    const history = accountHistory[row.account_name] || [];
    if (history.length >= 2) {
      const avg = history.reduce((a, b) => a + b, 0) / history.length;
      const pctAbove = avg > 0 ? (amount - avg) / avg : 0;
      if (pctAbove > SPIKE_THRESHOLD) {
        spikes.push({
          account: row.account_name,
          amount: Math.round(amount * 100) / 100,
          avg: Math.round(avg * 100) / 100,
          pct_above: Math.round(pctAbove * 10000) / 100,
        });
      }
    }
  }

  // ── Trend data (8 weeks) ──────────────────────────────────────────────────
  const weeklyTotals: Record<string, { revenue: number; gross_margin: number; net_profit: number }> = {};
  for (const date of allWeekDates) weeklyTotals[date] = { revenue: 0, gross_margin: 0, net_profit: 0 };
  for (const row of historicalRows || []) {
    const mapping = mappingByAccount[row.account_code];
    if (!mapping || !weeklyTotals[row.txn_date]) continue;
    const amt = row.credit > 0 ? row.credit : row.debit;
    if (mapping.cost_type === "revenue") weeklyTotals[row.txn_date].revenue += amt;
    else if (mapping.cost_type === "cogs") weeklyTotals[row.txn_date].gross_margin -= amt;
    else if (mapping.cost_type === "overhead") weeklyTotals[row.txn_date].net_profit -= amt;
  }
  for (const date of allWeekDates) {
    weeklyTotals[date].gross_margin += weeklyTotals[date].revenue;
    weeklyTotals[date].net_profit += weeklyTotals[date].gross_margin;
  }

  // ── WoW + YoY comparisons ─────────────────────────────────────────────────
  const comparisons = {
    wow: {
      revenue: buildChange(totals.revenue, priorTotals.revenue),
      gross_margin_pct: priorTotals.gross_margin_pct
        ? Math.round((totals.gross_margin_pct - priorTotals.gross_margin_pct) * 100) / 100
        : null,
      net_profit_pct: priorTotals.net_profit_pct
        ? Math.round((totals.net_profit_pct - priorTotals.net_profit_pct) * 100) / 100
        : null,
      wage_pct: priorTotals.wage_pct_of_revenue
        ? Math.round((totals.wage_pct_of_revenue - priorTotals.wage_pct_of_revenue) * 100) / 100
        : null,
      has_data: (priorWeekRows || []).length > 0,
    },
    yoy: {
      revenue: buildChange(totals.revenue, yearAgoTotals.revenue),
      gross_margin_pct: yearAgoTotals.gross_margin_pct
        ? Math.round((totals.gross_margin_pct - yearAgoTotals.gross_margin_pct) * 100) / 100
        : null,
      net_profit_pct: yearAgoTotals.net_profit_pct
        ? Math.round((totals.net_profit_pct - yearAgoTotals.net_profit_pct) * 100) / 100
        : null,
      wage_pct: yearAgoTotals.wage_pct_of_revenue
        ? Math.round((totals.wage_pct_of_revenue - yearAgoTotals.wage_pct_of_revenue) * 100) / 100
        : null,
      has_data: (yearAgoRows || []).length > 0,
    },
    prior_week: priorTotals,
    year_ago: yearAgoTotals,
  };

  return NextResponse.json({
    week_start: weekStartStr,
    streams: streamResults,
    totals,
    rolling_avg: {
      streams: rollingStreams,
      totals: rollingTotals,
      weeks_included: weeksCount,
    },
    comparisons,
    opex: Object.values(opexLines).sort((a, b) => b.amount - a.amount),
    spikes: spikes.sort((a, b) => b.pct_above - a.pct_above),
    trend: allWeekDates.map((date) => ({
      week: date,
      revenue: Math.round(weeklyTotals[date].revenue * 100) / 100,
      gross_margin: Math.round(weeklyTotals[date].gross_margin * 100) / 100,
      net_profit: Math.round(weeklyTotals[date].net_profit * 100) / 100,
    })),
    is_estimated: streamResults.some((r) => r.is_estimated),
    epos_status: eposStatus,
    unmapped_accounts: unmappedAccounts || [],
    wage_basis: {
      type: "4_week_rolling_average",
      weekly_average: Math.round(weeklyWageAvg * 100) / 100,
      four_week_total: Math.round((wageRows || []).reduce((s, r) => s + (r.debit || 0), 0) * 100) / 100,
    },
  });
}
