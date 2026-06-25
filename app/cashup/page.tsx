"use client";

// 📁 app/cashup/page.tsx
// Staff-facing nightly till reconciliation form
// Matches the Gales HTML design exactly — submit POSTs to /api/reconciliation

import { useState, useEffect, useCallback } from "react";

function num(val: string): number | null {
  return val === "" ? null : parseFloat(val);
}

type PreviewState = "empty" | "ok" | "warn" | "bad";

function getPreviewState(value: number | null, hasInputs: boolean): PreviewState {
  if (!hasInputs || value === null) return "empty";
  const a = Math.abs(value);
  return a <= 2 ? "ok" : a <= 10 ? "warn" : "bad";
}

function fmtVariance(value: number | null): string {
  if (value === null) return "—";
  return (value < 0 ? "-" : "") + "£" + Math.abs(value).toFixed(2);
}

const PREVIEW_STYLES: Record<PreviewState, { bg: string; color: string; border: string }> = {
  empty: { bg: "#1e2535",      color: "#6b7a99", border: "#252d3d" },
  ok:    { bg: "#0f2e1a",      color: "#4caf78", border: "#1a4a2a" },
  warn:  { bg: "#2e2410",      color: "#e8a838", border: "#4a3a1a" },
  bad:   { bg: "#2e1212",      color: "#e05555", border: "#4a2020" },
};

