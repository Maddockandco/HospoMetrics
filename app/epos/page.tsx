"use client";

// 📁 app/epos/page.tsx
// EPOS Now upload page — two file drops:
//   1. Wet & Dry CSV  (existing)
//   2. Misc Sales CSV (new)
// Bar revenue = Wet + Misc, Restaurant = Dry
// Reconciliation: Wet + Misc + Dry === Xero total

import { useState } from "react";

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${d.toLocaleDateString("en-GB", o)} – ${end.toLocaleDateString("en-GB", o)}`;
}

const fmt = (n: number) => new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP", minimumFractionDigits: 2,
}).format(n);

interface FileDrop {
  file: File | null;
  dragging: boolean;
}

export default function EposUploadPage() {
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [wetDry, setWetDry] = useState<FileDrop>({ file: null, dragging: false });
  const [misc, setMisc] = useState<FileDrop>({ file: null, dragging: false });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDrop(e: React.DragEvent, setter: (v: FileDrop) => void) {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.name.endsWith(".csv")) {
      setter({ file: dropped, dragging: false });
    } else {
      setError("Please drop a CSV file");
      setter((prev: FileDrop) => ({ ...prev, dragging: false }));
    }
  }

  async function handleUpload() {
    if (!wetDry.file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", wetDry.file);
    formData.append("week_start", weekStart);
    if (misc.file) formData.append("misc_file", misc.file);

    try {
      const res = await fetch("/api/epos/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const dropZone = (
    label: string,
    hint: string,
    inputId: string,
    state: FileDrop,
    setter: (v: FileDrop) => void,
    required = false,
  ) => (
    <div>
      <label style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
        {label} {required && <span style={{ color: "#e05555" }}>*</span>}
        {!required && <span style={{ color: "#4a5a7a", fontSize: 10, marginLeft: 6 }}>(recommended)</span>}
      </label>
      <div
        style={{
          border: `2px dashed ${state.dragging ? "#e8a838" : state.file ? "#e8a838" : "#252d3d"}`,
          borderRadius: 8, padding: "28px 16px", textAlign: "center", cursor: "pointer",
          background: state.dragging ? "#1a2010" : state.file ? "#1a1e14" : "#0d1117",
          transition: "all 0.2s",
        }}
        onClick={() => document.getElementById(inputId)?.click()}
        onDragOver={(e) => { e.preventDefault(); setter({ ...state, dragging: true }); }}
        onDragLeave={() => setter({ ...state, dragging: false })}
        onDrop={(e) => handleDrop(e, setter)}
      >
        <input id={inputId} type="file" accept=".csv" style={{ display: "none" }}
          onChange={(e) => setter({ file: e.target.files?.[0] || null, dragging: false })} />
        {state.dragging ? (
          <><div style={{ fontSize: 24, marginBottom: 6 }}>📥</div><div style={{ fontSize: 13, color: "#e8a838", fontWeight: 600 }}>Drop it here</div></>
        ) : state.file ? (
          <><div style={{ fontSize: 18, marginBottom: 4 }}>✓</div><div style={{ fontSize: 13, color: "#e8a838", fontWeight: 600 }}>{state.file.name}</div><div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>{(state.file.size / 1024).toFixed(1)} KB — click or drop to change</div></>
        ) : (
          <><div style={{ fontSize: 24, marginBottom: 6 }}>📄</div><div style={{ fontSize: 13, color: "#6b7a99" }}>Drag & drop CSV here, or click to select</div><div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 4 }}>{hint}</div></>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#f0f4ff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e2535", padding: "0 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#e8a838" }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>HospoMetrics</span>
            <span style={{ color: "#3d4a63" }}>/</span>
            <span style={{ color: "#6b7a99", fontSize: 13 }}>EPOS Import</span>
          </div>
          <a href="/dashboard" style={{ fontSize: 11, color: "#6b7a99", textDecoration: "none" }}>← Back to Dashboard</a>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 28px" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Weekly Import</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>EPOS Now — Sales Upload</h1>
          <p style={{ fontSize: 13, color: "#6b7a99", marginTop: 8, lineHeight: 1.6 }}>
            Upload the Wet & Dry report and the Misc Sales report from EPOS Now.
            Bar revenue = Wet + Misc. Restaurant revenue = Dry.
            The combined total is reconciled against Xero before actuals are used in reports.
          </p>
        </div>

        {/* How to export */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>How to export from EPOS Now</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "#e8a838", fontWeight: 600, marginBottom: 8 }}>Wet & Dry report</div>
              <ol style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {["Log into eposnowhq.com", "Reporting → Sales Report → Wet and Dry", "Set date range to Mon–Sun of the week", "Export → CSV"].map((s, i) => (
                  <li key={i} style={{ fontSize: 12, color: "#8892a8", lineHeight: 1.5 }}>{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9b6fd4", fontWeight: 600, marginBottom: 8 }}>Misc Sales report</div>
              <ol style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {["Log into eposnowhq.com", "Reporting → Sales Report → Misc Sales", "Set same date range (Mon–Sun)", "Export → CSV"].map((s, i) => (
                  <li key={i} style={{ fontSize: 12, color: "#8892a8", lineHeight: 1.5 }}>{s}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* Reconciliation logic explainer */}
        <div style={{ background: "#141824", border: "1px solid #1e2535", borderRadius: 12, padding: 16, marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <div style={{ fontSize: 12, color: "#6b7a99", lineHeight: 1.6 }}>
            <span style={{ color: "#e8a838", fontWeight: 600 }}>Bar (Wet + Misc)</span> and <span style={{ color: "#e07b4a", fontWeight: 600 }}>Restaurant (Dry)</span> are reconciled together against Xero's total revenue for the week.
            Misc items (e.g. Bellevue, Choc) are added to Wet sales because they map to <code style={{ background: "#1e2535", padding: "1px 5px", borderRadius: 3 }}>Bar revenue(WetStock)</code> in Xero.
          </div>
        </div>

        {/* Upload form */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Week picker */}
          <div>
            <label style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Week</label>
            <div style={{ fontSize: 13, color: "#8892a8", marginBottom: 8 }}>{formatWeekLabel(weekStart)}</div>
            <input
              type="date" value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              style={{ background: "#1e2535", border: "1px solid #252d3d", color: "#f0f4ff", borderRadius: 8, padding: "10px 12px", fontSize: 13, width: "100%", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 6 }}>Select the Monday of the week this report covers</div>
          </div>

          {/* File drop 1 — Wet & Dry */}
          {dropZone("Wet & Dry CSV", "WetAndDry_*.csv from EPOS Now", "csv-wetdry", wetDry, setWetDry, true)}

          {/* File drop 2 — Misc */}
          {dropZone("Misc Sales CSV", "MiscSales_*.csv from EPOS Now", "csv-misc", misc, setMisc, false)}

          {/* Warning if misc not uploaded */}
          {!misc.file && (
            <div style={{ background: "#1e1a14", border: "1px solid #4a3a1a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#e8a838" }}>
              ⚠ Without the Misc Sales CSV, Bar revenue will only include Wet sales — the reconciliation against Xero will likely fail.
            </div>
          )}

          {error && (
            <div style={{ background: "#2e1a1a", border: "1px solid #e05555", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#e05555" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!wetDry.file || loading}
            style={{
              background: !wetDry.file || loading ? "#1e2535" : "#e8a838",
              color: !wetDry.file || loading ? "#4a5a7a" : "#0d1117",
              border: "none", borderRadius: 8, padding: "13px 0",
              fontSize: 14, fontWeight: 700,
              cursor: !wetDry.file || loading ? "default" : "pointer",
              width: "100%",
            }}
          >
            {loading ? "Uploading & reconciling…" : "Upload & Reconcile"}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 24, background: "#141824", border: `1px solid ${result.is_reconciled ? "#3d4a2a" : "#4a3a1a"}`, borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ fontSize: 20 }}>{result.is_reconciled ? "✅" : "⚠️"}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: result.is_reconciled ? "#4caf78" : "#e8a838" }}>
                  {result.is_reconciled ? "Reconciled" : "Not Reconciled"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7a99", marginTop: 2 }}>{result.message}</div>
              </div>
            </div>

            {/* Totals comparison */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
              <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>EPOS Total (ex-VAT)</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f0f4ff" }}>{fmt(result.epos.total)}</div>
                <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>Wet + Misc + Dry</div>
              </div>
              <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>Xero Revenue</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f0f4ff" }}>{fmt(result.xero_total)}</div>
                {result.xero_total === 0 && (
                  <div style={{ fontSize: 10, color: "#e05555", marginTop: 4 }}>No Xero data found for this week — run Xero sync first</div>
                )}
              </div>
            </div>

            {/* Breakdown */}
            {result.is_reconciled && (
              <>
                <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Revenue Breakdown (Actuals)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <div style={{ background: "#1a1e14", borderRadius: 8, padding: 14, border: "1px solid #3d4a2a" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>🍺 Wet Sales</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#e8a838" }}>{fmt(result.epos.wet)}</div>
                  </div>
                  <div style={{ background: "#1a1e14", borderRadius: 8, padding: 14, border: "1px solid #3d4a2a" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>🎲 Misc Sales</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#9b6fd4" }}>{fmt(result.epos.misc)}</div>
                  </div>
                  <div style={{ background: "#1a1e14", borderRadius: 8, padding: 14, border: "1px solid #3d4a2a" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>🍽 Dry Sales</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#e07b4a" }}>{fmt(result.epos.dry)}</div>
                  </div>
                </div>

                {/* Bar + Restaurant totals */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 12 }}>
                  <div style={{ background: "#141824", borderRadius: 8, padding: 14, border: "1px solid #3d4a2a" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>🍺 Bar Total (Wet + Misc)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#e8a838" }}>{fmt(result.epos.bar)}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>
                      {((result.epos.bar / result.epos.total) * 100).toFixed(1)}% of total
                    </div>
                  </div>
                  <div style={{ background: "#141824", borderRadius: 8, padding: 14, border: "1px solid #3d4a2a" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>🍽 Restaurant (Dry)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#e07b4a" }}>{fmt(result.epos.dry)}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>
                      {((result.epos.dry / result.epos.total) * 100).toFixed(1)}% of total
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16, fontSize: 12, color: "#4caf78" }}>
                  ✓ Weekly report for {formatWeekLabel(result.week_start)} will now use these actuals instead of the estimated 50/50 split.
                </div>
              </>
            )}

            {!result.is_reconciled && result.difference > 0 && (
              <div style={{ background: "#1e1a14", border: "1px solid #4a3a1a", borderRadius: 8, padding: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, color: "#e8a838", marginBottom: 8 }}>Difference of {fmt(result.difference)} — possible causes:</div>
                <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    "Misc Sales CSV not uploaded — Misc items are coded to Bar revenue in Xero so they must be included",
                    "Wrong week selected — make sure EPOS date range matches this week exactly",
                    "Xero sync not run for this week — try syncing Xero first",
                    "Refunds or voids in EPOS not reflected in Xero yet",
                    "VAT rate difference — check EPOS is exporting ex-VAT figures",
                  ].map((cause, i) => (
                    <li key={i} style={{ fontSize: 12, color: "#8892a8" }}>{cause}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
              <a href="/dashboard" style={{ flex: 1, background: "#1e2535", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, color: "#f0f4ff", textDecoration: "none", textAlign: "center" as const }}>
                Back to Dashboard
              </a>
              {!result.is_reconciled && (
                <button
                  onClick={() => { setResult(null); setWetDry({ file: null, dragging: false }); setMisc({ file: null, dragging: false }); }}
                  style={{ flex: 1, background: "#e8a838", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, color: "#0d1117", fontWeight: 600, cursor: "pointer" }}
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
