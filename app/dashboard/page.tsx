"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
interface StreamData {
  stream: string;
  revenue: number;
  cogs: number;
  wages: number;
  events: number;
  overhead: number;
  gross_margin: number;
  gross_margin_pct: number;
  net_profit: number;
  net_profit_pct: number;
  wage_pct_of_revenue: number;
  is_estimated: boolean;
}
interface OpexLine { name: string; amount: number; }
interface Spike { account: string; amount: number; avg: number; pct_above: number; }
interface TrendPoint { week: string; revenue: number; gross_margin: number; net_profit: number; }
interface WeeklyReport {
  week_start: string;
  streams: StreamData[];
  totals: {
    revenue: number; cogs: number; wages: number; events: number;
    overhead: number; gross_margin: number; gross_margin_pct: number;
    net_profit: number; net_profit_pct: number; wage_pct_of_revenue: number;
  };
  opex: OpexLine[];
  spikes: Spike[];
  trend: TrendPoint[];
  is_estimated: boolean;
  wage_basis: { type: string; weekly_average: number; four_week_total: number };
}

// ── Constants ────────────────────────────────────────────────────────────────
const STREAM_COLORS: Record<string, string> = { Bar: "#e8a838", Restaurant: "#e07b4a", Hotel: "#5b8fa8" };
const NAV = ["Weekly", "Trends", "Alerts"] as const;
type NavItem = typeof NAV[number];

