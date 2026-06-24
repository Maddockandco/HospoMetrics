"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  style: "currency", currency: "GBP", minimumFractionDigits: 2
}).format(n);

export default function EposUploadPage() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.name.endsWith(".csv")) {
      setFile(dropped);
    } else {
      setError("Please drop a CSV file");
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("week_start", weekStart);

    try {
      const res = await fetch("/api/epos/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

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
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>EPOS Now — Wet & Dry Upload</h1>
          <p style={{ fontSize: 13, color: "#6b7a99", marginTop: 8, lineHeight: 1.6 }}>
            Export the Wet and Dry report from EPOS Now backoffice as CSV and upload it here.
            We'll reconcile the total against Xero and use the split to separate Bar and Restaurant revenue.
          </p>
        </div>

        {/* How to export */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>How to export from EPOS Now</div>
          <ol style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Log into eposnowhq.com",
              "Go to Reporting → Sales Report → Wet and Dry",
              "Set the date range to the week you want (Mon–Sun)",
              "Click Export → CSV",
              "Upload the downloaded file below",
            ].map((step, i) => (
              <li key={i} style={{ fontSize: 13, color: "#8892a8", lineHeight: 1.5 }}>{step}</li>
            ))}
          </ol>
        </div>

        {/* Upload form */}
        <form onSubmit={handleUpload}>
          <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Week picker */}
            <div>
              <label style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                Week
              </label>
              <div style={{ fontSize: 13, color: "#8892a8", marginBottom: 8 }}>{formatWeekLabel(weekStart)}</div>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                style={{ background: "#1e2535", border: "1px solid #252d3d", color: "#f0f4ff", borderRadius: 8, padding: "10px 12px", fontSize: 13, width: "100%", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 6 }}>
                Select the Monday of the week this report covers
              </div>
            </div>

            {/* File picker */}
            <div>
              <label style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                CSV File
              </label>
              <div
                style={{
                  border: `2px dashed ${dragging ? "#e8a838" : file ? "#e8a838" : "#252d3d"}`,
                  borderRadius: 8,
                  padding: "32px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragging ? "#1a2010" : file ? "#1a1e14" : "#0d1117",
                  transition: "all 0.2s",
                }}
                onClick={() => document.getElementById("csv-input")?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <input
                  id="csv-input"
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {dragging ? (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📥</div>
                    <div style={{ fontSize: 13, color: "#e8a838", fontWeight: 600 }}>Drop it here</div>
                  </>
                ) : file ? (
                  <>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
                    <div style={{ fontSize: 13, color: "#e8a838", fontWeight: 600 }}>{file.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — click or drop to change</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                    <div style={{ fontSize: 13, color: "#6b7a99" }}>Drag & drop CSV here, or click to select</div>
                    <div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 4 }}>WetAndDry_*.csv from EPOS Now</div>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div style={{ background: "#2e1a1a", border: "1px solid #e05555", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#e05555" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!file || loading}
              style={{
                background: !file || loading ? "#1e2535" : "#e8a838",
                color: !file || loading ? "#4a5a7a" : "#0d1117",
                border: "none",
                borderRadius: 8,
                padding: "13px 0",
                fontSize: 14,
                fontWeight: 700,
                cursor: !file || loading ? "default" : "pointer",
                width: "100%",
              }}
            >
              {loading ? "Uploading & reconciling…" : "Upload & Reconcile"}
            </button>
          </div>
        </form>

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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
              <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>EPOS Total (ex-VAT)</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f0f4ff" }}>{fmt(result.epos.total)}</div>
              </div>
              <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, border: "1px solid #1e2535" }}>
                <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>Xero Revenue</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f0f4ff" }}>{fmt(result.xero_total)}</div>
                {result.xero_total === 0 && (
                  <div style={{ fontSize: 10, color: "#e05555", marginTop: 4 }}>No Xero data found for this week — run Xero sync first</div>
                )}
              </div>
            </div>

            {result.is_reconciled && (
              <>
                <div style={{ fontSize: 10, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Revenue Split (Actuals)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  <div style={{ background: "#1a1e14", borderRadius: 8, padding: 14, border: "1px solid #3d4a2a" }}>
                    <div style={{ fontSize: 9, color: "#6b7a99", textTransform: "uppercase", marginBottom: 6 }}>🍺 Bar (Wet)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#e8a838" }}>{fmt(result.epos.wet)}</div>
                    <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>
                      {((result.epos.wet / result.epos.total) * 100).toFixed(1)}% of total
                    </div>
                  </div>
                  <div style={{ background: "#1a1e14", borderRadius: 8, padding: 14, border: "1px solid #3d4a2a" }}>
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
                    "Wrong week selected — make sure the date range in EPOS matches this week exactly",
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
                  onClick={() => { setResult(null); setFile(null); }}
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
