"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

const perks = [
  { icon: Clock, text: "Track your attendance & work sessions" },
  { icon: CheckCircle2, text: "Submit daily tasks and EOD reports" },
  { icon: TrendingUp, text: "View your productivity analytics" },
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
      setAuth(user, token);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(msg || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Left hero panel ── */}
      <div
        className="hidden lg:flex"
        style={{
          background:
            "linear-gradient(155deg,#232F3E 0%,#131921 50%,#232F3E 100%)",
          width: "50%",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 380,
            height: 380,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(20,184,166,0.15),transparent)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 260,
            height: 260,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(99,102,241,0.12),transparent)",
            pointerEvents: "none",
          }}
        />

        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            position: "relative",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg,#FF9900,#E68A00)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(20,184,166,0.35)",
            }}
          >
            <svg
              style={{ width: 20, height: 20, color: "#fff" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <div>
            <p
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: 17,
                lineHeight: 1,
              }}
            >
              PROSYNC
            </p>
            <p
              style={{
                color: "#94a3b8",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                marginTop: 4,
              }}
            >
              Employee Portal
            </p>
          </div>
        </div>

        {/* Copy */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 999,
              padding: "6px 14px",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#34d399",
              }}
            />
            <span
              style={{
                color: "rgba(255,255,255,0.65)",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Your personal workspace
            </span>
          </div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            Start your day
            <br />
            <span style={{ color: "#FF9900" }}>stay on track.</span>
          </h1>
          <p
            style={{
              color: "#94a3b8",
              fontSize: 15,
              lineHeight: 1.7,
              marginBottom: 40,
              maxWidth: 320,
            }}
          >
            Log in to plan your tasks, record your day, and view your personal
            productivity at a glance.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {perks.map(({ icon: Icon, text }) => (
              <div
                key={text}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon style={{ width: 16, height: 16, color: "#5eead4" }} />
                </div>
                <p style={{ color: "#cbd5e1", fontSize: 14 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p style={{ color: "#475569", fontSize: 12, position: "relative" }}>
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
          padding: "48px 24px",
          background: "#f8fafc",
        }}
      >
        {/* Mobile brand */}
        <div
          className="flex lg:hidden"
          style={{ alignItems: "center", gap: 12, marginBottom: 40 }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg,#FF9900,#E68A00)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              style={{ width: 18, height: 18, color: "#fff" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <div>
            <p style={{ fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
              PROSYNC
            </p>
            <p
              style={{
                color: "#64748b",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                marginTop: 3,
              }}
            >
              Employee Portal
            </p>
          </div>
        </div>

        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "#0f172a",
                marginBottom: 6,
              }}
            >
              Good to see you
            </h2>
            <p style={{ color: "#64748b", fontSize: 14 }}>
              Sign in to your employee account
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 20 }}
          >
            {/* Email */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 6,
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
                placeholder="you@company.com"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #d1d5db",
                  borderRadius: 12,
                  fontSize: 14,
                  background: "#fff",
                  color: "#111827",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#FF9900";
                  e.target.style.boxShadow = "0 0 0 3px rgba(255,153,0,.12)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#d1d5db";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 6,
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
                    padding: "10px 44px 10px 14px",
                    border: "1px solid #d1d5db",
                    borderRadius: 12,
                    fontSize: 14,
                    background: "#fff",
                    color: "#111827",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#FF9900";
                    e.target.style.boxShadow = "0 0 0 3px rgba(255,153,0,.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#d1d5db";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#9ca3af",
                    display: "flex",
                    padding: 0,
                  }}
                >
                  {showPassword ? (
                    <EyeOff style={{ width: 16, height: 16 }} />
                  ) : (
                    <Eye style={{ width: 16, height: 16 }} />
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
                  gap: 10,
                  padding: "12px 14px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 12,
                  fontSize: 13,
                  color: "#b91c1c",
                }}
              >
                <svg
                  style={{ width: 15, height: 15, marginTop: 1, flexShrink: 0 }}
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
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: loading
                  ? "#FFB84D"
                  : "linear-gradient(135deg,#FF9900,#E68A00)",
                color: "#131921",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 2px 8px rgba(255,153,0,0.35)",
              }}
            >
              {loading ? (
                <>
                  <svg
                    style={{
                      width: 16,
                      height: 16,
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
                  Signing in…
                </>
              ) : (
                "Sign in to portal"
              )}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "#94a3b8",
              marginTop: 32,
            }}
          >
            Admin or HR? Use the{" "}
            <span style={{ color: "#FF9900", fontWeight: 600 }}>
              Admin Portal
            </span>{" "}
            at port 3000.
          </p>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
