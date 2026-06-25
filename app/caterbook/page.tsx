"use client";

// 📁 app/caterbook/page.tsx
// Caterbook hotel data upload page
// File 1: Sales report (.xlsx) — revenue reconciliation against Xero Hotel revenue
// File 2: Room occupancy export (.csv) — occupancy KPIs (no revenue reconciliation)

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

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

interface FileDrop { file: File | null; dragging: boolean; }

export default function CaterbookUploadPage() {
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [salesFile, setSalesFile] = useState<FileDrop>({ file: null, dragging: false });
  const [occupancyFile, setOccupancyFile] = useState<FileDrop>({ file: null, dragging: false });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDrop(e: React.DragEvent, setter: (v: FileDrop) => void, accept: string) {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    const valid = accept === ".xlsx" ? dropped?.name.endsWith(".xlsx") : dropped?.name.endsWith(".csv");
    if (dropped && valid) {
      setter({ file: dropped, dragging: false });
    } else {
      setError(`Please drop a ${accept} file`);
      setter((prev: FileDrop) => ({ ...prev, dragging: false }));
    }
  }

  async function handleUpload() {
    if (!salesFile.file && !occupancyFile.file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("week_start", weekStart);
    if (salesFile.file) formData.append("sales_file", salesFile.file);
    if (occupancyFile.file) formData.append("occupancy_file", occupancyFile.file);

    try {
      const res = await fetch("/api/caterbook/upload", { method: "POST", body: formData });
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
    accept: string,
    state: FileDrop,
    setter: (v: FileDrop) => void,
    required = false,
  ) => (
    <div>
      <label style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
        {label} {required && <span style={{ color: "#e05555" }}>*</span>}
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
        onDrop={(e) => handleDrop(e, setter, accept)}
      >
        <input id={inputId} type="file" accept={accept} style={{ display: "none" }}
          onChange={(e) => setter({ file: e.target.files?.[0] || null, dragging: false })} />
        {state.dragging ? (
          <><div style={{ fontSize: 24, marginBottom: 6 }}>📥</div><div style={{ fontSize: 13, color: "#e8a838", fontWeight: 600 }}>Drop it here</div></>
        ) : state.file ? (
          <><div style={{ fontSize: 18, marginBottom: 4 }}>✓</div><div style={{ fontSize: 13, color: "#e8a838", fontWeight: 600 }}>{state.file.name}</div><div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>{(state.file.size / 1024).toFixed(1)} KB — click or drop to change</div></>
        ) : (
          <><div style={{ fontSize: 24, marginBottom: 6 }}>📄</div><div style={{ fontSize: 13, color: "#6b7a99" }}>Drag & drop {accept} here, or click to select</div><div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 4 }}>{hint}</div></>
        )}
      </div>
    </div>
  );

  const canUpload = (salesFile.file || occupancyFile.file) && !loading;

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#f0f4ff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e2535", padding: "0 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#e8a838" }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>HospoMetrics</span>
            <span style={{ color: "#3d4a63" }}>/</span>
            <span style={{ color: "#6b7a99", fontSize: 13 }}>Caterbook Import</span>
          </div>
          <a href="/dashboard" style={{ fontSize: 11, color: "#6b7a99", textDecoration: "none" }}>← Back to Dashboard</a>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 28px" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Weekly Import</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Caterbook — Hotel Upload</h1>
          <p style={{ fontSize: 13, color: "#6b7a99", marginTop: 8, lineHeight: 1.6 }}>
            Upload the Sales report and Room occupancy export from Caterbook.
            Sales figures are reconciled against Xero Hotel revenue.
            Occupancy data is stored as hotel KPIs.
          </p>
        </div>

        {/* How to export */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>How to export from Caterbook</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "#e8a838", fontWeight: 600, marginBottom: 8 }}>Sales report (.xlsx)</div>
              <ol style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {["Log into Caterbook", "Reports → Sales Report", "Set date range Mon–Sun", "Export → Excel (.xlsx)"].map((s, i) => (
                  <li key={i} style={{ fontSize: 12, color: "#8892a8", lineHeight: 1.5 }}>{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#5b8fa8", fontWeight: 600, marginBottom: 8 }}>Room occupancy (.csv)</div>
              <ol style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {["Log into Caterbook", "Reports → Room Report", "Set same date range", "Export → CSV"].map((s, i) => (
                  <li key={i} style={{ fontSize: 12, color: "#8892a8", lineHeight: 1.5 }}>{s}</li>
                ))}
              </ol>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#1a1e2e", borderRadius: 6, fontSize: 12, color: "#8892a8" }}>
            ℹ Caterbook's week may start on Sunday — if the date range shows one day earlier than expected, that's normal. Select the Monday in HospoMetrics and we'll match the data correctly.
          </div>
        </div>

        {/* Upload form */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Week picker */}
          <div>
            <label style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Week</label>
            <div style={{ fontSize: 13, color: "#8892a8", marginBottom: 8 }}>{formatWeekLabel(weekStart)}</div>
            <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}
              style={{ background: "#1e2535", border: "1px solid #252d3d", color: "#f0f4ff", borderRadius: 8, padding: "10px 12px", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
            <div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 6 }}>Select the Monday of the week this report covers</div>
          </div>

          {/* Sales file drop */}
          {dropZone("Sales Report", "Sales_report_export_*.xlsx from Caterbook", "caterbook-sales", ".xlsx", salesFile, setSalesFile, true)}

          {/* Occupancy file drop */}
          {dropZone("Room Occupancy Report", "Room_export_*.csv from Caterbook", "caterbook-occupancy", ".csv", occupancyFile, setOccupancyFile, false)}

          {error && (
            <div style={{ background: "#2e1a1a", border: "1px solid #e05555", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#e05555" }}>
              {error}
            </div>
          )}

          <button onClick={handleUpload} disabled={!canUpload}
            style={{
              background: !canUpload ? "#1e2535" : "#e8a838",
              color: !canUpload ? "#4a5a7a" : "#0d1117",
              border: "none", borderRadius: 8, padding: "13px 0",
              fontSize: 14, fontWeight: 700,
              cursor: !canUpload ? "default" : "pointer", width: "100%",
            }}>
            {loading ? "Uploading & reconciling…" : "Upload & Reconcile"}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 24, background: "#141824", border: `1px solid ${result.is_reconciled ? "#3d4a2a" : result.sales ? "#4a3a1a" : "#252d3d"}`, borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ fontSize: 20 }}>{result.is_reconciled ? "✅" : result.sales ? "⚠️" : "ℹ️"}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: result.is_reconciled ? "#4caf78" : result.sales ? "#e8a838" : "#5b8fa8" }}>
                  {result.is_reconciled ? "Reconciled" : result.sales ? "Not Reconciled" : "Occupancy Saved"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7a99", marginTop: 2 }}>{result.message}</div>
              </div>
            </div>

            {/* Revenue reconciliation */}
            {result.sales && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>Caterbook Revenue (exc VAT)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#f0f4ff" }}>{fmt(result.sales.excVat)}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>{result.sales.bookingCount} bookings</div>
                  </div>
                  <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>Xero Hotel Revenue</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#f0f4ff" }}>{fmt(result.xero_hotel_revenue)}</div>
                    {result.xero_hotel_revenue === 0 && (
                      <div style={{ fontSize: 10, color: "#e05555", marginTop: 4 }}>No Xero data — run Xero sync first</div>
                    )}
                  </div>
                </div>
                {!result.is_reconciled && result.difference > 0 && (
                  <div style={{ background: "#1e1a14", border: "1px solid #4a3a1a", borderRadius: 8, padding: 14, marginBottom: 20 }}>
                    <div style={{ fontSize: 12, color: "#e8a838", marginBottom: 8 }}>Difference of {fmt(result.difference)} — possible causes:</div>
                    <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        "Xero sync not run for this week — sync Xero first then re-upload",
                        "Wrong week selected — check the date range matches exactly",
                        "Hotel journal in Xero not yet posted — post it then re-sync",
                        "Bookings cancelled or modified after the Caterbook export",
                      ].map((cause, i) => (
                        <li key={i} style={{ fontSize: 12, color: "#8892a8" }}>{cause}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Occupancy KPIs */}
            {result.occupancy && (
              <>
                <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Hotel KPIs</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 12 }}>
                  <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>🏨 Occupancy</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#5b8fa8" }}>{fmtPct(result.occupancy.occupancyPct)}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>{result.occupancy.bookedNights} of {result.occupancy.availableNights} nights</div>
                  </div>
                  <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>🛏 Rooms</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#f0f4ff" }}>{result.occupancy.totalRooms}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>total rooms</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  {[
                    { label: "ADR", value: fmt(result.occupancy.adr), tip: "Average Daily Rate (exc VAT)" },
                    { label: "RevPAR", value: fmt(result.occupancy.revpar), tip: "Revenue Per Available Room (exc VAT)" },
                    { label: "ALOS", value: `${result.occupancy.alos.toFixed(1)} nights`, tip: "Average Length of Stay" },
                  ].map(({ label, value, tip }) => (
                    <div key={label} style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                      <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#e8a838" }}>{value}</div>
                      <div style={{ fontSize: 10, color: "#4a5a7a", marginTop: 4 }}>{tip}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
              <a href="/dashboard" style={{ flex: 1, background: "#1e2535", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, color: "#f0f4ff", textDecoration: "none", textAlign: "center" as const }}>
                Back to Dashboard
              </a>
              {result.sales && !result.is_reconciled && (
                <button onClick={() => { setResult(null); setSalesFile({ file: null, dragging: false }); setOccupancyFile({ file: null, dragging: false }); }}
                  style={{ flex: 1, background: "#e8a838", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, color: "#0d1117", fontWeight: 600, cursor: "pointer" }}>
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
