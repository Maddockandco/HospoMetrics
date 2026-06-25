"use client";

// 📁 app/dashboard/page.tsx

import { useState, useEffect, useCallback } from "react";
import DailyCashUp from "@/components/DailyCashUp";

// ── Types ────────────────────────────────────────────────────────────────────
interface StreamData {
  stream: string; revenue: number; cogs: number; wages: number; events: number;
  overhead: number; gross_margin: number; gross_margin_pct: number;
  net_profit: number; net_profit_pct: number; wage_pct_of_revenue: number; is_estimated: boolean; epos_pending?: boolean;
}
interface OpexLine { name: string; amount: number; }
interface Spike { account: string; amount: number; avg: number; pct_above: number; }
interface TrendPoint { week: string; revenue: number; gross_margin: number; net_profit: number; }
interface Totals {
  revenue: number; cogs: number; wages: number; events: number; overhead: number;
  gross_margin: number; gross_margin_pct: number; net_profit: number; net_profit_pct: number; wage_pct_of_revenue: number;
}
interface Comparisons {
  wow: { revenue: number | null; gross_margin_pct: number | null; net_profit_pct: number | null; wage_pct: number | null; has_data: boolean };
  yoy: { revenue: number | null; gross_margin_pct: number | null; net_profit_pct: number | null; wage_pct: number | null; has_data: boolean };
  prior_week: Totals;
  year_ago: Totals;
}
interface WeeklyReport {
  week_start: string; streams: StreamData[]; totals: Totals;
  rolling_avg: { streams: StreamData[]; totals: Totals; weeks_included: number };
  comparisons: Comparisons;
  opex: OpexLine[]; spikes: Spike[]; trend: TrendPoint[];
  unmapped_accounts: { account_code: string; account_name: string; section: string; first_seen_date: string }[];
  is_estimated: boolean;
  wage_basis: { type: string; weekly_average: number; four_week_total: number };
}

const STREAM_COLORS: Record<string, string> = { Bar: "#e8a838", Restaurant: "#e07b4a", Hotel: "#5b8fa8" };
const NAV = ["Weekly", "Monthly", "Trends", "Alerts", "Cash Up"] as const;
type NavItem = typeof NAV[number];

