// app/api/reports/weekly/route.ts
// Returns a full weekly report: stream P&L, opex breakdown, net profit,
// spend spike detection, and 8-week trend data.
// Route: /api/reports/weekly?week=2026-03-02
// Access: owner or viewer

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SPIKE_THRESHOLD = 0.25; // 25% above 4-week average

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
    const diff = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diff);
  }
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const { data: clientRecord } = await supabaseAdmin
    .from("clients").select("id").eq("owner_user_id", user.id).single();
  if (!clientRecord) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const clientId = clientRecord.id;

  // Current week GL rows
  const { data: glRows } = await supabaseAdmin
    .from("gl_transactions").select("*")
    .eq("client_id", clientId).eq("txn_date", weekStartStr);

  // 4-week rolling wage average
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21);
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0];

  const { data: wageRows } = await supabaseAdmin
    .from("gl_transactions").select("debit")
    .eq("client_id", clientId).eq("account_name", "Wages and Salaries")
    .gte("txn_date", fourWeeksAgoStr).lte("txn_date", weekStartStr);

  const rollingWageTotal = (wageRows || []).reduce((sum, r) => sum + (r.debit || 0), 0);
  const weeklyWageAvg = rollingWageTotal / 4;

  // 8 weeks of data for trends + spike baseline (8 weeks back)
  const eightWeeksAgo = new Date(weekStart);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 49);
  const eightWeeksAgoStr = eightWeeksAgo.toISOString().split("T")[0];

  const { data: historicalRows } = await supabaseAdmin
    .from("gl_transactions").select("*")
    .eq("client_id", clientId)
    .gte("txn_date", eightWeeksAgoStr)
    .lte("txn_date", weekStartStr);

  // Stream mappings + streams + allocation rules
  const { data: mappings } = await supabaseAdmin
    .from("stream_mappings").select("*, revenue_streams(name)").eq("client_id", clientId);
  const { data: streams } = await supabaseAdmin
    .from("revenue_streams").select("*").eq("client_id", clientId).order("sort_order");
  const { data: allocRules } = await supabaseAdmin
    .from("allocation_rules").select("*, revenue_streams(name)")
    .eq("client_id", clientId).lte("effective_from", weekStartStr)
    .or("effective_to.is.null,effective_to.gte." + weekStartStr);

  if (!glRows || !mappings || !streams || !allocRules) {
    return NextResponse.json({ error: "Data fetch failed" }, { status: 500 });
  }

  const mappingByAccount: Record<string, any> = {};
  for (const m of mappings) mappingByAccount[m.match_value] = m;

  // ── Stream P&L buckets ──────────────────────────────────────────────
  const result: Record<string, any> = {};
  for (const s of streams) {
    result[s.id] = { stream: s.name, revenue: 0, cogs: 0, wages: 0, overhead: 0, events: 0, is_estimated: false };
  }
  const sharedStream = streams.find((s) => s.name === "Shared");

  // ── Opex breakdown (account-level) ──────────────────────────────────
  const opexLines: Record<string, { name: string; amount: number }> = {};

  // ── Spike detection: build per-account 4-week averages ──────────────
  const accountHistory: Record<string, number[]> = {};
  const allWeekDates = [...new Set((historicalRows || []).map((r) => r.txn_date))].sort();
  const priorWeeks = allWeekDates.filter((d) => d < weekStartStr).slice(-4);

  for (const row of historicalRows || []) {
    if (!priorWeeks.includes(row.txn_date)) continue;
    const amt = row.debit > 0 ? row.debit : row.credit;
    if (!accountHistory[row.account_name]) accountHistory[row.account_name] = [];
    accountHistory[row.account_name].push(amt);
  }

  // ── 8-week trend data ────────────────────────────────────────────────
  const weeklyTotals: Record<string, { revenue: number; gross_margin: number; net_profit: number }> = {};
  for (const date of allWeekDates) {
    weeklyTotals[date] = { revenue: 0, gross_margin: 0, net_profit: 0 };
  }

  for (const row of historicalRows || []) {
    const mapping = mappingByAccount[row.account_code];
    if (!mapping || !weeklyTotals[row.txn_date]) continue;
    const amt = row.credit > 0 ? row.credit : row.debit;
    const costType = mapping.cost_type;
    if (costType === "revenue") weeklyTotals[row.txn_date].revenue += amt;
    else if (costType === "cogs") weeklyTotals[row.txn_date].gross_margin -= amt;
    else if (costType === "overhead") weeklyTotals[row.txn_date].net_profit -= amt;
  }
  for (const date of allWeekDates) {
    weeklyTotals[date].gross_margin += weeklyTotals[date].revenue;
    weeklyTotals[date].net_profit += weeklyTotals[date].gross_margin;
  }

  // ── Process current week GL rows ─────────────────────────────────────
  const spikes: { account: string; amount: number; avg: number; pct_above: number }[] = [];

  for (const row of glRows) {
    const mapping = mappingByAccount[row.account_code];
    if (!mapping) continue;

    const amount = row.credit > 0 ? row.credit : row.debit;
    const streamId = mapping.revenue_stream_id;
    const costType = mapping.cost_type;

    if (!result[streamId]) continue;

    if (costType === "revenue") {
      if (streamId === sharedStream?.id) {
        const splitRules = allocRules.filter((r) => r.rule_type === "retrofit_sales_split");
        for (const rule of splitRules) {
          if (result[rule.revenue_stream_id]) {
            result[rule.revenue_stream_id].revenue += amount * rule.percentage;
            result[rule.revenue_stream_id].is_estimated = true;
          }
        }
      } else {
        result[streamId].revenue += amount;
      }
    } else if (costType === "cogs") {
      // Artists/Events surfaced separately
      if (row.account_name.toLowerCase().includes("artist") || row.account_name.toLowerCase().includes("event")) {
        result[streamId].events += amount;
      } else {
        result[streamId].cogs += amount;
      }
    } else if (costType === "wages") {
      // handled via rolling average below
    } else if (costType === "overhead") {
      // Opex breakdown
      opexLines[row.account_name] = {
        name: row.account_name,
        amount: (opexLines[row.account_name]?.amount || 0) + amount,
      };
      // Spike detection
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
  }

  // Apply rolling wage average
  const wageRules = allocRules.filter((r) => r.rule_type === "wages");
  for (const rule of wageRules) {
    if (result[rule.revenue_stream_id]) {
      result[rule.revenue_stream_id].wages += weeklyWageAvg * rule.percentage;
      result[rule.revenue_stream_id].is_estimated = true;
    }
  }

  // ── Build stream results ─────────────────────────────────────────────
  const totalOpex = Object.values(opexLines).reduce((s, l) => s + l.amount, 0);
  const mainStreams = streams.filter((s) => s.name !== "Shared");
  const opexPerStream = mainStreams.length > 0 ? totalOpex / mainStreams.length : 0;

  const streamResults = Object.values(result)
    .filter((r) => r.stream !== "Shared")
    .map((r) => {
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
      };
    });

  const totals = streamResults.reduce(
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

  return NextResponse.json({
    week_start: weekStartStr,
    streams: streamResults,
    totals: {
      ...totals,
      gross_margin_pct: totals.revenue > 0 ? Math.round((totals.gross_margin / totals.revenue) * 10000) / 100 : 0,
      net_profit_pct: totals.revenue > 0 ? Math.round((totals.net_profit / totals.revenue) * 10000) / 100 : 0,
      wage_pct_of_revenue: totals.revenue > 0 ? Math.round((totals.wages / totals.revenue) * 10000) / 100 : 0,
    },
    opex: Object.values(opexLines).sort((a, b) => b.amount - a.amount),
    spikes: spikes.sort((a, b) => b.pct_above - a.pct_above),
    trend: allWeekDates.map((date) => ({
      week: date,
      ...weeklyTotals[date],
      revenue: Math.round(weeklyTotals[date].revenue * 100) / 100,
      gross_margin: Math.round(weeklyTotals[date].gross_margin * 100) / 100,
      net_profit: Math.round(weeklyTotals[date].net_profit * 100) / 100,
    })),
    is_estimated: streamResults.some((r) => r.is_estimated),
    wage_basis: {
      type: "4_week_rolling_average",
      weekly_average: Math.round(weeklyWageAvg * 100) / 100,
      four_week_total: Math.round(rollingWageTotal * 100) / 100,
    },
  });
}
