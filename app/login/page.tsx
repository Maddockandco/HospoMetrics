"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d1117",
      display: "flex",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#f0f4ff",
    }}>
      {/* Left panel — branding */}
      <div style={{
        flex: 1,
        background: "linear-gradient(135deg, #0d1117 0%, #141824 50%, #1a2235 100%)",
        borderRight: "1px solid #1e2535",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 48,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#e8a838", boxShadow: "0 0 12px #e8a83880" }} />
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>HospoMetrics</span>
        </div>

        {/* Centre content */}
        <div>
          <div style={{ fontSize: 11, color: "#e8a838", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 20 }}>
            Hospitality Intelligence
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, marginBottom: 20 }}>
            Know your numbers.<br />
            <span style={{ color: "#e8a838" }}>Every week.</span>
          </h1>
          <p style={{ fontSize: 15, color: "#6b7a99", lineHeight: 1.6, maxWidth: 380, margin: 0 }}>
            Real-time P&L by revenue stream, spend spike detection, and seasonal forecasting — built for hotels, bars, and restaurants.
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 32, marginTop: 48 }}>
            {[
              { value: "3", label: "Revenue Streams" },
              { value: "17", label: "Weeks Tracked" },
              { value: "25%", label: "Spike Threshold" },
            ].map(({ value, label }) => (
              <div key={label}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#f0f4ff", letterSpacing: "-0.02em" }}>{value}</div>
                <div style={{ fontSize: 11, color: "#4a5a7a", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ fontSize: 11, color: "#3d4a63" }}>
          Powered by Maddock & Co · Built on Xero
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={{
        width: 480,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "48px 56px",
        background: "#0d1117",
      }}>
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, marginBottom: 8 }}>
            Sign in
          </h2>
          <p style={{ fontSize: 13, color: "#6b7a99", margin: 0 }}>
            Enter your credentials to access your dashboard
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: "100%",
                background: "#141824",
                border: "1px solid #252d3d",
                borderRadius: 8,
                padding: "12px 14px",
                color: "#f0f4ff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => e.target.style.borderColor = "#e8a838"}
              onBlur={(e) => e.target.style.borderColor = "#252d3d"}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: "100%",
                background: "#141824",
                border: "1px solid #252d3d",
                borderRadius: 8,
                padding: "12px 14px",
                color: "#f0f4ff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => e.target.style.borderColor = "#e8a838"}
              onBlur={(e) => e.target.style.borderColor = "#252d3d"}
            />
          </div>

          {error && (
            <div style={{
              background: "#2e1a1a",
              border: "1px solid #e05555",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              color: "#e05555",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              background: loading ? "#2a2f42" : "#e8a838",
              color: loading ? "#6b7a99" : "#0d1117",
              border: "none",
              borderRadius: 8,
              padding: "13px 0",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              letterSpacing: "-0.01em",
              transition: "background 0.2s, transform 0.1s",
              width: "100%",
            }}
            onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = "#f0b840"; }}
            onMouseLeave={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = "#e8a838"; }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <div style={{ marginTop: 40, padding: "20px", background: "#141824", borderRadius: 10, border: "1px solid #1e2535" }}>
          <div style={{ fontSize: 10, color: "#4a5a7a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            What you'll see
          </div>
          {[
            "Weekly P&L by Bar, Restaurant & Hotel",
            "Spend spike alerts at 25% threshold",
            "8-week trend analysis",
          ].map((item) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#e8a838", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#6b7a99" }}>{item}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: "#3d4a63", textAlign: "center" }}>
          Access restricted to authorised users only
        </div>
      </div>
    </div>
  );
}
