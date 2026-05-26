import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";

const API = "http://localhost:5000/api";

interface LiveStats {
  totalTrackedSeconds: number;
  productiveSeconds: number;
  idleSeconds: number;
  focusScore: number;
  topApps: { app: string; seconds: number }[];
  sessionStart: string | null;
  lastSeen: string | null;
  eventCount: number;
}

function fmt(s: number) {
  if (!s) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const DashboardPage = () => {
  const { user, logout, token } = useAuth();
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split("T")[0];

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  async function fetchStats() {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/analytics/live?date=${today}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(res.data.data);
    } catch {
      // silently fail — agent may be starting
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 30_000);
    return () => clearInterval(iv);
  }, [token]);

  const topAppsTotal = stats?.topApps.reduce((s, a) => s + a.seconds, 0) || 1;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui,sans-serif", background: "#f8fafc" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: "#0f172a", display: "flex", flexDirection: "column",
        padding: "24px 16px", gap: 8, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#14b8a6,#0d9488)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>W</span>
          </div>
          <div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>PROSYNC</p>
            <p style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>Desktop Agent</p>
          </div>
        </div>

        {["Dashboard", "Activity", "Attendance", "Settings"].map((label, i) => (
          <div key={label} style={{
            padding: "9px 12px", borderRadius: 8, cursor: "pointer",
            background: i === 0 ? "rgba(20,184,166,0.15)" : "transparent",
            color: i === 0 ? "#5eead4" : "#64748b",
            fontSize: 13, fontWeight: i === 0 ? 600 : 400,
          }}>
            {label}
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* User info + logout */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg,#14b8a6,#0d9488)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}>
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.name}
              </p>
              <p style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>{(user as any)?.employeeId}</p>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8,
              background: "rgba(239,68,68,0.12)", color: "#fca5a5",
              border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
              {user?.name?.split(" ")[0]} 👋
            </h1>
            <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{todayLabel} · Tracking active</p>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
            background: "#ecfdf5", borderRadius: 20, border: "1px solid #bbf7d0",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
            <span style={{ color: "#065f46", fontSize: 12, fontWeight: 600 }}>Agent running</span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 13 }}>
            Loading your stats…
          </div>
        ) : (
          <>
            {/* Session start banner */}
            {stats?.sessionStart && (
              <div style={{
                background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12,
                padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: 13,
              }}>
                <span style={{ fontSize: 16 }}>⏱</span>
                <span style={{ color: "#0369a1" }}>
                  Session started at <strong>{fmtTime(stats.sessionStart)}</strong>
                  {stats.lastSeen && <> · Last event <strong>{fmtTime(stats.lastSeen)}</strong></>}
                  {" "}· <strong>{stats.eventCount}</strong> events tracked today
                </span>
              </div>
            )}

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
              {[
                { label: "Tracked Time", value: fmt(stats?.totalTrackedSeconds ?? 0), bg: "#eef2ff", color: "#4f46e5" },
                { label: "Productive", value: fmt(stats?.productiveSeconds ?? 0), bg: "#ecfdf5", color: "#059669" },
                { label: "Idle Time", value: fmt(stats?.idleSeconds ?? 0), bg: "#fffbeb", color: "#d97706" },
                { label: "Focus Score", value: `${stats?.focusScore ?? 0}%`, bg: "#f5f3ff", color: "#7c3aed" },
              ].map(({ label, value, bg, color }) => (
                <div key={label} style={{
                  background: "#fff", borderRadius: 14, padding: "18px 20px",
                  border: "1px solid #e2e8f0",
                }}>
                  <div style={{
                    display: "inline-flex", padding: "4px 10px", borderRadius: 20,
                    background: bg, color, fontSize: 11, fontWeight: 600, marginBottom: 10,
                  }}>
                    {label}
                  </div>
                  <p style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Top apps */}
            {stats?.topApps && stats.topApps.length > 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "20px 22px" }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16, marginTop: 0 }}>
                  Top applications today
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {stats.topApps.slice(0, 6).map(({ app, seconds }, i) => {
                    const colors = ["#4f46e5","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];
                    const pct = Math.round((seconds / topAppsTotal) * 100);
                    return (
                      <div key={app}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{app}</span>
                          <span style={{ fontSize: 12, color: "#64748b" }}>{fmt(seconds)} · {pct}%</span>
                        </div>
                        <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 99,
                            width: `${pct}%`, background: colors[i % colors.length],
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{
                background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
                padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: 13,
              }}>
                No activity tracked yet today. The agent is running in the background and will start recording shortly.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