export default function CashUpPage() {
  const [selectedTill, setSelectedTill] = useState("Inside Bar");
  const [date, setDate] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [prevNight, setPrevNight] = useState("");
  const [openCount, setOpenCount] = useState("");
  const [endCount, setEndCount] = useState("");
  const [eposCash, setEposCash] = useState("");
  const [withdrawals, setWithdrawals] = useState("");
  const [pettyCash, setPettyCash] = useState("");
  const [pdq1, setPdq1] = useState("");
  const [pdq2, setPdq2] = useState("");
  const [eposCard, setEposCard] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
  }, []);

  // Variance calculations
  const cashInputsPresent = [openCount, endCount, eposCash, withdrawals, pettyCash].some(v => v !== "");
  const cashVar = cashInputsPresent
    ? ((num(endCount) || 0) - (num(openCount) || 0) + (num(withdrawals) || 0) + (num(pettyCash) || 0)) - (num(eposCash) || 0)
    : null;

  const cardReaderTotal = (pdq1 !== "" || pdq2 !== "") ? (num(pdq1) || 0) + (num(pdq2) || 0) : null;
  const cardInputsPresent = cardReaderTotal !== null && eposCard !== "";
  const cardVar = cardInputsPresent ? cardReaderTotal! - (num(eposCard) || 0) : null;

  const totalInputsPresent = cashVar !== null && cardVar !== null;
  const totalVar = totalInputsPresent ? cashVar! + cardVar! : null;

  const cashState = getPreviewState(cashVar, cashInputsPresent);
  const cardState = getPreviewState(cardVar, cardInputsPresent);
  const totalState = getPreviewState(totalVar, totalInputsPresent);

  const handleSubmit = useCallback(async () => {
    if (!date || !submittedBy) {
      setStatus({ type: "error", text: "Please fill in the date and your name before submitting." });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          till: selectedTill,
          submittedBy,
          note,
          previousNightCount: num(prevNight),
          openCount: num(openCount),
          endOfShiftCount: num(endCount),
          eposCashTaken: num(eposCash),
          withdrawals: num(withdrawals),
          pettyCash: num(pettyCash),
          cardReading1: num(pdq1),
          cardReading2: num(pdq2),
          eposnowCardTakings: num(eposCard),
        }),
      });
      if (res.status === 409) {
        setStatus({ type: "error", text: `A submission for ${selectedTill} on ${date} already exists.` });
        return;
      }
      if (!res.ok) throw new Error("Server error " + res.status);
      setStatus({ type: "success", text: `✓ Submitted — ${selectedTill} for ${date}` });
      // Clear number fields and note, keep name and till for next submission
      setPrevNight(""); setOpenCount(""); setEndCount(""); setEposCash("");
      setWithdrawals(""); setPettyCash(""); setPdq1(""); setPdq2("");
      setEposCard(""); setNote("");
    } catch (err: any) {
      setStatus({ type: "error", text: "Could not submit (" + err.message + "). Try again or contact your manager." });
    } finally {
      setSubmitting(false);
    }
  }, [date, selectedTill, submittedBy, note, prevNight, openCount, endCount, eposCash, withdrawals, pettyCash, pdq1, pdq2, eposCard]);

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1e2535", border: "1px solid #252d3d",
    borderRadius: 6, padding: "11px 13px", fontSize: 16,
    color: "#f0f4ff", fontFamily: "inherit", boxSizing: "border-box",
    WebkitAppearance: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600,
    letterSpacing: "0.05em", textTransform: "uppercase",
    color: "#6b7a99", marginBottom: 6,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#f0f4ff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #e8a838 !important; }
        textarea { resize: vertical; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#141824", borderBottom: "1px solid #1e2535", padding: "18px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 2 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#e8a838" }} />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>HospoMetrics</span>
        </div>
        <div style={{ fontSize: 12, color: "#6b7a99", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Nightly Till Reconciliation
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px 60px" }}>

        {/* Basics card */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e2535", background: "#1a1f2e" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Basics</div>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Submitted by</label>
                <input type="text" value={submittedBy} onChange={e => setSubmittedBy(e.target.value)} placeholder="Your name" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Till</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Inside Bar", "Outside Bar"].map(till => (
                  <button key={till} onClick={() => setSelectedTill(till)} style={{
                    flex: 1, padding: "12px", textAlign: "center", border: "1px solid",
                    borderColor: selectedTill === till ? "#e8a838" : "#252d3d",
                    borderRadius: 6, background: selectedTill === till ? "#2e2410" : "#1e2535",
                    fontWeight: 600, fontSize: 14, cursor: "pointer",
                    color: selectedTill === till ? "#e8a838" : "#6b7a99",
                  }}>
                    {till}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Cash card */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e2535", background: "#1a1f2e" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Cash</div>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Previous night count (£)</label>
                <input type="number" step="0.01" inputMode="decimal" value={prevNight} onChange={e => setPrevNight(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Open cash count (£)</label>
                <input type="number" step="0.01" inputMode="decimal" value={openCount} onChange={e => setOpenCount(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>End of shift count (£)</label>
                <input type="number" step="0.01" inputMode="decimal" value={endCount} onChange={e => setEndCount(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Epos cash taken (£)</label>
                <input type="number" step="0.01" inputMode="decimal" value={eposCash} onChange={e => setEposCash(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Withdrawals (£)</label>
                <input type="number" step="0.01" inputMode="decimal" value={withdrawals} onChange={e => setWithdrawals(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Petty cash (£)</label>
                <input type="number" step="0.01" inputMode="decimal" value={pettyCash} onChange={e => setPettyCash(e.target.value)} style={inputStyle} />
              </div>
            </div>
            {/* Cash variance preview */}
            <div style={{ background: PREVIEW_STYLES[cashState].bg, border: `1px solid ${PREVIEW_STYLES[cashState].border}`, borderRadius: 6, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#8892a8" }}>Cash Variance</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: PREVIEW_STYLES[cashState].color }}>{fmtVariance(cashVar)}</span>
            </div>
          </div>
        </div>

        {/* Card card */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e2535", background: "#1a1f2e" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Card</div>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Card reading 1 (£)</label>
                <input type="number" step="0.01" inputMode="decimal" value={pdq1} onChange={e => setPdq1(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Card reading 2 (£)</label>
                <input type="number" step="0.01" inputMode="decimal" value={pdq2} onChange={e => setPdq2(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Eposnow card takings (£)</label>
              <input type="number" step="0.01" inputMode="decimal" value={eposCard} onChange={e => setEposCard(e.target.value)} style={inputStyle} />
            </div>
            {/* Card variance preview */}
            <div style={{ background: PREVIEW_STYLES[cardState].bg, border: `1px solid ${PREVIEW_STYLES[cardState].border}`, borderRadius: 6, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#8892a8" }}>Card Variance</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: PREVIEW_STYLES[cardState].color }}>{fmtVariance(cardVar)}</span>
            </div>
          </div>
        </div>

        {/* Total & Notes card */}
        <div style={{ background: "#141824", border: "1px solid #252d3d", borderRadius: 10, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e2535", background: "#1a1f2e" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Total & Notes</div>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Total variance preview */}
            <div style={{ background: PREVIEW_STYLES[totalState].bg, border: `1px solid ${PREVIEW_STYLES[totalState].border}`, borderRadius: 6, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#8892a8" }}>Total Variance</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: PREVIEW_STYLES[totalState].color }}>{fmtVariance(totalVar)}</span>
            </div>
            <div>
              <label style={labelStyle}>Note (why might there be a variance?)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional, but please add one if the variance looks more than a couple of pounds out."
                style={{ ...inputStyle, minHeight: 80, lineHeight: 1.5 }}
              />
            </div>
          </div>
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: "100%", padding: 16, background: submitting ? "#4a5a7a" : "#e8a838",
            color: submitting ? "#8892a8" : "#0d1117", border: "none", borderRadius: 8,
            fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
            letterSpacing: "0.02em", transition: "background 0.15s",
          }}
        >
          {submitting ? "Submitting…" : "Submit reconciliation"}
        </button>

        {/* Status message */}
        {status && (
          <div style={{
            marginTop: 14, padding: "12px 16px", borderRadius: 6, fontSize: 14,
            background: status.type === "success" ? "#0f2e1a" : "#2e1212",
            color: status.type === "success" ? "#4caf78" : "#e05555",
            border: `1px solid ${status.type === "success" ? "#1a4a2a" : "#4a2020"}`,
          }}>
            {status.text}
          </div>
        )}
      </div>
    </div>
  );
}
