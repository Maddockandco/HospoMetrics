// app/api/reports/weekly/route.ts
// Returns a weekly P&L report broken down by revenue stream,
// applying stream mappings and allocation rules from Supabase.
// Route: /api/reports/weekly?week=2026-03-02
// Access: owner or viewer

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get week start from query param, default to current week Monday
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

  // Get client for this user
  const { data: clientRecord } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (!clientRecord) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const clientId = clientRecord.id;

  // Fetch all GL rows for this week
  const { data: glRows } = await supabaseAdmin
    .from("gl_transactions")
    .select("*")
    .eq("client_id", clientId)
    .eq("txn_date", weekStartStr);

  // Fetch 4-week rolling wage total (current week + 3 prior weeks)
  // Used to smooth bi-weekly payroll bumps into a meaningful weekly average
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21);
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0];

  const { data: wageRows } = await supabaseAdmin
    .from("gl_transactions")
    .select("debit")
    .eq("client_id", clientId)
    .eq("account_name", "Wages and Salaries")
    .gte("txn_date", fourWeeksAgoStr)
    .lte("txn_date", weekStartStr);

  const rollingWageTotal = (wageRows || []).reduce((sum, r) => sum + (r.debit || 0), 0);
  const weeklyWageAvg = rollingWageTotal / 4;

  // Fetch stream mappings
  const { data: mappings } = await supabaseAdmin
    .from("stream_mappings")
    .select("*, revenue_streams(name)")
    .eq("client_id", clientId);

  // Fetch revenue streams
  const { data: streams } = await supabaseAdmin
    .from("revenue_streams")
    .select("*")
    .eq("client_id", clientId)
    .order("sort_order");

  // Fetch allocation rules active for this week
  const { data: allocRules } = await supabaseAdmin
    .from("allocation_rules")
    .select("*, revenue_streams(name)")
    .eq("client_id", clientId)
    .lte("effective_from", weekStartStr)
    .or("effective_to.is.null,effective_to.gte." + weekStartStr);

  if (!glRows || !mappings || !streams || !allocRules) {
    return NextResponse.json({ error: "Data fetch failed" }, { status: 500 });
  }

  // Build a lookup: account_code -> mapping
  const mappingByAccount: Record<string, any> = {};
  for (const m of mappings) {
    mappingByAccount[m.match_value] = m;
  }

  // Initialise result buckets per stream
  const result: Record<string, {
    stream: string;
    revenue: number;
    cogs: number;
    wages: number;
    overhead: number;
    gross_margin: number;
    is_estimated: boolean;
  }> = {};

  for (const stream of streams) {
    result[stream.id] = {
      stream: stream.name,
      revenue: 0,
      cogs: 0,
      wages: 0,
      overhead: 0,
      gross_margin: 0,
      is_estimated: false,
    };
  }

  // Find the "Shared" stream for allocation
  const sharedStream = streams.find((s) => s.name === "Shared");

  // Process each GL row
  for (const row of glRows) {
    const mapping = mappingByAccount[row.account_code];
    if (!mapping) continue;

    const amount = row.credit > 0 ? row.credit : row.debit;
    const streamId = mapping.revenue_stream_id;
    const costType = mapping.cost_type;

    if (!result[streamId]) continue;

    if (costType === "revenue") {
      if (streamId === sharedStream?.id) {
        // Split lumped Bar+Restaurant revenue using allocation rules
        const splitRules = allocRules.filter(
          (r) => r.rule_type === "retrofit_sales_split"
        );
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
      result[streamId].cogs += amount;
    } else if (costType === "wages") {
      // Use 4-week rolling average wage instead of raw weekly figure
      // to smooth bi-weekly payroll bumps (applies once, not per row)
      // We handle this after the loop below
    } else if (costType === "overhead") {
      // Shared overhead — split equally across non-shared streams
      const mainStreams = streams.filter((s) => s.name !== "Shared");
      const share = amount / mainStreams.length;
      for (const s of mainStreams) {
        result[s.id].overhead += share;
      }
    }
  }

  // Apply 4-week rolling wage average across streams using allocation rules
  const wageRules = allocRules.filter((r) => r.rule_type === "wages");
  for (const rule of wageRules) {
    if (result[rule.revenue_stream_id]) {
      result[rule.revenue_stream_id].wages += weeklyWageAvg * rule.percentage;
      result[rule.revenue_stream_id].is_estimated = true;
    }
  }

  // Calculate gross margin per stream
  // Gross margin = Revenue - COGS - Wages (overhead excluded from gross)
  const streamResults = Object.values(result)
    .filter((r) => r.stream !== "Shared")
    .map((r) => ({
      ...r,
      cogs: Math.round(r.cogs * 100) / 100,
      wages: Math.round(r.wages * 100) / 100,
      overhead: Math.round(r.overhead * 100) / 100,
      revenue: Math.round(r.revenue * 100) / 100,
      gross_margin: Math.round((r.revenue - r.cogs - r.wages) * 100) / 100,
      gross_margin_pct:
        r.revenue > 0
          ? Math.round(((r.revenue - r.cogs - r.wages) / r.revenue) * 10000) / 100
          : 0,
      wage_pct_of_revenue:
        r.revenue > 0
          ? Math.round((r.wages / r.revenue) * 10000) / 100
          : 0,
    }));

  // Totals across all streams
  const totals = streamResults.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cogs: acc.cogs + r.cogs,
      wages: acc.wages + r.wages,
      overhead: acc.overhead + r.overhead,
      gross_margin: acc.gross_margin + r.gross_margin,
    }),
    { revenue: 0, cogs: 0, wages: 0, overhead: 0, gross_margin: 0 }
  );

  return NextResponse.json({
    week_start: weekStartStr,
    streams: streamResults,
    totals: {
      ...totals,
      gross_margin_pct:
        totals.revenue > 0
          ? Math.round((totals.gross_margin / totals.revenue) * 10000) / 100
          : 0,
      wage_pct_of_revenue:
        totals.revenue > 0
          ? Math.round((totals.wages / totals.revenue) * 10000) / 100
          : 0,
    },
    is_estimated: streamResults.some((r) => r.is_estimated),
    wage_basis: {
      type: "4_week_rolling_average",
      weekly_average: Math.round(weeklyWageAvg * 100) / 100,
      four_week_total: Math.round(rollingWageTotal * 100) / 100,
    },
  });
}