// ── Tooltip definitions ──────────────────────────────────────────────────────
const TOOLTIPS: Record<string, string> = {
  revenue: "Total sales income for this stream during the week, before any costs are deducted.",
  cogs: "Cost of Goods Sold — the direct cost of the products sold. For the bar this is wet stock (drinks), for the restaurant it's dry stock (food ingredients).",
  wages: "Staff wage cost allocated to this stream, shown as a 4-week rolling average to smooth out bi-weekly payroll timing.",
  events: "Direct costs for artists, live events, and entertainment — surfaced separately as a discretionary cost that directly drives bar revenue.",
  overhead: "Operating expenses (cleaning, utilities, repairs, IT, etc.) shared equally across all three revenue streams.",
  gross_margin: "Revenue minus COGS and wages. Shows how much each £1 of sales contributes after direct costs. Industry benchmark for hospitality is typically 15–25%.",
  gross_margin_pct: "Gross profit as a percentage of revenue. A higher number means more of each pound of sales is being retained after direct costs.",
  net_profit: "Revenue minus all costs including operating expenses. This is the true bottom line for each stream.",
  net_profit_pct: "Net profit as a percentage of revenue. Positive means the stream is profitable after all costs.",
  wage_pct: "Wages as a percentage of revenue. Hospitality benchmark is typically 25–35%. Above 40% is a warning sign — the stream may be overstaffed relative to revenue.",
  total_revenue: "Combined revenue across all three streams for this week.",
  total_cogs: "Total direct cost of goods across all streams.",
  total_wages: "Total wage cost for the week, shown as a 4-week rolling average to account for bi-weekly payroll.",
  total_events: "Total events and entertainment costs across all streams.",
  gross_margin_total: "Overall gross margin percentage across the business this week.",
  net_profit_total: "Overall net profit percentage across the entire business this week.",
  revenue_bar: "Bar length shows this stream's revenue relative to the highest-earning stream this week.",
  wage_bar: "Bar shows wage cost as a percentage of revenue. Green = within target, Red = above 40% threshold.",
  opex: "Operating expenses that apply to the whole business rather than a specific revenue stream — split equally across Bar, Restaurant and Hotel.",
  spike: "This cost is more than 25% above its 4-week average — flagged for your attention. Could be a one-off or the start of a trend worth investigating.",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

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

// ── Tooltip component ────────────────────────────────────────────────────────
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseEnter(e: React.MouseEvent) {
    setVisible(true);
    setPos({ x: e.clientX, y: e.clientY });
  }
  function handleMouseMove(e: React.MouseEvent) {
    setPos({ x: e.clientX, y: e.clientY });
  }

  return (
    <div ref={ref} style={{ display: "inline-flex", alignItems: "center", cursor: "help" }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={{
          position: "fixed",
          left: pos.x + 12,
          top: pos.y - 8,
          zIndex: 9999,
          background: "#1e2535",
          border: "1px solid #3d4a63",
          borderRadius: 8,
          padding: "10px 14px",
          maxWidth: 280,
          fontSize: 12,
          color: "#c0cce0",
          lineHeight: 1.5,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          pointerEvents: "none",
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

function InfoIcon() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 13, height: 13, borderRadius: "50%", background: "#252d3d", color: "#6b7a99", fontSize: 8, fontWeight: 700, marginLeft: 5, flexShrink: 0 }}>?</span>
  );
}

function TipLabel({ label, tipKey }: { label: string; tipKey: string }) {
  return (
    <Tooltip text={TOOLTIPS[tipKey] || label}>
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        {label}<InfoIcon />
      </span>
    </Tooltip>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
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
  return (
    <span style={{ background: isPos ? "#1a2e1a" : "#2e1a1a", color: isPos ? "#4caf78" : "#e05555", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 600 }}>
      {pct(value)}
    </span>
  );
}

function StreamCard({ data, maxRevenue }: { data: StreamData; maxRevenue: number }) {
  const color = STREAM_COLORS[data.stream] || "#888";
  return (
    <div style={{ background: "#141824", border: "1px solid #252d3d", borderTop: `3px solid ${color}`, borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, color: "#6b7a99", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
            {data.stream} {data.is_estimated && <span style={{ background: "#2a2f42", color: "#8892a8", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>est.</span>}
          </div>
          <Tooltip text={TOOLTIPS.revenue}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#f0f4ff", letterSpacing: "-0.02em", cursor: "help" }}>{fmt(data.revenue)}</div>
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

      <Tooltip text={TOOLTIPS.revenue_bar}>
        <div style={{ width: "100%", cursor: "help" }}>
          <Bar value={data.revenue} max={maxRevenue} color={color} height={5} />
        </div>
      </Tooltip>

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
            <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>
              <TipLabel label={label} tipKey={tipKey} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: c }}>{fmt(value)}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #1e2535", paddingTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 9, color: "#6b7a99" }}><TipLabel label="Wage % of Revenue" tipKey="wage_pct" /></span>
          <span style={{ fontSize: 11, fontWeight: 600, color: data.wage_pct_of_revenue > 40 ? "#e05555" : "#4caf78" }}>{data.wage_pct_of_revenue.toFixed(1)}%</span>
        </div>
        <Tooltip text={TOOLTIPS.wage_bar}>
          <div style={{ width: "100%", cursor: "help" }}>
            <Bar value={data.wage_pct_of_revenue} max={100} color={data.wage_pct_of_revenue > 40 ? "#e05555" : "#4caf78"} height={5} />
          </div>
        </Tooltip>
      </div>
    </div>
  );
}

function MiniSparkline({ data, field, color }: { data: TrendPoint[]; field: keyof TrendPoint; color: string }) {
  if (data.length < 2) return null;
  const values = data.map((d) => d[field] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 120, H = 36, pad = 4;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const lastParts = points.split(" ").slice(-1)[0].split(",");
  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastParts[0]} cy={lastParts[1]} r={3} fill={color} />
    </svg>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────
function WeeklyView({ report }: { report: WeeklyReport }) {
  const maxRevenue = Math.max(...report.streams.map((s) => s.revenue));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {report.is_estimated && (
        <div style={{ background: "#1e2118", border: "1px solid #3d4a2a", borderRadius: 8, padding: "10px 16px", fontSize: 12, color: "#8aa86a" }}>
          ⚠ Stream splits are estimated — bar/restaurant revenue uses configured percentages, not EPOS actuals.
        </div>
      )}

      {/* Totals strip */}
      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        {[
          { label: "Revenue", value: fmt(report.totals.revenue), color: "#f0f4ff", tipKey: "total_revenue" },
          { label: "COGS", value: fmt(report.totals.cogs), color: "#e07b4a", tipKey: "total_cogs" },
          { label: "Wages (avg)", value: fmt(report.totals.wages), sub: `${report.totals.wage_pct_of_revenue.toFixed(1)}% of rev`, color: report.totals.wage_pct_of_revenue > 40 ? "#e05555" : "#e8a838", tipKey: "total_wages" },
          { label: "Events", value: fmt(report.totals.events), color: "#9b6fd4", tipKey: "total_events" },
          { label: "Gross Margin", value: `${report.totals.gross_margin_pct.toFixed(1)}%`, sub: fmt(report.totals.gross_margin), color: report.totals.gross_margin_pct >= 0 ? "#4caf78" : "#e05555", tipKey: "gross_margin_total" },
          { label: "Net Profit", value: `${report.totals.net_profit_pct.toFixed(1)}%`, sub: fmt(report.totals.net_profit), color: report.totals.net_profit >= 0 ? "#4caf78" : "#e05555", tipKey: "net_profit_total" },
        ].map(({ label, value, sub, color, tipKey }) => (
          <Tooltip key={label} text={TOOLTIPS[tipKey] || label}>
            <div style={{ textAlign: "center", cursor: "help", width: "100%" }}>
              <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                {label}<InfoIcon />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
              {sub && <div style={{ fontSize: 10, color: "#6b7a99", marginTop: 2 }}>{sub}</div>}
            </div>
          </Tooltip>
        ))}
      </div>

      {/* Stream cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {report.streams.map((s) => <StreamCard key={s.stream} data={s} maxRevenue={maxRevenue} />)}
      </div>

      {/* Cost breakdown stacked bars */}
      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>Cost Breakdown vs Revenue</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {report.streams.map((s) => {
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
                <Tooltip text="Each coloured segment shows what proportion of revenue is consumed by that cost. Green segment = what's left as net profit.">
                  <div style={{ display: "flex", height: 20, borderRadius: 5, overflow: "hidden", gap: 1, width: "100%", cursor: "help" }}>
                    <div style={{ width: `${cogsW}%`, background: "#e07b4a" }} title={`COGS: ${fmt(s.cogs)}`} />
                    <div style={{ width: `${wagesW}%`, background: "#e8a838" }} title={`Wages: ${fmt(s.wages)}`} />
                    <div style={{ width: `${eventsW}%`, background: "#9b6fd4" }} title={`Events: ${fmt(s.events)}`} />
                    <div style={{ width: `${overheadW}%`, background: "#3d4a63" }} title={`Overhead: ${fmt(s.overhead)}`} />
                    <div style={{ width: `${profitW}%`, background: "#4caf78" }} title={`Net Profit: ${fmt(s.net_profit)}`} />
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

      {/* Opex breakdown */}
      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
          <TipLabel label="Operating Expenses" tipKey="opex" />
        </div>
        <div style={{ fontSize: 11, color: "#4a5a7a", marginBottom: 16 }}>Shared across all streams equally</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {report.opex.map((line) => (
            <div key={line.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, fontSize: 12, color: "#8892a8" }}>{line.name}</div>
              <div style={{ width: 200 }}>
                <Bar value={line.amount} max={Math.max(...report.opex.map(o => o.amount))} color="#4a5a7a" height={5} />
              </div>
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

function TrendsView({ report }: { report: WeeklyReport }) {
  const trend = report.trend.slice(-8);
  if (trend.length < 2) return <div style={{ color: "#6b7a99", padding: 40, textAlign: "center" }}>Not enough data yet — sync more weeks to see trends.</div>;
  const maxRev = Math.max(...trend.map(t => t.revenue));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "Revenue Trend", field: "revenue" as const, color: "#5b8fa8", tip: "Total weekly revenue over the last 8 weeks. An upward line means the business is growing." },
          { label: "Gross Margin Trend", field: "gross_margin" as const, color: "#4caf78", tip: "Gross profit (revenue minus COGS and wages) over 8 weeks. Shows whether cost control is improving or worsening." },
          { label: "Net Profit Trend", field: "net_profit" as const, color: "#e8a838", tip: "Bottom-line profit after all costs over 8 weeks. The most important indicator of overall business health." },
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

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>8-Week History</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                { h: "Week", tip: "" },
                { h: "Revenue", tip: TOOLTIPS.total_revenue },
                { h: "Gross Margin", tip: TOOLTIPS.gross_margin },
                { h: "GM %", tip: TOOLTIPS.gross_margin_pct },
                { h: "Net Profit", tip: TOOLTIPS.net_profit },
                { h: "NP %", tip: TOOLTIPS.net_profit_pct },
              ].map(({ h, tip }) => (
                <th key={h} style={{ textAlign: h === "Week" ? "left" : "right", fontSize: 9, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", paddingBottom: 10, fontWeight: 500 }}>
                  {tip ? <Tooltip text={tip}><span style={{ cursor: "help", display: "inline-flex", alignItems: "center" }}>{h}<InfoIcon /></span></Tooltip> : h}
                </th>
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
            <Tooltip key={row.week} text={`Week of ${formatWeekLabel(row.week)}: ${fmt(row.revenue)} revenue, ${fmt(row.gross_margin)} gross margin`}>
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

function AlertsView({ report }: { report: WeeklyReport }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
          <TipLabel label="Spend Spikes" tipKey="spike" />
        </div>
        <div style={{ fontSize: 11, color: "#4a5a7a", marginBottom: 18 }}>Cost lines more than 25% above their 4-week average</div>
        {report.spikes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#4caf78", fontSize: 14 }}>✓ No unusual spending detected this week</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {report.spikes.map((spike) => (
              <Tooltip key={spike.account} text={TOOLTIPS.spike}>
                <div style={{ background: "#1e1a14", border: "1px solid #4a3a1a", borderLeft: "3px solid #e8a838", borderRadius: 8, padding: "14px 16px", width: "100%", cursor: "help" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f4ff" }}>{spike.account}</div>
                    <div style={{ background: "#2e2014", color: "#e8a838", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>+{spike.pct_above.toFixed(0)}% above avg</div>
                  </div>
                  <div style={{ display: "flex", gap: 24 }}>
                    {[
                      { label: "This week", value: fmt(spike.amount), color: "#e05555" },
                      { label: "4-week avg", value: fmt(spike.avg), color: "#8892a8" },
                      { label: "Difference", value: fmt(spike.amount - spike.avg), color: "#e8a838" },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Tooltip>
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
            const healthTip = s.net_profit_pct > 10
              ? "This stream is profitable and performing well. Net profit above 10% is considered healthy in hospitality."
              : s.net_profit_pct > 0
              ? "This stream is profitable but with thin margins. Worth monitoring costs closely."
              : "This stream is currently running at a loss. Review staffing levels and cost of goods to identify where savings can be made.";
            return (
              <Tooltip key={s.stream} text={healthTip}>
                <div style={{ background: "#0d1117", borderRadius: 10, padding: "14px 16px", border: "1px solid #1e2535", cursor: "help", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f4ff" }}>{s.stream}</span>
                    </div>
                    <span style={{ fontSize: 11, color: healthColor, fontWeight: 600 }}>{health}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {[
                      { label: "Revenue", value: fmt(s.revenue), tip: TOOLTIPS.revenue },
                      { label: "Gross Margin", value: `${s.gross_margin_pct.toFixed(1)}%`, tip: TOOLTIPS.gross_margin_pct },
                      { label: "Net Profit", value: `${s.net_profit_pct.toFixed(1)}%`, tip: TOOLTIPS.net_profit_pct },
                      { label: "Wage %", value: `${s.wage_pct_of_revenue.toFixed(1)}%`, tip: TOOLTIPS.wage_pct },
                    ].map(({ label, value, tip }) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f4ff" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
          <TipLabel label="Wage Calculation Basis" tipKey="wages" />
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <div><div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>Method</div><div style={{ fontSize: 13, color: "#f0f4ff" }}>4-week rolling average</div></div>
          <div><div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>Weekly Average</div><div style={{ fontSize: 13, fontWeight: 600, color: "#e8a838" }}>{fmt(report.wage_basis.weekly_average)}</div></div>
          <div><div style={{ fontSize: 9, color: "#6b7a99", marginBottom: 2 }}>4-week Total</div><div style={{ fontSize: 13, color: "#f0f4ff" }}>{fmt(report.wage_basis.four_week_total)}</div></div>
        </div>
        <div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 10 }}>
          Wages are averaged across 4 weeks to smooth bi-weekly payroll journals. Raw payroll data is preserved in full in the underlying ledger.
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("Weekly");

  const defaultWeek = getMondayOfWeek(new Date()).toISOString().split("T")[0];
  const [selectedWeek, setSelectedWeek] = useState(defaultWeek);

  const fetchReport = useCallback(async (week: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/weekly?week=${week}`);
      if (!res.ok) throw new Error("Failed to load report");
      setReport(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReport(selectedWeek); }, [selectedWeek, fetchReport]);

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
          <a href="/api/xero/sync" style={{ fontSize: 11, color: "#6b7a99", textDecoration: "none" }}>↻ Sync Xero</a>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        <div style={{ width: 180, borderRight: "1px solid #1e2535", padding: "24px 0", flexShrink: 0 }}>
          <div style={{ padding: "0 16px", marginBottom: 24 }}>
            <div style={{ fontSize: 9, color: "#4a5a7a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Reports</div>
            {NAV.map((item) => (
              <button key={item} onClick={() => setActiveNav(item)} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px",
                background: activeNav === item ? "#1e2535" : "transparent",
                border: "none", borderRadius: 8, color: activeNav === item ? "#f0f4ff" : "#6b7a99",
                fontSize: 13, fontWeight: activeNav === item ? 600 : 400, cursor: "pointer", marginBottom: 2, textAlign: "left",
              }}>
                {item === "Weekly" ? "📊" : item === "Trends" ? "📈" : "🔔"} {item}
                {item === "Alerts" && report && report.spikes.length > 0 && (
                  <span style={{ marginLeft: "auto", background: "#e05555", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{report.spikes.length}</span>
                )}
              </button>
            ))}
          </div>

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
        </div>

        <div style={{ flex: 1, padding: 28, overflowY: "auto" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{activeNav}</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{formatWeekLabel(selectedWeek)}</div>
          </div>

          {loading && <div style={{ textAlign: "center", padding: 80, color: "#6b7a99" }}>Loading…</div>}
          {error && <div style={{ background: "#2e1a1a", border: "1px solid #e05555", borderRadius: 12, padding: 20, color: "#e05555" }}>{error}</div>}
          {report && !loading && (
            <>
              {activeNav === "Weekly" && <WeeklyView report={report} />}
              {activeNav === "Trends" && <TrendsView report={report} />}
              {activeNav === "Alerts" && <AlertsView report={report} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
