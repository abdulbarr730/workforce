import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";

declare global {
  interface Window {
    electronAPI: {
      saveAuth: (token: string, user: unknown) => Promise<boolean>;
      getAuth: () => Promise<{ token: string; user: unknown }>;
      clearAuth: () => Promise<boolean>;
      getTrackingState: () => Promise<TrackingState>;
    };
  }
}

interface TrackingState {
  currentApp: string;
  currentTitle: string;
  currentUrl?: string;
  currentDomain?: string;
  isBrowser: boolean;
  isIdle: boolean;
  screenIndex: number;
  screenLabel: string;
  totalScreens: number;
  lastEventAt: string | null;
  sessionStartAt: string;
  queueSize: number;
}

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

const API = "http://localhost:5000/api";
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#64748b"];

function fmt(s: number) {
  if (!s) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtShort(s: number) {
  if (!s) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function elapsed(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m ago`;
}

function sessionDuration(iso: string): string {
  return fmt(Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

function appInitial(name: string) {
  return name.slice(0, 2).toUpperCase();
}

const BROWSER_ICONS: Record<string, string> = {
  chrome: "🌐", firefox: "🦊", safari: "🧭", edge: "🌀", brave: "🦁", arc: "🌈",
};

function appIcon(appName: string) {
  const n = appName.toLowerCase();
  for (const [k, v] of Object.entries(BROWSER_ICONS)) {
    if (n.includes(k)) return v;
  }
  return null;
}

export const DashboardPage = () => {
  const { user, logout, token } = useAuth();
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [tracking, setTracking] = useState<TrackingState | null>(null);
  const [tick, setTick] = useState(0);
  const today = new Date().toISOString().split("T")[0];
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const greeting =
    new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  // Fetch aggregate stats from API every 30s
  async function fetchStats() {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/analytics/live?date=${today}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(res.data.data);
    } catch {
      // silent — backend might be starting
    }
  }

  // Poll live tracking state from Electron main process every 5s
  async function fetchTracking() {
    try {
      const s = await window.electronAPI.getTrackingState();
      setTracking(s);
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchStats();
    fetchTracking();
    const statsIv = setInterval(fetchStats, 30_000);
    const trackIv = setInterval(fetchTracking, 5_000);
    const clockIv = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => {
      clearInterval(statsIv);
      clearInterval(trackIv);
      clearInterval(clockIv);
    };
  }, [token]);

  const topAppsTotal = stats?.topApps?.reduce((s, a) => s + a.seconds, 0) || 1;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    shell: {
      display: "flex", height: "100vh", fontFamily: "'Inter', system-ui, sans-serif",
      background: "#f1f5f9", overflow: "hidden",
    } as React.CSSProperties,
    sidebar: {
      width: 220, background: "#0f172a", display: "flex", flexDirection: "column" as const,
      padding: "20px 12px", flexShrink: 0, overflowY: "auto" as const,
    },
    main: { flex: 1, overflowY: "auto" as const, padding: "24px 28px" },
    card: {
      background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
      padding: "18px 20px",
    },
  };

  return (
    <div style={S.shell}>
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside style={S.sidebar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "linear-gradient(135deg,#14b8a6,#0891b2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, color: "#fff", fontSize: 15,
          }}>W</div>
          <div>
            <p style={{ color: "#f8fafc", fontWeight: 700, fontSize: 13, margin: 0 }}>PROSYNC</p>
            <p style={{ color: "#475569", fontSize: 10, margin: 0 }}>Desktop Agent v1.0</p>
          </div>
        </div>

        {[
          { icon: "⊞", label: "Dashboard", active: true },
          { icon: "📊", label: "Activity", active: false },
          { icon: "📅", label: "Attendance", active: false },
          { icon: "⚙️", label: "Settings", active: false },
        ].map(({ icon, label, active }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "9px 10px", borderRadius: 8, marginBottom: 2,
            background: active ? "rgba(20,184,166,0.15)" : "transparent",
            color: active ? "#5eead4" : "#64748b",
            fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer",
          }}>
            <span style={{ fontSize: 14 }}>{icon}</span> {label}
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Queue indicator */}
        {tracking && (
          <div style={{
            background: "rgba(255,255,255,0.05)", borderRadius: 8,
            padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "#64748b",
          }}>
            <div style={{ color: "#94a3b8", marginBottom: 2 }}>Upload queue</div>
            <span style={{ color: tracking.queueSize > 50 ? "#fbbf24" : "#22d3ee", fontWeight: 700 }}>
              {tracking.queueSize} events
            </span>
          </div>
        )}

        {/* User card */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg,#14b8a6,#0891b2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0,
            }}>{user?.name?.[0]?.toUpperCase() ?? "U"}</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name}
              </p>
              <p style={{ color: "#475569", fontSize: 10, margin: 0 }}>{(user as any)?.employeeId}</p>
            </div>
          </div>
          <button onClick={logout} style={{
            width: "100%", padding: "7px 0", borderRadius: 7,
            background: "rgba(239,68,68,0.1)", color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer",
            fontSize: 11, fontWeight: 600,
          }}>Sign out</button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main style={S.main}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              {greeting}, {user?.name?.split(" ")[0]} 👋
            </h1>
            <p style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}>{todayLabel}</p>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", background: tracking?.isIdle ? "#fff7ed" : "#ecfdf5",
            borderRadius: 20, border: `1px solid ${tracking?.isIdle ? "#fed7aa" : "#bbf7d0"}`,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: tracking?.isIdle ? "#f97316" : "#10b981",
              animation: tracking?.isIdle ? "none" : undefined,
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: tracking?.isIdle ? "#c2410c" : "#065f46" }}>
              {tracking?.isIdle ? "Idle" : "Tracking active"}
            </span>
          </div>
        </div>

        {/* ── LIVE: Current active window ──────────────────────────────────── */}
        {tracking?.currentApp && !tracking.isIdle && (
          <div style={{
            ...S.card,
            marginBottom: 16, background: "linear-gradient(135deg,#0f172a,#1e293b)",
            border: "1px solid #334155", padding: "14px 18px",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: "rgba(99,102,241,0.2)", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: appIcon(tracking.currentApp) ? 20 : 14,
              fontWeight: 700, color: "#818cf8",
            }}>
              {appIcon(tracking.currentApp) ?? appInitial(tracking.currentApp)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14 }}>
                  {tracking.currentApp}
                </span>
                {tracking.totalScreens > 1 && (
                  <span style={{
                    fontSize: 10, padding: "1px 7px", borderRadius: 10,
                    background: "rgba(99,102,241,0.2)", color: "#a5b4fc",
                  }}>
                    {tracking.screenLabel}
                  </span>
                )}
                {tracking.isBrowser && tracking.currentDomain && (
                  <span style={{
                    fontSize: 10, padding: "1px 7px", borderRadius: 10,
                    background: "rgba(16,185,129,0.15)", color: "#6ee7b7",
                  }}>
                    🌐 {tracking.currentDomain}
                  </span>
                )}
              </div>
              <p style={{
                color: "#64748b", fontSize: 11, margin: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: 480,
              }}>
                {tracking.isBrowser && tracking.currentUrl ? tracking.currentUrl : tracking.currentTitle}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ color: "#64748b", fontSize: 10, margin: "0 0 2px" }}>Session duration</p>
              <p style={{ color: "#22d3ee", fontWeight: 700, fontSize: 14, margin: 0, fontVariantNumeric: "tabular-nums" }}>
                {sessionDuration(tracking.sessionStartAt)}
              </p>
            </div>
          </div>
        )}

        {/* Idle banner */}
        {tracking?.isIdle && (
          <div style={{
            ...S.card,
            marginBottom: 16, background: "#fff7ed",
            border: "1px solid #fed7aa", padding: "12px 18px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>💤</span>
            <div>
              <p style={{ color: "#92400e", fontWeight: 700, fontSize: 13, margin: 0 }}>You appear to be idle</p>
              <p style={{ color: "#b45309", fontSize: 11, margin: 0 }}>
                Last activity: {tracking.lastEventAt ? elapsed(tracking.lastEventAt) : "—"}
              </p>
            </div>
          </div>
        )}

        {/* ── KPI row ──────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
          {[
            {
              label: "Tracked Today", value: fmt(stats?.totalTrackedSeconds ?? 0),
              sub: `${stats?.eventCount ?? 0} events`, color: "#6366f1", bg: "#eef2ff",
            },
            {
              label: "Productive", value: fmt(stats?.productiveSeconds ?? 0),
              sub: stats ? `${Math.round((stats.productiveSeconds / Math.max(stats.totalTrackedSeconds, 1)) * 100)}% of total` : "—",
              color: "#059669", bg: "#ecfdf5",
            },
            {
              label: "Idle Time", value: fmt(stats?.idleSeconds ?? 0),
              sub: "from idle events", color: "#d97706", bg: "#fffbeb",
            },
            {
              label: "Focus Score", value: `${stats?.focusScore ?? 0}%`,
              sub: "productive / total", color: "#7c3aed", bg: "#f5f3ff",
            },
          ].map(({ label, value, sub, color, bg }) => (
            <div key={label} style={S.card}>
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 20,
                background: bg, color, fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
              }}>{label}</span>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 2px", fontVariantNumeric: "tabular-nums" }}>
                {value}
              </p>
              <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Bottom row: top apps + session info ──────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
          {/* Top apps */}
          <div style={S.card}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>
              Top applications today
            </h2>
            {stats?.topApps && stats.topApps.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stats.topApps.slice(0, 8).map(({ app, seconds }, i) => {
                  const pct = Math.round((seconds / topAppsTotal) * 100);
                  const icon = appIcon(app);
                  return (
                    <div key={app}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 500, color: "#1e293b" }}>
                          {icon ? (
                            <span style={{ fontSize: 14 }}>{icon}</span>
                          ) : (
                            <span style={{
                              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                              background: COLORS[i % COLORS.length] + "22",
                              color: COLORS[i % COLORS.length], fontSize: 9, fontWeight: 800,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                            }}>{app.slice(0, 2).toUpperCase()}</span>
                          )}
                          <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {app}
                          </span>
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap", marginLeft: 8 }}>
                          {fmt(seconds)} · {pct}%
                        </span>
                      </div>
                      <div style={{ height: 5, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 99,
                          width: `${pct}%`, background: COLORS[i % COLORS.length],
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 12 }}>
                No app activity recorded yet today.
                <br />The agent is tracking in the background.
              </div>
            )}
          </div>

          {/* Session info panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ ...S.card }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Session
              </h2>
              {[
                {
                  label: "Started",
                  value: tracking ? fmtTime(tracking.sessionStartAt) : stats?.sessionStart ? fmtTime(stats.sessionStart) : "—",
                },
                {
                  label: "Duration",
                  value: tracking ? sessionDuration(tracking.sessionStartAt) : "—",
                },
                {
                  label: "Last event",
                  value: tracking?.lastEventAt ? elapsed(tracking.lastEventAt) : "—",
                },
                {
                  label: "Events today",
                  value: `${stats?.eventCount ?? 0}`,
                },
                {
                  label: "Active screens",
                  value: tracking ? `${tracking.totalScreens}` : "1",
                },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 0", borderBottom: "1px solid #f1f5f9",
                }}>
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>{label}</span>
                  <span style={{ color: "#1e293b", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Current browser URL panel (only when browser is active) */}
            {tracking?.isBrowser && tracking.currentUrl && (
              <div style={{ ...S.card, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <p style={{ color: "#166534", fontSize: 11, fontWeight: 700, margin: "0 0 6px" }}>
                  {appIcon(tracking.currentApp) ?? "🌐"} Active browser tab
                </p>
                <p style={{ color: "#15803d", fontSize: 11, fontWeight: 600, margin: "0 0 4px" }}>
                  {tracking.currentDomain}
                </p>
                <p style={{
                  color: "#4ade80", fontSize: 9, margin: 0, wordBreak: "break-all",
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {tracking.currentUrl}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
