// app/api/reports/monthly/route.ts
// Returns a monthly P&L report for a given month, handling both:
//   - Pre-Nov 2025: monthly lump revenue rows (source_granularity = 'monthly')
//   - Nov 2025+: weekly rows aggregated to monthly totals
// Route: /api/reports/monthly?month=2025-07
// Access: owner or viewer

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function toStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getMonthRange(monthStr: string): { start: string; end: string } {
  const [year, month] = monthStr.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  return { start: toStr(start), end: toStr(end) };
}

function buildMonthStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month") || buildMonthStr(new Date());
  const { start: monthStart, end: monthEnd } = getMonthRange(monthParam);

  // Year-ago comparison
  const [year, month] = monthParam.split("-").map(Number);
  const yearAgoMonth = buildMonthStr(new Date(year - 1, month - 1, 1));
  const { start: yoyStart, end: yoyEnd } = getMonthRange(yearAgoMonth);

  const { data: clientUserRecord } = await supabaseAdmin
    .from("client_users").select("client_id, role").eq("user_id", user.id).single();
  if (!clientUserRecord) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const clientId = clientUserRecord.client_id;

  // Fetch current month, year-ago month, and all months for seasonal trend
  const [
    { data: monthRows },
    { data: yoyRows },
    { data: allRows },
    { data: mappings },
    { data: streams },
    { data: allocRules },
  ] = await Promise.all([
    supabaseAdmin.from("gl_transactions").select("*")
      .eq("client_id", clientId).gte("txn_date", monthStart).lte("txn_date", monthEnd),
    supabaseAdmin.from("gl_transactions").select("*")
      .eq("client_id", clientId).gte("txn_date", yoyStart).lte("txn_date", yoyEnd),
    // All history for seasonal trend (monthly rollups)
    supabaseAdmin.from("gl_transactions").select("txn_date, account_code, account_name, credit, debit, source_granularity")
      .eq("client_id", clientId).order("txn_date"),
    supabaseAdmin.from("stream_mappings").select("*, revenue_streams(name)").eq("client_id", clientId),
    supabaseAdmin.from("revenue_streams").select("*").eq("client_id", clientId).order("sort_order"),
    supabaseAdmin.from("allocation_rules").select("*, revenue_streams(name)")
      .eq("client_id", clientId).lte("effective_from", monthStart)
      .or("effective_to.is.null,effective_to.gte." + monthStart),
  ]);

  if (!monthRows || !mappings || !streams || !allocRules) {
    return NextResponse.json({ error: "Data fetch failed" }, { status: 500 });
  }

  const mappingByAccount: Record<string, any> = {};
  for (const m of mappings) mappingByAccount[m.match_value] = m;

  const sharedStream = streams.find((s: any) => s.name === "Shared");
  const mainStreams = streams.filter((s: any) => s.name !== "Shared");

  // ── Aggregate monthly rows into stream buckets ────────────────────────
  function aggregateMonth(rows: any[], rulesForPeriod: any[]) {
    const buckets: Record<string, any> = {};
    for (const s of streams) {
      buckets[s.id] = { stream: s.name, revenue: 0, cogs: 0, wages: 0, events: 0, overhead: 0, is_estimated: false };
    }

    const opexLines: Record<string, number> = {};
    let totalWages = 0;

    for (const row of rows) {
      const mapping = mappingByAccount[row.account_code];
      if (!mapping) continue;
      const amount = row.credit > 0 ? row.credit : row.debit;
      const streamId = mapping.revenue_stream_id;
      const costType = mapping.cost_type;
      if (!buckets[streamId]) continue;

      if (costType === "revenue") {
        if (streamId === sharedStream?.id) {
          const splitRules = rulesForPeriod.filter((r: any) => r.rule_type === "retrofit_sales_split");
          for (const rule of splitRules) {
            if (buckets[rule.revenue_stream_id]) {
              buckets[rule.revenue_stream_id].revenue += amount * rule.percentage;
              buckets[rule.revenue_stream_id].is_estimated = true;
            }
          }
        } else {
          buckets[streamId].revenue += amount;
        }
      } else if (costType === "cogs") {
        if (row.account_name.toLowerCase().includes("artist") || row.account_name.toLowerCase().includes("event")) {
          buckets[streamId].events += amount;
        } else {
          buckets[streamId].cogs += amount;
        }
      } else if (costType === "wages") {
        totalWages += amount;
      } else if (costType === "overhead") {
        opexLines[row.account_name] = (opexLines[row.account_name] || 0) + amount;
      }
    }

    // Apply wage allocation rules to monthly total
    const wageRules = rulesForPeriod.filter((r: any) => r.rule_type === "wages");
    for (const rule of wageRules) {
      if (buckets[rule.revenue_stream_id]) {
        buckets[rule.revenue_stream_id].wages += totalWages * rule.percentage;
        buckets[rule.revenue_stream_id].is_estimated = true;
      }
    }

    const totalOpex = Object.values(opexLines).reduce((s: number, v: any) => s + v, 0);
    const opexPerStream = mainStreams.length > 0 ? totalOpex / mainStreams.length : 0;

    const streamResults = Object.values(buckets)
      .filter((r: any) => r.stream !== "Shared")
      .map((r: any) => {
        const gm = r.revenue - r.cogs - r.wages - r.events;
        const np = gm - opexPerStream;
        return {
          stream: r.stream,
          revenue: Math.round(r.revenue * 100) / 100,
          cogs: Math.round(r.cogs * 100) / 100,
          wages: Math.round(r.wages * 100) / 100,
          events: Math.round(r.events * 100) / 100,
          overhead: Math.round(opexPerStream * 100) / 100,
          gross_margin: Math.round(gm * 100) / 100,
          gross_margin_pct: r.revenue > 0 ? Math.round((gm / r.revenue) * 10000) / 100 : 0,
          net_profit: Math.round(np * 100) / 100,
          net_profit_pct: r.revenue > 0 ? Math.round((np / r.revenue) * 10000) / 100 : 0,
          wage_pct_of_revenue: r.revenue > 0 ? Math.round((r.wages / r.revenue) * 10000) / 100 : 0,
          is_estimated: r.is_estimated,
        };
      });

    const totals = streamResults.reduce(
      (acc: any, r: any) => ({
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
      streams: streamResults,
      totals: {
        ...totals,
        gross_margin_pct: totals.revenue > 0 ? Math.round((totals.gross_margin / totals.revenue) * 10000) / 100 : 0,
        net_profit_pct: totals.revenue > 0 ? Math.round((totals.net_profit / totals.revenue) * 10000) / 100 : 0,
        wage_pct_of_revenue: totals.revenue > 0 ? Math.round((totals.wages / totals.revenue) * 10000) / 100 : 0,
      },
      opex: Object.entries(opexLines)
        .map(([name, amount]) => ({ name, amount: Math.round((amount as number) * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount),
      total_wages: totalWages,
    };
  }

  const currentMonth = aggregateMonth(monthRows, allocRules);
  const yearAgoMonthData = aggregateMonth(yoyRows || [], allocRules);
  const hasYoyData = (yoyRows || []).length > 0;

  // ── Build seasonal trend (monthly rollup of all history) ──────────────
  // Group all rows by calendar month
  const monthlyBuckets: Record<string, any[]> = {};
  for (const row of allRows || []) {
    const d = new Date(row.txn_date);
    const key = buildMonthStr(d);
    if (!monthlyBuckets[key]) monthlyBuckets[key] = [];
    monthlyBuckets[key].push(row);
  }

  const seasonalTrend = Object.entries(monthlyBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rows]) => {
      let revenue = 0, grossMargin = 0, netProfit = 0, wages = 0;
      const opexTotal = { total: 0 };
      for (const row of rows) {
        const mapping = mappingByAccount[row.account_code];
        if (!mapping) continue;
        const amt = row.credit > 0 ? row.credit : row.debit;
        if (mapping.cost_type === "revenue") revenue += amt;
        else if (mapping.cost_type === "cogs") grossMargin -= amt;
        else if (mapping.cost_type === "wages") wages += amt;
        else if (mapping.cost_type === "overhead") { opexTotal.total += amt; netProfit -= amt; }
      }
      grossMargin += revenue;
      netProfit += grossMargin;
      const isMonthlyLump = rows.some((r: any) => r.source_granularity === "monthly");
      return {
        month,
        revenue: Math.round(revenue * 100) / 100,
        gross_margin: Math.round(grossMargin * 100) / 100,
        gross_margin_pct: revenue > 0 ? Math.round((grossMargin / revenue) * 10000) / 100 : 0,
        net_profit: Math.round(netProfit * 100) / 100,
        wages: Math.round(wages * 100) / 100,
        is_monthly_lump: isMonthlyLump,
      };
    });

  // ── YoY comparison ────────────────────────────────────────────────────
  const yoy = hasYoyData ? {
    has_data: true,
    revenue: yearAgoMonthData.totals.revenue > 0
      ? Math.round(((currentMonth.totals.revenue - yearAgoMonthData.totals.revenue) / yearAgoMonthData.totals.revenue) * 10000) / 100
      : null,
    gross_margin_pct: yearAgoMonthData.totals.gross_margin_pct
      ? Math.round((currentMonth.totals.gross_margin_pct - yearAgoMonthData.totals.gross_margin_pct) * 100) / 100
      : null,
    net_profit_pct: yearAgoMonthData.totals.net_profit_pct
      ? Math.round((currentMonth.totals.net_profit_pct - yearAgoMonthData.totals.net_profit_pct) * 100) / 100
      : null,
    year_ago_totals: yearAgoMonthData.totals,
    year_ago_streams: yearAgoMonthData.streams,
  } : { has_data: false };

  // Determine data quality for this month
  const isMonthlyLump = (monthRows || []).some((r: any) => r.source_granularity === "monthly");

  return NextResponse.json({
    month: monthParam,
    month_start: monthStart,
    month_end: monthEnd,
    streams: currentMonth.streams,
    totals: currentMonth.totals,
    opex: currentMonth.opex,
    yoy,
    seasonal_trend: seasonalTrend,
    data_quality: {
      is_monthly_lump: isMonthlyLump,
      note: isMonthlyLump
        ? "Revenue figures for this month were entered as a single monthly total in Xero — weekly breakdown not available."
        : "Revenue figures are from weekly Xero entries.",
    },
  });
}