const TOOLTIPS: Record<string, string> = {
  revenue: "Total sales income for this stream during the week, before any costs are deducted.",
  cogs: "Cost of Goods Sold — the direct cost of products sold. Bar = wet stock (drinks), Restaurant = dry stock (food).",
  wages: "Staff wage cost allocated to this stream, shown as a 4-week rolling average to smooth bi-weekly payroll.",
  events: "Direct costs for artists, live events, and entertainment — shown separately as a discretionary cost that drives bar revenue.",
  overhead: "Operating expenses (cleaning, utilities, repairs, IT, etc.) shared equally across all three revenue streams.",
  gross_margin: "Revenue minus COGS and wages. Industry hospitality benchmark is typically 15–25%.",
  gross_margin_pct: "Gross profit as a percentage of revenue. Higher = more of each £1 retained after direct costs.",
  net_profit: "Revenue minus all costs including operating expenses. The true bottom line.",
  net_profit_pct: "Net profit as a percentage of revenue. Positive = profitable after all costs.",
  wage_pct: "Wages as % of revenue. Hospitality benchmark 25–35%. Above 40% is a warning sign.",
  total_revenue: "Combined revenue across all three streams for this week.",
  total_cogs: "Total direct cost of goods across all streams.",
  total_wages: "Total wage cost shown as a 4-week rolling average to account for bi-weekly payroll.",
  total_events: "Total events and entertainment costs across all streams.",
  gross_margin_total: "Overall gross margin percentage across the business this week.",
  net_profit_total: "Overall net profit percentage across the entire business this week.",
  revenue_bar: "Bar length shows this stream's revenue relative to the highest-earning stream this week.",
  wage_bar: "Bar shows wage cost as % of revenue. Green = within target, Red = above 40%.",
  opex: "Operating expenses that apply to the whole business — split equally across Bar, Restaurant and Hotel.",
  spike: "This cost is more than 25% above its 4-week average. Could be a one-off or the start of a trend.",
  rolling_avg: "4-week rolling average smooths out one-off spikes in stock deliveries, payroll timing, and irregular costs — giving a more representative view of the underlying business performance.",
  wow: "Week-on-week change: how this week compares to the same metrics last week.",
  yoy: "Year-on-year change: how this week compares to the equivalent week 52 weeks ago. Shows seasonal trends and underlying growth.",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const fmtChange = (n: number | null) => n === null ? "–" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${d.toLocaleDateString("en-GB", o)} – ${end.toLocaleDateString("en-GB", o)}`;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div style={{ display: "inline-flex", alignItems: "center", cursor: "help" }}
      onMouseEnter={(e) => { setVisible(true); setPos({ x: e.clientX, y: e.clientY }); }}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div style={{ position: "fixed", left: pos.x + 12, top: pos.y - 8, zIndex: 9999, background: "#1e2535", border: "1px solid #3d4a63", borderRadius: 8, padding: "10px 14px", maxWidth: 280, fontSize: 12, color: "#c0cce0", lineHeight: 1.5, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", pointerEvents: "none" }}>
          {text}
        </div>
      )}
    </div>
  );
}

function InfoIcon() {
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 13, height: 13, borderRadius: "50%", background: "#252d3d", color: "#6b7a99", fontSize: 8, fontWeight: 700, marginLeft: 5, flexShrink: 0 }}>?</span>;
}
function TipLabel({ label, tipKey }: { label: string; tipKey: string }) {
  return <Tooltip text={TOOLTIPS[tipKey] || label}><span style={{ display: "inline-flex", alignItems: "center" }}>{label}<InfoIcon /></span></Tooltip>;
}

// ── UI primitives ─────────────────────────────────────────────────────────────
function Bar({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  const w = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div style={{ background: "#1a1f2e", borderRadius: 4, height, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
    </div>
  );
}

function StatPill({ value, positive }: { value: number; positive?: boolean }) {
  const isPos = positive !== undefined ? positive : value >= 0;
  return <span style={{ background: isPos ? "#1a2e1a" : "#2e1a1a", color: isPos ? "#4caf78" : "#e05555", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 600 }}>{fmtPct(value)}</span>;
}

function ChangeBadge({ value, label, tip }: { value: number | null; label: string; tip: string }) {
  if (value === null) return <span style={{ fontSize: 10, color: "#4a5a7a" }}>{label}: –</span>;
  const isPos = value >= 0;
  return (
    <Tooltip text={tip}>
      <span style={{ fontSize: 10, color: isPos ? "#4caf78" : "#e05555", display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}: {isPos ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
      </span>
    </Tooltip>
  );
}

function MiniSparkline({ data, field, color }: { data: TrendPoint[]; field: keyof TrendPoint; color: string }) {
  if (data.length < 2) return null;
  const values = data.map((d) => d[field] as number);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 120, H = 36, pad = 4;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = points.split(" ").slice(-1)[0].split(",");
  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

// ── Stream Card ───────────────────────────────────────────────────────────────
function StreamCard({ data, maxRevenue, isRolling }: { data: StreamData; maxRevenue: number; isRolling: boolean }) {
  const color = STREAM_COLORS[data.stream] || "#888";
  return (
    <div style={{ background: "#141824", border: "1px solid #252d3d", borderTop: `3px solid ${color}`, borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, color: "#6b7a99", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
            {data.stream}
            {data.is_estimated && !data.epos_pending && <span style={{ background: "#2a2f42", color: "#8892a8", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>est.</span>}
            {data.epos_pending && <span style={{ background: "#2e1a1a", color: "#e05555", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>EPOS pending</span>}
            {isRolling && <span style={{ background: "#1a2535", color: "#5b8fa8", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>4wk avg</span>}
          </div>
          <Tooltip text={data.epos_pending ? "Revenue hidden until EPOS CSV is uploaded and reconciled for this week." : TOOLTIPS.revenue}>
            <div style={{ fontSize: data.epos_pending ? 14 : 26, fontWeight: 700, color: data.epos_pending ? "#e05555" : "#f0f4ff", letterSpacing: "-0.02em", cursor: "help", marginTop: data.epos_pending ? 4 : 0 }}>
              {data.epos_pending ? "Awaiting EPOS upload" : fmt(data.revenue)}
            </div>
          </Tooltip>
          <div style={{ fontSize: 10, color: "#6b7a99", marginTop: 1 }}>revenue</div>
        </div>
        <Tooltip text={TOOLTIPS.gross_margin_pct}>
          <div style={{ textAlign: "right", cursor: "help" }}>
            <StatPill value={data.gross_margin_pct} />
            <div style={{ fontSize: 9, color: "#6b7a99", marginTop: 3 }}>gross margin</div>
          </div>
        </Tooltip>
      </div>
      <Tooltip text={TOOLTIPS.revenue_bar}><div style={{ width: "100%", cursor: "help" }}><Bar value={data.revenue} max={maxRevenue} color={color} height={5} /></div></Tooltip>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "COGS", value: data.cogs, color: "#e07b4a", tipKey: "cogs" },
          { label: "Wages", value: data.wages, color: "#e8a838", tipKey: "wages" },
          { label: "Events", value: data.events, color: "#9b6fd4", tipKey: "events" },
          { label: "Overhead", value: data.overhead, color: "#4a5a7a", tipKey: "overhead" },
          { label: "Gross Profit", value: data.gross_margin, color: data.gross_margin >= 0 ? "#4caf78" : "#e05555", tipKey: "gross_margin" },
          { label: "Net Profit", value: data.net_profit, color: data.net_profit >= 0 ? "#4caf78" : "#e05555", tipKey: "net_profit" },
        ].map(({ label, value, color: c, tipKey }) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}><TipLabel label={label} tipKey={tipKey} /></div>
            <div style={{ fontSize: 13, fontWeight: 600, color: c }}>{fmt(value)}</div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #1e2535", paddingTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 9, color: "#6b7a99" }}><TipLabel label="Wage % of Revenue" tipKey="wage_pct" /></span>
          <span style={{ fontSize: 11, fontWeight: 600, color: data.wage_pct_of_revenue > 40 ? "#e05555" : "#4caf78" }}>{data.wage_pct_of_revenue.toFixed(1)}%</span>
        </div>
        <Tooltip text={TOOLTIPS.wage_bar}><div style={{ width: "100%", cursor: "help" }}><Bar value={data.wage_pct_of_revenue} max={100} color={data.wage_pct_of_revenue > 40 ? "#e05555" : "#4caf78"} height={5} /></div></Tooltip>
      </div>
    </div>
  );
}

// ── Weekly View ───────────────────────────────────────────────────────────────
function WeeklyView({ report, showRolling }: { report: WeeklyReport; showRolling: boolean }) {
  const streams = showRolling ? report.rolling_avg.streams : report.streams;
  const totals = showRolling ? report.rolling_avg.totals : report.totals;
  const maxRevenue = Math.max(...streams.map((s) => s.revenue));
  const { wow, yoy } = report.comparisons;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>


      {/* Comparisons strip */}
      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: "14px 20px", display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em" }}>Comparisons</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Tooltip text={TOOLTIPS.wow}>
            <div style={{ cursor: "help" }}>
              <div style={{ fontSize: 9, color: "#4a5a7a", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>vs Last Week</div>
              {!wow.has_data ? (
                <span style={{ fontSize: 11, color: "#4a5a7a" }}>No prior week data</span>
              ) : (
                <div style={{ display: "flex", gap: 12 }}>
                  <ChangeBadge value={wow.revenue} label="Revenue" tip={TOOLTIPS.wow} />
                  <ChangeBadge value={wow.gross_margin_pct} label="GM" tip={TOOLTIPS.wow} />
                  <ChangeBadge value={wow.net_profit_pct} label="NP" tip={TOOLTIPS.wow} />
                  <ChangeBadge value={wow.wage_pct !== null ? -wow.wage_pct : null} label="Wage%" tip="Negative = wage % improved (lower relative to revenue)" />
                </div>
              )}
            </div>
          </Tooltip>
          <div style={{ width: 1, background: "#1e2535" }} />
          <Tooltip text={TOOLTIPS.yoy}>
            <div style={{ cursor: "help" }}>
              <div style={{ fontSize: 9, color: "#4a5a7a", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>vs Same Week Last Year</div>
              {!yoy.has_data ? (
                <span style={{ fontSize: 11, color: "#4a5a7a" }}>No year-ago data yet — available from May 2026</span>
              ) : (
                <div style={{ display: "flex", gap: 12 }}>
                  <ChangeBadge value={yoy.revenue} label="Revenue" tip={TOOLTIPS.yoy} />
                  <ChangeBadge value={yoy.gross_margin_pct} label="GM" tip={TOOLTIPS.yoy} />
                  <ChangeBadge value={yoy.net_profit_pct} label="NP" tip={TOOLTIPS.yoy} />
                  <ChangeBadge value={yoy.wage_pct !== null ? -yoy.wage_pct : null} label="Wage%" tip="Negative = wage % improved year-on-year" />
                </div>
              )}
            </div>
          </Tooltip>
        </div>
      </div>

      {/* Totals strip */}
      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        {[
          { label: "Revenue", value: fmt(totals.revenue), color: "#f0f4ff", tipKey: "total_revenue" },
          { label: "COGS", value: fmt(totals.cogs), color: "#e07b4a", tipKey: "total_cogs" },
          { label: "Wages (avg)", value: fmt(totals.wages), sub: `${totals.wage_pct_of_revenue.toFixed(1)}% of rev`, color: totals.wage_pct_of_revenue > 40 ? "#e05555" : "#e8a838", tipKey: "total_wages" },
          { label: "Events", value: fmt(totals.events), color: "#9b6fd4", tipKey: "total_events" },
          { label: "Gross Margin", value: `${totals.gross_margin_pct.toFixed(1)}%`, sub: fmt(totals.gross_margin), color: totals.gross_margin_pct >= 0 ? "#4caf78" : "#e05555", tipKey: "gross_margin_total" },
          { label: "Net Profit", value: `${totals.net_profit_pct.toFixed(1)}%`, sub: fmt(totals.net_profit), color: totals.net_profit >= 0 ? "#4caf78" : "#e05555", tipKey: "net_profit_total" },
        ].map(({ label, value, sub, color, tipKey }) => (
          <Tooltip key={label} text={TOOLTIPS[tipKey] || label}>
            <div style={{ textAlign: "center", cursor: "help", width: "100%" }}>
              <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>{label}<InfoIcon /></div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
              {sub && <div style={{ fontSize: 10, color: "#6b7a99", marginTop: 2 }}>{sub}</div>}
            </div>
          </Tooltip>
        ))}
      </div>

      {/* Stream cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {streams.map((s) => <StreamCard key={s.stream} data={s} maxRevenue={maxRevenue} isRolling={showRolling} />)}
      </div>

      {/* Cost breakdown */}
      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>Cost Breakdown vs Revenue</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {streams.map((s) => {
            const t = s.revenue || 1;
            const cogsW = (s.cogs / t) * 100;
            const wagesW = (s.wages / t) * 100;
            const eventsW = (s.events / t) * 100;
            const overheadW = (s.overhead / t) * 100;
            const profitW = Math.max(0, 100 - cogsW - wagesW - eventsW - overheadW);
            return (
              <div key={s.stream}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#8892a8" }}>{s.stream}</span>
                  <span style={{ fontSize: 11, color: "#6b7a99" }}>{fmt(s.revenue)}</span>
                </div>
                <Tooltip text="Each segment shows what proportion of revenue is consumed by that cost. Green = net profit.">
                  <div style={{ display: "flex", height: 20, borderRadius: 5, overflow: "hidden", gap: 1, width: "100%", cursor: "help" }}>
                    <div style={{ width: `${cogsW}%`, background: "#e07b4a" }} />
                    <div style={{ width: `${wagesW}%`, background: "#e8a838" }} />
                    <div style={{ width: `${eventsW}%`, background: "#9b6fd4" }} />
                    <div style={{ width: `${overheadW}%`, background: "#3d4a63" }} />
                    <div style={{ width: `${profitW}%`, background: "#4caf78" }} />
                  </div>
                </Tooltip>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
          {[["COGS","#e07b4a"],["Wages","#e8a838"],["Events","#9b6fd4"],["Overhead","#3d4a63"],["Net Profit","#4caf78"]].map(([l,c])=>(
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 10, color: "#6b7a99" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Opex */}
      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}><TipLabel label="Operating Expenses" tipKey="opex" /></div>
        <div style={{ fontSize: 11, color: "#4a5a7a", marginBottom: 16 }}>Shared across all streams equally</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {report.opex.map((line) => (
            <div key={line.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, fontSize: 12, color: "#8892a8" }}>{line.name}</div>
              <div style={{ width: 200 }}><Bar value={line.amount} max={Math.max(...report.opex.map(o => o.amount))} color="#4a5a7a" height={5} /></div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f0f4ff", minWidth: 70, textAlign: "right" }}>{fmt(line.amount)}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #252d3d", paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "#6b7a99" }}>Total Opex</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f4ff" }}>{fmt(report.opex.reduce((s,l)=>s+l.amount,0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trends View ───────────────────────────────────────────────────────────────
function TrendsView({ report }: { report: WeeklyReport }) {
  const trend = report.trend.slice(-8);
  if (trend.length < 2) return <div style={{ color: "#6b7a99", padding: 40, textAlign: "center" }}>Not enough data yet.</div>;
  const maxRev = Math.max(...trend.map(t => t.revenue));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "Revenue Trend", field: "revenue" as const, color: "#5b8fa8", tip: "Total weekly revenue over the last 8 weeks." },
          { label: "Gross Margin Trend", field: "gross_margin" as const, color: "#4caf78", tip: "Gross profit over 8 weeks. Shows whether cost control is improving." },
          { label: "Net Profit Trend", field: "net_profit" as const, color: "#e8a838", tip: "Bottom-line profit after all costs over 8 weeks." },
        ].map(({ label, field, color, tip }) => {
          const latest = trend[trend.length - 1][field];
          const prev = trend[trend.length - 2][field];
          const change = prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : 0;
          return (
            <Tooltip key={label} text={tip}>
              <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 20, cursor: "help", width: "100%" }}>
                <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#f0f4ff" }}>{fmt(latest)}</div>
                    <StatPill value={change} />
                    <span style={{ fontSize: 10, color: "#6b7a99", marginLeft: 6 }}>vs prior week</span>
                  </div>
                  <MiniSparkline data={trend} field={field} color={color} />
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>

      {report.comparisons.yoy.has_data && (
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: "16px 24px" }}>
          <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            <TipLabel label="Year-on-Year Comparison" tipKey="yoy" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {[
              { label: "Revenue", current: fmt(report.totals.revenue), yago: fmt(report.comparisons.year_ago.revenue), change: report.comparisons.yoy.revenue },
              { label: "Gross Margin %", current: `${report.totals.gross_margin_pct.toFixed(1)}%`, yago: `${report.comparisons.year_ago.gross_margin_pct.toFixed(1)}%`, change: report.comparisons.yoy.gross_margin_pct },
              { label: "Net Profit %", current: `${report.totals.net_profit_pct.toFixed(1)}%`, yago: `${report.comparisons.year_ago.net_profit_pct.toFixed(1)}%`, change: report.comparisons.yoy.net_profit_pct },
              { label: "Wage %", current: `${report.totals.wage_pct_of_revenue.toFixed(1)}%`, yago: `${report.comparisons.year_ago.wage_pct_of_revenue.toFixed(1)}%`, change: report.comparisons.yoy.wage_pct !== null ? -report.comparisons.yoy.wage_pct : null },
            ].map(({ label, current, yago, change }) => (
              <div key={label} style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f4ff", marginBottom: 4 }}>{current}</div>
                <div style={{ fontSize: 11, color: "#4a5a7a", marginBottom: 6 }}>Year ago: {yago}</div>
                {change !== null && <StatPill value={change} />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>8-Week History</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Week","Revenue","Gross Margin","GM %","Net Profit","NP %"].map(h => (
                <th key={h} style={{ textAlign: h === "Week" ? "left" : "right", fontSize: 9, color: "#6b7a99", textTransform: "uppercase", paddingBottom: 10, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trend.map((row) => {
              const gmPct = row.revenue > 0 ? (row.gross_margin / row.revenue) * 100 : 0;
              const npPct = row.revenue > 0 ? (row.net_profit / row.revenue) * 100 : 0;
              const isSelected = row.week === report.week_start;
              return (
                <tr key={row.week} style={{ background: isSelected ? "#1e2535" : "transparent" }}>
                  <td style={{ fontSize: 12, color: isSelected ? "#f0f4ff" : "#8892a8", padding: "8px 0" }}>{formatWeekLabel(row.week)}</td>
                  <td style={{ textAlign: "right", fontSize: 12, color: "#f0f4ff", padding: "8px 0" }}>{fmt(row.revenue)}</td>
                  <td style={{ textAlign: "right", fontSize: 12, color: row.gross_margin >= 0 ? "#4caf78" : "#e05555", padding: "8px 0" }}>{fmt(row.gross_margin)}</td>
                  <td style={{ textAlign: "right", fontSize: 12, padding: "8px 0" }}><StatPill value={gmPct} /></td>
                  <td style={{ textAlign: "right", fontSize: 12, color: row.net_profit >= 0 ? "#4caf78" : "#e05555", padding: "8px 0" }}>{fmt(row.net_profit)}</td>
                  <td style={{ textAlign: "right", fontSize: 12, padding: "8px 0" }}><StatPill value={npPct} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>Weekly Revenue</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {trend.map((row) => (
            <Tooltip key={row.week} text={`${formatWeekLabel(row.week)}: ${fmt(row.revenue)} revenue, ${fmt(row.gross_margin)} gross margin`}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", cursor: "help" }}>
                <div style={{ fontSize: 10, color: "#6b7a99", minWidth: 90 }}>{formatWeekLabel(row.week).split("–")[0].trim()}</div>
                <div style={{ flex: 1 }}><Bar value={row.revenue} max={maxRev} color={row.week === report.week_start ? "#5b8fa8" : "#252d3d"} height={16} /></div>
                <div style={{ fontSize: 11, color: "#f0f4ff", minWidth: 60, textAlign: "right" }}>{fmt(row.revenue)}</div>
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Alerts View ───────────────────────────────────────────────────────────────
function AlertsView({ report }: { report: WeeklyReport }) {
  const unmapped = report.unmapped_accounts || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {unmapped.length > 0 && (
        <div style={{ background: "#141824", border: "1px solid #e05555", borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>🚨</span>
            <div style={{ fontSize: 10, color: "#e05555", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Unmapped Accounts Detected</div>
          </div>
          <div style={{ fontSize: 12, color: "#6b7a99", marginBottom: 18 }}>
            These accounts appeared in the Xero P&L but have no stream mapping — their figures are being excluded from all reports until mapped. Contact your accountant to assign them to Bar, Restaurant, Hotel or Shared.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {unmapped.map((acc) => (
              <div key={acc.account_code} style={{ background: "#1e1a1a", border: "1px solid #4a2020", borderLeft: "3px solid #e05555", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f4ff", marginBottom: 4 }}>{acc.account_name}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99" }}>Section: {acc.section}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99" }}>First seen: {new Date(acc.first_seen_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                  </div>
                  <div style={{ background: "#2e1a1a", color: "#e05555", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>Not mapped</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#4a5a7a", borderTop: "1px solid #252d3d", paddingTop: 12 }}>
            To resolve: run the SQL in Supabase to add these accounts to <code style={{ background: "#1e2535", padding: "1px 5px", borderRadius: 3 }}>stream_mappings</code>, then re-sync Xero. Once mapped, they'll disappear from this list.
          </div>
        </div>
      )}

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}><TipLabel label="Spend Spikes" tipKey="spike" /></div>
        <div style={{ fontSize: 11, color: "#4a5a7a", marginBottom: 18 }}>Cost lines more than 25% above their 4-week average</div>
        {report.spikes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#4caf78", fontSize: 14 }}>✓ No unusual spending detected this week</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {report.spikes.map((spike) => (
              <div key={spike.account} style={{ background: "#1e1a14", border: "1px solid #4a3a1a", borderLeft: "3px solid #e8a838", borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f4ff" }}>{spike.account}</div>
                  <div style={{ background: "#2e2014", color: "#e8a838", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>+{spike.pct_above.toFixed(0)}% above avg</div>
                </div>
                <div style={{ display: "flex", gap: 24 }}>
                  {[{ label: "This week", value: fmt(spike.amount), color: "#e05555" }, { label: "4-week avg", value: fmt(spike.avg), color: "#8892a8" }, { label: "Difference", value: fmt(spike.amount - spike.avg), color: "#e8a838" }].map(({ label, value, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>Margin Health by Stream</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {report.streams.map((s) => {
            const color = STREAM_COLORS[s.stream] || "#888";
            const health = s.net_profit_pct > 10 ? "Healthy" : s.net_profit_pct > 0 ? "Marginal" : "Loss-making";
            const healthColor = s.net_profit_pct > 10 ? "#4caf78" : s.net_profit_pct > 0 ? "#e8a838" : "#e05555";
            return (
              <div key={s.stream} style={{ background: "#0d1117", borderRadius: 10, padding: "14px 16px", border: "1px solid #1e2535" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f4ff" }}>{s.stream}</span>
                  </div>
                  <span style={{ fontSize: 11, color: healthColor, fontWeight: 600 }}>{health}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {[
                    { label: "Revenue", value: fmt(s.revenue) },
                    { label: "Gross Margin", value: `${s.gross_margin_pct.toFixed(1)}%` },
                    { label: "Net Profit", value: `${s.net_profit_pct.toFixed(1)}%` },
                    { label: "Wage %", value: `${s.wage_pct_of_revenue.toFixed(1)}%` },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f4ff" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}><TipLabel label="Wage Calculation Basis" tipKey="wages" /></div>
        <div style={{ display: "flex", gap: 24 }}>
          <div><div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>Method</div><div style={{ fontSize: 13, color: "#f0f4ff" }}>4-week rolling average</div></div>
          <div><div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>Weekly Average</div><div style={{ fontSize: 13, fontWeight: 600, color: "#e8a838" }}>{fmt(report.wage_basis.weekly_average)}</div></div>
          <div><div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>4-week Total</div><div style={{ fontSize: 13, color: "#f0f4ff" }}>{fmt(report.wage_basis.four_week_total)}</div></div>
        </div>
        <div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 10 }}>Wages are averaged across 4 weeks to smooth bi-weekly payroll journals. Raw payroll data is preserved in full in the underlying ledger.</div>
      </div>
    </div>
  );
}

// ── Monthly View ──────────────────────────────────────────────────────────────
function MonthlyView({ report }: { report: any }) {
  const maxRevenue = Math.max(...(report.seasonal_trend || []).map((t: any) => t.revenue), 1);
  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  };

  const MONTHLY_TIPS: Record<string, string> = {
    revenue: "Total sales income across all three revenue streams for the month.",
    cogs: "Combined cost of goods sold — dry stock (restaurant food), wet stock (bar drinks), and direct hotel costs.",
    wages: "Total staff wage cost for the month, including all departments.",
    events: "Direct costs for artists, live events, and entertainment during the month.",
    gross_margin: "Revenue minus COGS and wages. Shows how much the business retained after direct costs. Hospitality benchmark is typically 15–25%.",
    net_profit: "Revenue minus all costs including operating expenses. The true monthly bottom line.",
    wage_pct: "Wages as a percentage of monthly revenue. Hospitality benchmark is 25–35%. Above 40% consistently suggests overstaffing relative to revenue.",
    stream_cogs: "Cost of Goods Sold for this stream — what was spent on stock to generate this stream's revenue.",
    stream_wages: "Staff wage cost allocated to this stream based on the configured percentage split.",
    stream_gross: "Revenue minus COGS and wages for this stream. The stream's contribution to the overall business before shared costs.",
    stream_net: "Revenue minus all costs including a share of operating expenses. The stream's true monthly profit.",
    stream_gm_bar: "Gross margin as a percentage of revenue. Higher = this stream is more efficient at converting revenue into profit.",
    monthly_lump: "This month's revenue was entered as a single total in Xero rather than weekly figures. This was how Tangerine Trees recorded sales before November 2025. The total is accurate but weekly breakdown is not available.",
    seasonal_bar: "Bar length shows this month's revenue relative to the highest month on record. Coloured bars = weekly Xero entries (accurate weekly breakdown available). Grey bars = monthly lump entries (accurate monthly total, no weekly breakdown).",
    seasonal_trend: "All available monthly revenue history. Use this to identify seasonal patterns — which months are strong, which are quiet — to inform staffing, stock purchasing, and potential closure decisions.",
    yoy_revenue: "How this month's total revenue compares to the same calendar month last year. Positive = business is growing year-on-year.",
    yoy_gm: "Change in gross margin percentage versus the same month last year. Positive = cost control has improved.",
    yoy_np: "Change in net profit percentage versus the same month last year. The most important year-on-year indicator.",
    yoy_wage: "Change in wage percentage versus the same month last year. A negative number here is good — it means wages are a smaller proportion of revenue than a year ago.",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {report.data_quality.is_monthly_lump && (
        <Tooltip text={MONTHLY_TIPS.monthly_lump}>
          <div style={{ background: "#1a1e2e", border: "1px solid #3d4a63", borderRadius: 8, padding: "10px 16px", fontSize: 12, color: "#8892a8", display: "flex", alignItems: "center", gap: 8, cursor: "help", width: "100%" }}>
            <span>ℹ</span>
            <span>{report.data_quality.note} Weekly breakdown not available for pre-November 2025 data.</span>
            <InfoIcon />
          </div>
        </Tooltip>
      )}

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        {[
          { label: "Revenue", value: fmt(report.totals.revenue), color: "#f0f4ff", tip: MONTHLY_TIPS.revenue },
          { label: "COGS", value: fmt(report.totals.cogs), color: "#e07b4a", tip: MONTHLY_TIPS.cogs },
          { label: "Wages", value: fmt(report.totals.wages), sub: `${report.totals.wage_pct_of_revenue.toFixed(1)}% of rev`, color: report.totals.wage_pct_of_revenue > 40 ? "#e05555" : "#e8a838", tip: MONTHLY_TIPS.wages },
          { label: "Events", value: fmt(report.totals.events), color: "#9b6fd4", tip: MONTHLY_TIPS.events },
          { label: "Gross Margin", value: `${report.totals.gross_margin_pct.toFixed(1)}%`, sub: fmt(report.totals.gross_margin), color: report.totals.gross_margin_pct >= 0 ? "#4caf78" : "#e05555", tip: MONTHLY_TIPS.gross_margin },
          { label: "Net Profit", value: `${report.totals.net_profit_pct.toFixed(1)}%`, sub: fmt(report.totals.net_profit), color: report.totals.net_profit >= 0 ? "#4caf78" : "#e05555", tip: MONTHLY_TIPS.net_profit },
        ].map(({ label, value, sub, color, tip }) => (
          <Tooltip key={label} text={tip}>
            <div style={{ textAlign: "center", cursor: "help", width: "100%" }}>
              <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>{label}<InfoIcon /></div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
              {sub && <div style={{ fontSize: 10, color: "#6b7a99", marginTop: 2 }}>{sub}</div>}
            </div>
          </Tooltip>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {report.streams.map((s: any) => {
          const color = STREAM_COLORS[s.stream] || "#888";
          return (
            <div key={s.stream} style={{ background: "#141824", border: "1px solid #252d3d", borderTop: `3px solid ${color}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                {s.stream} {s.is_estimated && (
                  <Tooltip text="This stream's figures include estimated splits.">
                    <span style={{ background: "#2a2f42", color: "#8892a8", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 4, cursor: "help" }}>est.</span>
                  </Tooltip>
                )}
              </div>
              <Tooltip text={MONTHLY_TIPS.revenue}>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#f0f4ff", marginBottom: 14, cursor: "help" }}>{fmt(s.revenue)}</div>
              </Tooltip>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "COGS", value: s.cogs, color: "#e07b4a", tip: MONTHLY_TIPS.stream_cogs },
                  { label: "Wages", value: s.wages, color: "#e8a838", tip: MONTHLY_TIPS.stream_wages },
                  { label: "Gross Margin", value: s.gross_margin, color: s.gross_margin >= 0 ? "#4caf78" : "#e05555", tip: MONTHLY_TIPS.stream_gross },
                  { label: "Net Profit", value: s.net_profit, color: s.net_profit >= 0 ? "#4caf78" : "#e05555", tip: MONTHLY_TIPS.stream_net },
                ].map(({ label, value, color: c, tip }) => (
                  <div key={label}>
                    <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>
                      <Tooltip text={tip}><span style={{ display: "inline-flex", alignItems: "center", cursor: "help" }}>{label}<InfoIcon /></span></Tooltip>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c }}>{fmt(value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: "1px solid #1e2535", paddingTop: 10, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <Tooltip text={MONTHLY_TIPS.stream_gm_bar}>
                    <span style={{ fontSize: 9, color: "#6b7a99", cursor: "help", display: "inline-flex", alignItems: "center" }}>Gross Margin %<InfoIcon /></span>
                  </Tooltip>
                  <span style={{ fontSize: 11, fontWeight: 600, color: s.gross_margin_pct >= 0 ? "#4caf78" : "#e05555" }}>{s.gross_margin_pct.toFixed(1)}%</span>
                </div>
                <Tooltip text={MONTHLY_TIPS.stream_gm_bar}>
                  <div style={{ width: "100%", cursor: "help" }}>
                    <Bar value={s.gross_margin_pct} max={100} color={s.gross_margin_pct >= 0 ? "#4caf78" : "#e05555"} height={5} />
                  </div>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      {report.yoy.has_data && (
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>
            <TipLabel label="Year-on-Year Comparison" tipKey="yoy" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {[
              { label: "Revenue", current: fmt(report.totals.revenue), yago: fmt(report.yoy.year_ago_totals.revenue), change: report.yoy.revenue, tip: MONTHLY_TIPS.yoy_revenue },
              { label: "Gross Margin %", current: `${report.totals.gross_margin_pct.toFixed(1)}%`, yago: `${report.yoy.year_ago_totals.gross_margin_pct.toFixed(1)}%`, change: report.yoy.gross_margin_pct, tip: MONTHLY_TIPS.yoy_gm },
              { label: "Net Profit %", current: `${report.totals.net_profit_pct.toFixed(1)}%`, yago: `${report.yoy.year_ago_totals.net_profit_pct.toFixed(1)}%`, change: report.yoy.net_profit_pct, tip: MONTHLY_TIPS.yoy_np },
              { label: "Wage %", current: `${report.totals.wage_pct_of_revenue.toFixed(1)}%`, yago: `${report.yoy.year_ago_totals.wage_pct_of_revenue.toFixed(1)}%`, change: report.yoy.wage_pct !== null ? -(report.yoy.wage_pct) : null, tip: MONTHLY_TIPS.yoy_wage },
            ].map(({ label, current, yago, change, tip }) => (
              <Tooltip key={label} text={tip}>
                <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535", cursor: "help", width: "100%" }}>
                  <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 6, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 3 }}>{label}<InfoIcon /></div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f4ff", marginBottom: 4 }}>{current}</div>
                  <div style={{ fontSize: 11, color: "#4a5a7a", marginBottom: 6 }}>Year ago: {yago}</div>
                  {change !== null && <StatPill value={change} />}
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
          <Tooltip text={MONTHLY_TIPS.seasonal_trend}>
            <span style={{ display: "inline-flex", alignItems: "center", cursor: "help" }}>Seasonal Revenue Trend<InfoIcon /></span>
          </Tooltip>
        </div>
        <div style={{ fontSize: 11, color: "#4a5a7a", marginBottom: 18 }}>
          <Tooltip text={MONTHLY_TIPS.seasonal_bar}>
            <span style={{ cursor: "help" }}>All available history — <span style={{ color: "#3d5a7a" }}>■</span> weekly actuals &nbsp; <span style={{ color: "#2a3048" }}>■</span> monthly lump entry<InfoIcon /></span>
          </Tooltip>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(report.seasonal_trend || []).map((row: any) => (
            <div key={row.month} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 10, color: row.month === report.month ? "#f0f4ff" : "#6b7a99", minWidth: 48, fontWeight: row.month === report.month ? 700 : 400 }}>
                {formatMonth(row.month)}
              </div>
              <Tooltip text={`${formatMonth(row.month)}: ${fmt(row.revenue)} revenue, ${row.gross_margin_pct.toFixed(1)}% gross margin${row.is_monthly_lump ? " — monthly lump entry" : " — weekly actuals"}`}>
                <div style={{ flex: 1, cursor: "help" }}>
                  <Bar value={row.revenue} max={maxRevenue} color={row.month === report.month ? "#e8a838" : row.is_monthly_lump ? "#2a3048" : "#3d5a7a"} height={18} />
                </div>
              </Tooltip>
              <div style={{ fontSize: 11, color: row.month === report.month ? "#f0f4ff" : "#6b7a99", minWidth: 70, textAlign: "right" }}>{fmt(row.revenue)}</div>
              <Tooltip text={`Gross margin for ${formatMonth(row.month)}: ${row.gross_margin_pct.toFixed(1)}%`}>
                <div style={{ minWidth: 50, textAlign: "right", cursor: "help" }}><StatPill value={row.gross_margin_pct} /></div>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>

      {report.opex.length > 0 && (
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
            <TipLabel label="Operating Expenses" tipKey="opex" />
          </div>
          <div style={{ fontSize: 11, color: "#4a5a7a", marginBottom: 16 }}>Monthly total — shared equally across Bar, Restaurant and Hotel</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {report.opex.map((line: any) => (
              <Tooltip key={line.name} text={`${line.name}: ${fmt(line.amount)} this month`}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", cursor: "help" }}>
                  <div style={{ flex: 1, fontSize: 12, color: "#8892a8" }}>{line.name}</div>
                  <div style={{ width: 200 }}><Bar value={line.amount} max={Math.max(...report.opex.map((o: any) => o.amount))} color="#4a5a7a" height={5} /></div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#f0f4ff", minWidth: 70, textAlign: "right" }}>{fmt(line.amount)}</div>
                </div>
              </Tooltip>
            ))}
            <div style={{ borderTop: "1px solid #252d3d", paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#6b7a99" }}>Total Opex</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f4ff" }}>{fmt(report.opex.reduce((s: number, l: any) => s + l.amount, 0))}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("Weekly");
  const [showRolling, setShowRolling] = useState(false);

  const defaultWeek = getMondayOfWeek(new Date()).toISOString().split("T")[0];
  const [selectedWeek, setSelectedWeek] = useState(defaultWeek);

  const [syncing, setSyncing] = useState(false);
  const [fullSync, setFullSync] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<any | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchReport = useCallback(async (week: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/reports/weekly?week=${week}`);
      if (!res.ok) throw new Error("Failed to load report");
      setReport(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReport(selectedWeek); }, [selectedWeek, fetchReport]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const syncUrl = fullSync ? "/api/xero/sync?mode=full" : "/api/xero/sync?mode=quick";
      await fetch(syncUrl);
      setLastSynced(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      fetchReport(selectedWeek);
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setSyncing(false);
    }
  }, [selectedWeek, fetchReport, fullSync]);

  const fetchMonthly = useCallback(async (month: string) => {
    setMonthlyLoading(true);
    try {
      const res = await fetch(`/api/reports/monthly?month=${month}`);
      if (!res.ok) throw new Error("Failed to load monthly report");
      setMonthlyReport(await res.json());
    } catch (e: any) { console.error(e); }
    finally { setMonthlyLoading(false); }
  }, []);

  useEffect(() => {
    if (activeNav === "Monthly") fetchMonthly(selectedMonth);
  }, [activeNav, selectedMonth, fetchMonthly]);

  function shiftWeek(n: number) {
    const d = new Date(selectedWeek);
    d.setDate(d.getDate() + n * 7);
    setSelectedWeek(d.toISOString().split("T")[0]);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#f0f4ff", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ borderBottom: "1px solid #1e2535", padding: "0 28px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#e8a838" }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>HospoMetrics</span>
            <span style={{ color: "#3d4a63" }}>/</span>
            <span style={{ color: "#6b7a99", fontSize: 13 }}>Tangerine Trees</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {lastSynced && <span style={{ fontSize: 10, color: "#4a5a7a" }}>Last synced {lastSynced}</span>}
            {/* Quick / Full toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e2535", borderRadius: 6, padding: "3px 4px" }}>
              <button
                onClick={() => setFullSync(false)}
                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "none", cursor: "pointer", background: !fullSync ? "#3d4a63" : "transparent", color: !fullSync ? "#f0f4ff" : "#6b7a99", fontWeight: !fullSync ? 600 : 400 }}
              >Quick</button>
              <button
                onClick={() => setFullSync(true)}
                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "none", cursor: "pointer", background: fullSync ? "#3d4a63" : "transparent", color: fullSync ? "#f0f4ff" : "#6b7a99", fontWeight: fullSync ? 600 : 400 }}
              >Full</button>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{ fontSize: 11, color: syncing ? "#4a5a7a" : "#6b7a99", background: "none", border: "none", cursor: syncing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
            >
              <span style={{ display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>↻</span>
              {syncing ? (fullSync ? "Full sync…" : "Quick sync…") : (fullSync ? "Full Sync" : "Quick Sync")}
            </button>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar */}
        <div style={{ width: 180, borderRight: "1px solid #1e2535", padding: "24px 0", flexShrink: 0 }}>
          <div style={{ padding: "0 16px", marginBottom: 24 }}>
            <div style={{ fontSize: 9, color: "#4a5a7a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Reports</div>
            {NAV.map((item) => (
              <button key={item} onClick={() => setActiveNav(item)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: activeNav === item ? "#1e2535" : "transparent", border: "none", borderRadius: 8, color: activeNav === item ? "#f0f4ff" : "#6b7a99", fontSize: 13, fontWeight: activeNav === item ? 600 : 400, cursor: "pointer", marginBottom: 2, textAlign: "left" }}>
                {item === "Weekly" ? "📊" : item === "Monthly" ? "📅" : item === "Trends" ? "📈" : item === "Cash Up" ? "💵" : "🔔"} {item}
                {item === "Alerts" && report && (report.spikes.length > 0 || report.unmapped_accounts?.length > 0) && (
                  <span style={{ marginLeft: "auto", background: report.unmapped_accounts?.length > 0 ? "#e05555" : "#e8a838", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>
                    {(report.spikes.length || 0) + (report.unmapped_accounts?.length || 0)}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ padding: "0 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: "#4a5a7a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Data</div>
            <a href="/epos" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: "transparent", borderRadius: 8, color: "#6b7a99", fontSize: 13, textDecoration: "none", marginBottom: 2 }}>
              📤 EPOS Import
            </a>
            <a href="/cashup" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: "transparent", borderRadius: 8, color: "#6b7a99", fontSize: 13, textDecoration: "none", marginBottom: 2 }}>
              💵 Staff Cash Up
            </a>
          </div>

          {/* Rolling average toggle — weekly only */}
          {activeNav === "Weekly" && (
            <div style={{ padding: "0 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: "#4a5a7a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>View</div>
              <Tooltip text={TOOLTIPS.rolling_avg}>
                <button onClick={() => setShowRolling(!showRolling)} style={{ width: "100%", background: showRolling ? "#1e3548" : "#1e2535", border: `1px solid ${showRolling ? "#5b8fa8" : "#252d3d"}`, borderRadius: 8, color: showRolling ? "#5b8fa8" : "#6b7a99", fontSize: 11, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}>
                  {showRolling ? "📊 4-week avg" : "📅 This week"}
                </button>
              </Tooltip>
            </div>
          )}

          {/* Week picker — hidden on Monthly and Cash Up tabs */}
          {activeNav !== "Monthly" && activeNav !== "Cash Up" && (
            <div style={{ padding: "0 16px", borderTop: "1px solid #1e2535", paddingTop: 20 }}>
              <div style={{ fontSize: 9, color: "#4a5a7a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Week</div>
              <div style={{ fontSize: 11, color: "#f0f4ff", marginBottom: 10, lineHeight: 1.4 }}>{formatWeekLabel(selectedWeek)}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => shiftWeek(-1)} style={{ flex: 1, background: "#1e2535", border: "none", color: "#f0f4ff", borderRadius: 6, padding: "6px 0", cursor: "pointer", fontSize: 13 }}>←</button>
                <button onClick={() => shiftWeek(1)} disabled={selectedWeek >= defaultWeek} style={{ flex: 1, background: "#1e2535", border: "none", color: selectedWeek >= defaultWeek ? "#3d4a63" : "#f0f4ff", borderRadius: 6, padding: "6px 0", cursor: selectedWeek >= defaultWeek ? "default" : "pointer", fontSize: 13 }}>→</button>
              </div>
              <input type="date" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}
                style={{ width: "100%", marginTop: 8, background: "#1e2535", border: "1px solid #252d3d", color: "#f0f4ff", borderRadius: 6, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
            </div>
          )}

          {/* Month picker — only on Monthly tab */}
          {activeNav === "Monthly" && (
            <div style={{ padding: "0 16px", borderTop: "1px solid #1e2535", paddingTop: 20 }}>
              <div style={{ fontSize: 9, color: "#4a5a7a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Month</div>
              <div style={{ fontSize: 11, color: "#f0f4ff", marginBottom: 10, lineHeight: 1.4 }}>
                {new Date(selectedMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ width: "100%", background: "#1e2535", border: "1px solid #252d3d", color: "#f0f4ff", borderRadius: 6, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }}
              />
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: 28, overflowY: "auto" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{activeNav}</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
              {activeNav === "Monthly"
                ? new Date(selectedMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" })
                : activeNav === "Cash Up"
                ? "Nightly Till Reconciliations"
                : showRolling && activeNav === "Weekly"
                ? `4-week rolling average ending ${formatWeekLabel(selectedWeek).split("–")[1]?.trim()}`
                : formatWeekLabel(selectedWeek)}
            </div>
          </div>

          {/* Cash Up tab renders independently — no weekly report needed */}
          {activeNav === "Cash Up" && <DailyCashUp />}

          {/* All other tabs need the weekly report */}
          {activeNav !== "Cash Up" && (
            <>
              {loading && <div style={{ textAlign: "center", padding: 80, color: "#6b7a99" }}>Loading…</div>}
              {error && <div style={{ background: "#2e1a1a", border: "1px solid #e05555", borderRadius: 12, padding: 20, color: "#e05555" }}>{error}</div>}
              {report && !loading && (
                <>
                  {activeNav === "Weekly" && <WeeklyView report={report} showRolling={showRolling} />}
                  {activeNav === "Monthly" && monthlyReport && <MonthlyView report={monthlyReport} />}
                  {activeNav === "Monthly" && monthlyLoading && <div style={{ textAlign: "center", padding: 80, color: "#6b7a99" }}>Loading monthly report…</div>}
                  {activeNav === "Trends" && <TrendsView report={report} />}
                  {activeNav === "Alerts" && <AlertsView report={report} />}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
