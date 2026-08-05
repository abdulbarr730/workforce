"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Sparkles, Shield, BarChart3, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

const features = [
  { icon: Users, text: "Manage workforce & team schedules" },
  { icon: BarChart3, text: "Real-time analytics & daily reports" },
  { icon: Shield, text: "Role-based access & compliance controls" },
];

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/api/auth/login", form);
      const { token, user } = res.data.data;
      if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
        setError("Access denied. Use the Employee Portal instead.");
        return;
      }
      setAuth(user, token);
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(msg || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      {/* ── Left hero panel ── */}
      <div
        className="hidden lg:flex"
        style={{
          background:
            "linear-gradient(155deg,#1f2937 0%,#111827 50%,#0f172a 100%)",
          width: "40%",
          maxWidth: 440,
          minWidth: 360,
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "36px 36px",
          position: "relative",
          overflow: "hidden",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Subtle decorative glow */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 280,
            height: 280,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(255,153,0,0.14),transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 240,
            height: 240,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(129,140,248,0.12),transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Brand Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            position: "relative",
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "linear-gradient(135deg,#FF9900,#E68A00)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 10px rgba(255,153,0,0.3)",
            }}
          >
            <Sparkles style={{ width: 16, height: 16, color: "#fff" }} />
          </div>
          <div>
            <p
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: 14.5,
                lineHeight: 1.1,
                letterSpacing: "0.02em",
              }}
            >
              PROSYNC
            </p>
            <p
              style={{
                color: "#a5b4fc",
                fontSize: 9.5,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                marginTop: 2,
              }}
            >
              Workforce OS
            </p>
          </div>
        </div>

        {/* Hero Copy & Feature List */}
        <div style={{ position: "relative", margin: "auto 0", padding: "24px 0" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 999,
              padding: "4px 10px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#34d399",
              }}
            />
            <span
              style={{
                color: "rgba(255,255,255,0.75)",
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Admin &amp; HR Command Center
            </span>
          </div>

          <h1
            style={{
              fontSize: 25,
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1.25,
              marginBottom: 10,
              letterSpacing: "-0.01em",
            }}
          >
            Run your workforce
            <br />
            <span style={{ color: "#FF9900" }}>with confidence.</span>
          </h1>

          <p
            style={{
              color: "#cbd5e1",
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: 26,
              maxWidth: 320,
            }}
          >
            Attendance, productivity, leaves, shift policies and analytics all in one platform.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {features.map(({ icon: Icon, text }) => (
              <div
                key={text}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Icon style={{ width: 14, height: 14, color: "#a5b4fc" }} />
                </div>
                <p style={{ color: "#e0e7ff", fontSize: 12.5, lineHeight: 1.35 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ color: "#64748b", fontSize: 11, position: "relative" }}>
          © 2026 Prosync Infotech · Workforce Operations Platform
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          background: "#ffffff",
        }}
      >
        {/* Mobile-only brand */}
        <div
          className="flex lg:hidden"
          style={{ alignItems: "center", gap: 10, marginBottom: 28 }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "linear-gradient(135deg,#FF9900,#E68A00)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles style={{ width: 16, height: 16, color: "#fff" }} />
          </div>
          <div>
            <p style={{ fontWeight: 700, color: "#0f172a", fontSize: 15, lineHeight: 1.1 }}>
              PROSYNC
            </p>
            <p
              style={{
                color: "#64748b",
                fontSize: 9.5,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                marginTop: 2,
              }}
            >
              Workforce OS
            </p>
          </div>
        </div>

        <div style={{ width: "100%", maxWidth: 340 }}>
          <div style={{ marginBottom: 22 }}>
            <h2
              style={{
                fontSize: 21,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 4,
                letterSpacing: "-0.01em",
              }}
            >
              Welcome back
            </h2>
            <p style={{ color: "#64748b", fontSize: 13 }}>
              Sign in to your admin account
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 15 }}
          >
            {/* Email */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: 5,
                }}
              >
                Work email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@company.com"
                style={{
                  width: "100%",
                  height: 38,
                  padding: "0 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: 9,
                  fontSize: 13,
                  background: "#fff",
                  color: "#0f172a",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "all 0.15s ease",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#FF9900";
                  e.target.style.boxShadow = "0 0 0 3px rgba(255,153,0,0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#cbd5e1";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: 5,
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    height: 38,
                    padding: "0 38px 0 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: 9,
                    fontSize: 13,
                    background: "#fff",
                    color: "#0f172a",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "all 0.15s ease",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#FF9900";
                    e.target.style.boxShadow = "0 0 0 3px rgba(255,153,0,0.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#cbd5e1";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#94a3b8",
                    display: "flex",
                    padding: 4,
                  }}
                >
                  {showPassword ? (
                    <EyeOff style={{ width: 15, height: 15 }} />
                  ) : (
                    <Eye style={{ width: 15, height: 15 }} />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "9px 12px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#b91c1c",
                }}
              >
                <svg
                  style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                height: 38,
                background: loading
                  ? "#FFB84D"
                  : "linear-gradient(135deg,#FF9900,#E68A00)",
                color: "#111827",
                border: "none",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(255,153,0,0.25)",
                transition: "all 0.15s ease",
                marginTop: 4,
              }}
            >
              {loading ? (
                <>
                  <svg
                    style={{
                      width: 14,
                      height: 14,
                      animation: "spin 1s linear infinite",
                    }}
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      style={{ opacity: 0.25 }}
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      style={{ opacity: 0.75 }}
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span>Signing in…</span>
                </>
              ) : (
                "Sign in to dashboard"
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
