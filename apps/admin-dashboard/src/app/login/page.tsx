"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Sparkles, Shield, BarChart3, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

const features = [
  { icon: Users, text: "Manage your entire workforce in one place" },
  { icon: BarChart3, text: "Real-time analytics & productivity insights" },
  { icon: Shield, text: "Role-based access control & compliance" },
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
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Left hero panel ── */}
      <div
        style={{
          background:
            "linear-gradient(155deg,#232F3E 0%,#131921 50%,#232F3E 100%)",
          width: "55%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px",
          position: "relative",
          overflow: "hidden",
        }}
        className="hidden lg:flex"
      >
        {/* Glow blobs */}
        <div
          style={{
            position: "absolute",
            top: -140,
            right: -140,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(245,158,11,0.18),transparent)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(129,140,248,0.15),transparent)",
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
              boxShadow: "0 4px 14px rgba(245,158,11,0.4)",
            }}
          >
            <Sparkles style={{ width: 20, height: 20, color: "#fff" }} />
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
                color: "#a5b4fc",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                marginTop: 4,
              }}
            >
              Workforce OS
            </p>
          </div>
        </div>

        {/* Hero copy */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
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
                color: "rgba(255,255,255,0.75)",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Admin &amp; HR Command Center
            </span>
          </div>
          <h1
            style={{
              fontSize: 38,
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            Run your workforce
            <br />
            <span style={{ color: "#FF9900" }}>with confidence.</span>
          </h1>
          <p
            style={{
              color: "#c7d2fe",
              fontSize: 15,
              lineHeight: 1.7,
              marginBottom: 40,
              maxWidth: 360,
            }}
          >
            Attendance, productivity, leaves, shift policies and insights — all
            in one intelligent platform.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {features.map(({ icon: Icon, text }) => (
              <div
                key={text}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon style={{ width: 16, height: 16, color: "#a5b4fc" }} />
                </div>
                <p style={{ color: "#e0e7ff", fontSize: 14 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p style={{ color: "#6366f1", fontSize: 12, position: "relative" }}>
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
            <Sparkles style={{ width: 18, height: 18, color: "#fff" }} />
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
              Workforce OS
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
              Welcome back
            </h2>
            <p style={{ color: "#64748b", fontSize: 14 }}>
              Sign in to your admin account
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
                placeholder="admin@company.com"
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
                  transition: "border-color .15s, box-shadow .15s",
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
                    transition: "border-color .15s, box-shadow .15s",
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
                transition: "filter .15s, transform .05s",
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
                "Sign in to dashboard"
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
            Employee? Use the{" "}
            <span style={{ color: "#FF9900", fontWeight: 600 }}>
              Employee Portal
            </span>{" "}
            at port 3001.
          </p>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
