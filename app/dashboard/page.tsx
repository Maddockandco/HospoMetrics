"use client";

import { useState, useEffect, useCallback } from "react";

interface StreamData {
  stream: string;
  revenue: number;
  cogs: number;
  wages: number;
  overhead: number;
  gross_margin: number;
  gross_margin_pct: number;
  wage_pct_of_revenue: number;
  is_estimated: boolean;
}

interface WeeklyReport {
  week_start: string;
  streams: StreamData[];
  totals: {
    revenue: number;
    cogs: number;
    wages: number;
    overhead: number;
    gross_margin: number;
    gross_margin_pct: number;
    wage_pct_of_revenue: number;
  };
  is_estimated: boolean;
}

const STREAM_COLORS: Record<string, string> = {
  Bar: "#e8a838",
  Restaurant: "#e07b4a",
  Hotel: "#5b8fa8",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${d.toLocaleDateString("en-GB", opts)} – ${end.toLocaleDateString("en-GB", opts)}`;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: "#1a1f2e", borderRadius: 4, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
    </div>
  );
}

function StreamCard({ data, maxRevenue }: { data: StreamData; maxRevenue: number }) {
  const color = STREAM_COLORS[data.stream] || "#888";
  const marginPositive = data.gross_margin >= 0;

  return (
    <div style={{
      background: "#141824",
      border: "1px solid #252d3d",
      borderTop: `3px solid ${color}`,
      borderRadius: 12,
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "#6b7a99", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            {data.stream}
            {data.is_estimated && (
              <span style={{ marginLeft: 8, background: "#2a2f42", color: "#8892a8", fontSize: 9, padding: "2px 6px", borderRadius: 4 }}>
                est.
              </span>
            )}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f0f4ff", letterSpacing: "-0.02em" }}>
            {fmt(data.revenue)}
          </div>
          <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 2 }}>revenue</div>
        </div>
        <div style={{
          background: marginPositive ? "#1a2e1a" : "#2e1a1a",
          color: marginPositive ? "#4caf78" : "#e05555",
          borderRadius: 8,
          padding: "8px 12px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{data.gross_margin_pct > 0 ? "+" : ""}{data.gross_margin_pct.toFixed(1)}%</div>
          <div style={{ fontSize: 10, opacity: 0.8 }}>margin</div>
        </div>
      </div>

      <MiniBar value={data.revenue} max={maxRevenue} color={color} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "COGS", value: data.cogs, color: "#e07b4a" },
          { label: "Wages", value: data.wages, color: "#e8a838" },
          { label: "Overhead", value: data.overhead, color: "#8892a8" },
          { label: "Gross Profit", value: data.gross_margin, color: marginPositive ? "#4caf78" : "#e05555" },
        ].map(({ label, value, color: c }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: "#6b7a99", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: c }}>{fmt(value)}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #252d3d", paddingTop: 12 }}>
        <div style={{ fontSize: 10, color: "#6b7a99", marginBottom: 6 }}>Wage % of Revenue</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <MiniBar value={data.wage_pct_of_revenue} max={100} color={data.wage_pct_of_revenue > 40 ? "#e05555" : "#4caf78"} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: data.wage_pct_of_revenue > 40 ? "#e05555" : "#4caf78", minWidth: 40, textAlign: "right" }}>
            {data.wage_pct_of_revenue.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monday = getMondayOfWeek(new Date());
  const defaultWeek = monday.toISOString().split("T")[0];
  const [selectedWeek, setSelectedWeek] = useState(defaultWeek);

  const fetchReport = useCallback(async (week: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/weekly?week=${week}`);
      if (!res.ok) throw new Error("Failed to load report");
      const data = await res.json();
      setReport(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(selectedWeek);
  }, [selectedWeek, fetchReport]);

  function shiftWeek(direction: number) {
    const d = new Date(selectedWeek);
    d.setDate(d.getDate() + direction * 7);
    setSelectedWeek(d.toISOString().split("T")[0]);
  }

  const maxRevenue = report ? Math.max(...report.streams.map((s) => s.revenue)) : 1;

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#f0f4ff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e2535", padding: "0 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e8a838" }} />
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>HospoMetrics</span>
            <span style={{ color: "#3d4a63", fontSize: 14 }}>/</span>
            <span style={{ color: "#6b7a99", fontSize: 14 }}>Tangerine Trees</span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <a href="/api/xero/sync" style={{ fontSize: 12, color: "#6b7a99", textDecoration: "none" }}>↻ Sync</a>
            <a href="/api/xero/connect" style={{ fontSize: 12, color: "#6b7a99", textDecoration: "none" }}>Reconnect Xero</a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px" }}>
        {/* Week picker */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 11, color: "#6b7a99", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
              Weekly Report
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
              {formatWeekLabel(selectedWeek)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => shiftWeek(-1)} style={{ background: "#141824", border: "1px solid #252d3d", color: "#f0f4ff", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 16 }}>←</button>
            <input
              type="date"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              style={{ background: "#141824", border: "1px solid #252d3d", color: "#f0f4ff", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
            />
            <button onClick={() => shiftWeek(1)} disabled={selectedWeek >= defaultWeek} style={{ background: "#141824", border: "1px solid #252d3d", color: selectedWeek >= defaultWeek ? "#3d4a63" : "#f0f4ff", borderRadius: 8, padding: "8px 14px", cursor: selectedWeek >= defaultWeek ? "default" : "pointer", fontSize: 16 }}>→</button>
          </div>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 80, color: "#6b7a99" }}>Loading report…</div>}
        {error && <div style={{ background: "#2e1a1a", border: "1px solid #e05555", borderRadius: 12, padding: 24, color: "#e05555" }}>{error}</div>}

        {report && !loading && (
          <>
            {report.is_estimated && (
              <div style={{ background: "#1e2118", border: "1px solid #3d4a2a", borderRadius: 8, padding: "10px 16px", marginBottom: 24, fontSize: 12, color: "#8aa86a", display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠</span>
                <span>Stream splits are estimated — bar/restaurant revenue and wage allocations use configured percentages, not actuals.</span>
              </div>
            )}

            {/* Totals bar */}
            <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: "20px 24px", marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
              {[
                { label: "Total Revenue", value: fmt(report.totals.revenue), color: "#f0f4ff" },
                { label: "Total COGS", value: fmt(report.totals.cogs), color: "#e07b4a" },
                { label: "Total Wages", value: fmt(report.totals.wages), color: "#e8a838" },
                { label: "Gross Margin", value: `${report.totals.gross_margin_pct.toFixed(1)}%`, color: report.totals.gross_margin_pct >= 0 ? "#4caf78" : "#e05555" },
                { label: "Wage % of Rev", value: `${report.totals.wage_pct_of_revenue.toFixed(1)}%`, color: report.totals.wage_pct_of_revenue > 40 ? "#e05555" : "#4caf78" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#6b7a99", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Stream cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
              {report.streams.map((stream) => (
                <StreamCard key={stream.stream} data={stream} maxRevenue={maxRevenue} />
              ))}
            </div>

            {/* Revenue breakdown bar chart */}
            <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 11, color: "#6b7a99", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 }}>
                Revenue vs Cost Breakdown
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {report.streams.map((s) => {
                  const total = s.revenue;
                  const cogsW = total > 0 ? (s.cogs / total) * 100 : 0;
                  const wagesW = total > 0 ? (s.wages / total) * 100 : 0;
                  const overheadW = total > 0 ? (s.overhead / total) * 100 : 0;
                  const profitW = Math.max(0, 100 - cogsW - wagesW - overheadW);
                  return (
                    <div key={s.stream}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "#8892a8" }}>{s.stream}</span>
                        <span style={{ fontSize: 12, color: "#6b7a99" }}>{fmt(total)}</span>
                      </div>
                      <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", gap: 1 }}>
                        <div title={`COGS: ${fmt(s.cogs)}`} style={{ width: `${cogsW}%`, background: "#e07b4a" }} />
                        <div title={`Wages: ${fmt(s.wages)}`} style={{ width: `${wagesW}%`, background: "#e8a838" }} />
                        <div title={`Overhead: ${fmt(s.overhead)}`} style={{ width: `${overheadW}%`, background: "#3d4a63" }} />
                        <div title={`Profit: ${fmt(s.gross_margin)}`} style={{ width: `${profitW}%`, background: "#4caf78" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
                {[
                  { label: "COGS", color: "#e07b4a" },
                  { label: "Wages", color: "#e8a838" },
                  { label: "Overhead", color: "#3d4a63" },
                  { label: "Gross Profit", color: "#4caf78" },
                ].map(({ label, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                    <span style={{ fontSize: 11, color: "#6b7a99" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
