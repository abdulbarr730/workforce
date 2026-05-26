import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";

const API = "http://localhost:5000/api";
const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#64748b","#ec4899","#84cc16"];

// ── Types ────────────────────────────────────────────────────────────────────
interface TrackingState {
  currentApp: string; currentTitle: string;
  currentUrl?: string; currentDomain?: string;
  isBrowser: boolean; isIdle: boolean;
  screenIndex: number; screenLabel: string; totalScreens: number;
  lastEventAt: string | null; sessionStartAt: string; queueSize: number;
}
interface LiveStats {
  totalTrackedSeconds: number; productiveSeconds: number;
  idleSeconds: number; focusScore: number;
  topApps: { app: string; seconds: number }[];
  sessionStart: string | null; lastSeen: string | null; eventCount: number;
}
interface FeedEvent {
  type: string; timestamp: string;
  app?: string; title?: string;
  url?: string; domain?: string;
  isBrowser?: boolean; screenLabel?: string;
  durationSeconds?: number; productivityCategory?: string;
}

type Tab = "dashboard" | "activity" | "attendance" | "settings";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s: number) {
  if (!s) return "0s";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function fmtHM(s: number) {
  if (!s) return "0m";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function elapsed(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function sessionDur(iso: string) {
  return fmt(Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}
function appInitials(n: string) { return n.slice(0, 2).toUpperCase(); }
const ICONS: Record<string, string> = {
  "google chrome": "🌐", "chrome": "🌐", "firefox": "🦊",
  "microsoft edge": "🌀", "edge": "🌀", "brave": "🦁",
  "safari": "🧭", "arc": "🌈", "vs code": "💙", "visual studio code": "💙",
  "slack": "💬", "discord": "🎮", "notion": "📝",
  "figma": "🎨", "zoom": "📹", "spotify": "🎵",
  "microsoft teams": "💼", "terminal": "⬛", "windows terminal": "⬛",
  "postman": "📮", "obsidian": "🔮",
};
function appIcon(n: string) { return ICONS[n.toLowerCase()] ?? null; }
function catColor(cat?: string) {
  if (cat === "PRODUCTIVE") return "#10b981";
  if (cat === "UNPRODUCTIVE") return "#ef4444";
  return "#94a3b8";
}

// ── Main component ───────────────────────────────────────────────────────────
export const DashboardPage = () => {
  const { user, logout, token } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [tracking, setTracking] = useState<TrackingState | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [, setTick] = useState(0);

  const today = new Date().toISOString().split("T")[0];
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API}/analytics/live?date=${today}`, { headers: { Authorization: `Bearer ${token}` } });
      setStats(r.data.data);
    } catch { /* silent */ }
  }, [token, today]);

  const fetchFeed = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API}/analytics/feed?date=${today}&limit=80`, { headers: { Authorization: `Bearer ${token}` } });
      setFeed(r.data.data ?? []);
    } catch { /* silent */ }
  }, [token, today]);

  const fetchTracking = useCallback(async () => {
    try { setTracking(await window.electronAPI.getTrackingState()); } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchStats(); fetchFeed(); fetchTracking();
    const statsIv = setInterval(fetchStats, 30_000);
    const feedIv  = setInterval(fetchFeed, 10_000);
    const trackIv = setInterval(fetchTracking, 2_000); // 2s for snappy live feel
    const clockIv = setInterval(() => setTick(n => n + 1), 1_000);
    return () => { clearInterval(statsIv); clearInterval(feedIv); clearInterval(trackIv); clearInterval(clockIv); };
  }, [fetchStats, fetchFeed, fetchTracking]);

  const topAppsTotal = stats?.topApps?.reduce((s, a) => s + a.seconds, 0) || 1;

  // ── Shared card style ────────────────────────────────────────────────────
  const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "18px 20px" };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter',system-ui,sans-serif", background: "#f1f5f9", overflow: "hidden" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={{ width: 210, background: "#0f172a", display: "flex", flexDirection: "column", padding: "18px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 26 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#14b8a6,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: 14 }}>W</div>
          <div>
            <p style={{ color: "#f8fafc", fontWeight: 700, fontSize: 12, margin: 0 }}>PROSYNC</p>
            <p style={{ color: "#475569", fontSize: 10, margin: 0 }}>Desktop Agent v1.0</p>
          </div>
        </div>

        {([
          { id: "dashboard", icon: "⊞", label: "Dashboard" },
          { id: "activity",  icon: "📋", label: "Activity" },
          { id: "attendance",icon: "📅", label: "Attendance" },
          { id: "settings",  icon: "⚙️", label: "Settings" },
        ] as { id: Tab; icon: string; label: string }[]).map(({ id, icon, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: "flex", alignItems: "center", gap: 9, width: "100%",
            padding: "9px 10px", borderRadius: 8, marginBottom: 2, border: "none", cursor: "pointer",
            background: tab === id ? "rgba(20,184,166,0.18)" : "transparent",
            color: tab === id ? "#5eead4" : "#64748b",
            fontSize: 13, fontWeight: tab === id ? 600 : 400, textAlign: "left",
          }}>
            <span style={{ fontSize: 14 }}>{icon}</span> {label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Tracking status pill */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: tracking?.isIdle ? "#f97316" : "#10b981" }} />
            <span style={{ color: tracking?.isIdle ? "#fdba74" : "#6ee7b7", fontSize: 11, fontWeight: 600 }}>
              {tracking?.isIdle ? "Idle" : "Tracking"}
            </span>
          </div>
          {tracking?.queueSize != null && (
            <p style={{ color: "#475569", fontSize: 10, margin: 0 }}>Queue: {tracking.queueSize} events</p>
          )}
        </div>

        {/* User card */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#14b8a6,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</p>
              <p style={{ color: "#475569", fontSize: 9, margin: 0 }}>{(user as any)?.employeeId}</p>
            </div>
          </div>
          <button onClick={logout} style={{ width: "100%", padding: "6px 0", borderRadius: 7, background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>

        {/* ════════════════ DASHBOARD TAB ════════════════ */}
        {tab === "dashboard" && (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <h1 style={{ fontSize: 19, fontWeight: 800, color: "#0f172a", margin: 0 }}>{greeting}, {user?.name?.split(" ")[0]} 👋</h1>
                <p style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}>{todayLabel}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: tracking?.isIdle ? "#fff7ed" : "#ecfdf5", borderRadius: 20, border: `1px solid ${tracking?.isIdle ? "#fed7aa" : "#bbf7d0"}` }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: tracking?.isIdle ? "#f97316" : "#10b981" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: tracking?.isIdle ? "#c2410c" : "#065f46" }}>
                  {tracking?.isIdle ? "Idle" : "Tracking active"}
                </span>
              </div>
            </div>

            {/* Live current window */}
            {tracking?.currentApp && !tracking.isIdle && (
              <div style={{ ...card, marginBottom: 14, background: "linear-gradient(135deg,#0f172a,#1e293b)", border: "1px solid #334155", padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: appIcon(tracking.currentApp) ? 18 : 12, fontWeight: 700, color: "#818cf8", flexShrink: 0 }}>
                  {appIcon(tracking.currentApp) ?? appInitials(tracking.currentApp)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                    <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13 }}>{tracking.currentApp}</span>
                    {tracking.totalScreens > 1 && (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9, background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>{tracking.screenLabel}</span>
                    )}
                    {tracking.isBrowser && tracking.currentDomain && (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9, background: "rgba(16,185,129,0.15)", color: "#6ee7b7" }}>🌐 {tracking.currentDomain}</span>
                    )}
                  </div>
                  <p style={{ color: "#475569", fontSize: 11, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 440 }}>
                    {tracking.isBrowser && tracking.currentUrl ? tracking.currentUrl : tracking.currentTitle}
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ color: "#475569", fontSize: 9, margin: "0 0 1px" }}>Session</p>
                  <p style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13, margin: 0, fontVariantNumeric: "tabular-nums" }}>
                    {sessionDur(tracking.sessionStartAt)}
                  </p>
                </div>
              </div>
            )}

            {/* Idle banner */}
            {tracking?.isIdle && (
              <div style={{ ...card, marginBottom: 14, background: "#fff7ed", border: "1px solid #fed7aa", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>💤</span>
                <div>
                  <p style={{ color: "#92400e", fontWeight: 700, fontSize: 12, margin: 0 }}>You appear to be idle</p>
                  <p style={{ color: "#b45309", fontSize: 11, margin: 0 }}>Last activity: {tracking.lastEventAt ? elapsed(tracking.lastEventAt) : "—"}</p>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Tracked Today", value: fmt(stats?.totalTrackedSeconds ?? 0), sub: `${stats?.eventCount ?? 0} events`, color: "#6366f1", bg: "#eef2ff" },
                { label: "Productive", value: fmt(stats?.productiveSeconds ?? 0), sub: `${stats ? Math.round((stats.productiveSeconds / Math.max(stats.totalTrackedSeconds, 1)) * 100) : 0}% of total`, color: "#059669", bg: "#ecfdf5" },
                { label: "Idle Time", value: fmtHM(stats?.idleSeconds ?? 0), sub: "from idle events", color: "#d97706", bg: "#fffbeb" },
                { label: "Focus Score", value: `${stats?.focusScore ?? 0}%`, sub: "productive / total", color: "#7c3aed", bg: "#f5f3ff" },
              ].map(({ label, value, sub, color, bg }) => (
                <div key={label} style={card}>
                  <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 18, background: bg, color, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 7 }}>{label}</span>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 1px", fontVariantNumeric: "tabular-nums" }}>{value}</p>
                  <p style={{ fontSize: 9, color: "#94a3b8", margin: 0 }}>{sub}</p>
                </div>
              ))}
            </div>

            {/* Bottom: top apps + session details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 290px", gap: 12 }}>
              <div style={card}>
                <h2 style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Top applications today</h2>
                {stats?.topApps?.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {stats.topApps.slice(0, 8).map(({ app, seconds }, i) => {
                      const pct = Math.round((seconds / topAppsTotal) * 100);
                      const icon = appIcon(app);
                      return (
                        <div key={app}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#1e293b", fontWeight: 500 }}>
                              {icon
                                ? <span style={{ fontSize: 13 }}>{icon}</span>
                                : <span style={{ width: 16, height: 16, borderRadius: 4, background: COLORS[i % COLORS.length] + "22", color: COLORS[i % COLORS.length], fontSize: 8, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{app.slice(0, 2).toUpperCase()}</span>
                              }
                              <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app}</span>
                            </span>
                            <span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap", marginLeft: 8 }}>{fmt(seconds)} · {pct}%</span>
                          </div>
                          <div style={{ height: 4, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: COLORS[i % COLORS.length], transition: "width 0.4s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, padding: "28px 0" }}>No activity recorded yet today.</p>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={card}>
                  <h2 style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", margin: "0 0 10px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Session info</h2>
                  {[
                    { label: "Started", value: fmtTime(tracking?.sessionStartAt ?? stats?.sessionStart) },
                    { label: "Duration", value: tracking ? sessionDur(tracking.sessionStartAt) : "—" },
                    { label: "Last event", value: tracking?.lastEventAt ? elapsed(tracking.lastEventAt) : "—" },
                    { label: "Events today", value: `${stats?.eventCount ?? 0}` },
                    { label: "Screens", value: `${tracking?.totalScreens ?? 1}` },
                    { label: "Upload queue", value: `${tracking?.queueSize ?? 0} events` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ color: "#94a3b8", fontSize: 10 }}>{label}</span>
                      <span style={{ color: "#1e293b", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                    </div>
                  ))}
                </div>

                {tracking?.isBrowser && tracking.currentUrl && (
                  <div style={{ ...card, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                    <p style={{ color: "#166534", fontSize: 11, fontWeight: 700, margin: "0 0 5px" }}>{appIcon(tracking.currentApp) ?? "🌐"} Active tab</p>
                    <p style={{ color: "#15803d", fontSize: 11, fontWeight: 600, margin: "0 0 3px" }}>{tracking.currentDomain}</p>
                    <p style={{ color: "#4ade80", fontSize: 9, margin: 0, wordBreak: "break-all", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>{tracking.currentUrl}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ════════════════ ACTIVITY TAB ════════════════ */}
        {tab === "activity" && (
          <>
            <div style={{ marginBottom: 18 }}>
              <h1 style={{ fontSize: 19, fontWeight: 800, color: "#0f172a", margin: 0 }}>Activity feed</h1>
              <p style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}>Every window switch tracked today — {todayLabel}</p>
            </div>

            {/* Mini stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Total tracked", value: fmt(stats?.totalTrackedSeconds ?? 0), color: "#6366f1" },
                { label: "Productive", value: fmt(stats?.productiveSeconds ?? 0), color: "#10b981" },
                { label: "Events", value: `${feed.length}`, color: "#f59e0b" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 8, height: 36, borderRadius: 4, background: color, flexShrink: 0 }} />
                  <div>
                    <p style={{ color: "#94a3b8", fontSize: 10, margin: 0 }}>{label}</p>
                    <p style={{ color: "#0f172a", fontSize: 16, fontWeight: 800, margin: 0, fontVariantNumeric: "tabular-nums" }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div style={card}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Timeline — {feed.length} events</h2>
              {feed.length === 0 ? (
                <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, padding: "32px 0" }}>
                  No activity tracked yet today. The desktop agent is running and will record events shortly.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 520, overflowY: "auto" }}>
                  {feed.map((ev, i) => {
                    const icon = ev.app ? (appIcon(ev.app) ?? null) : null;
                    const isActive = ev.type === "ACTIVE_WINDOW";
                    const isIdle = ev.type === "IDLE_START" || ev.type === "IDLE_END";
                    const isSession = ev.type === "SESSION_START" || ev.type === "SESSION_END";
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 10px",
                        borderRadius: 8, background: isSession ? "#f0f9ff" : "transparent",
                        borderLeft: `3px solid ${isIdle ? "#f97316" : isSession ? "#0ea5e9" : catColor(ev.productivityCategory)}`,
                      }}>
                        {/* Time */}
                        <span style={{ color: "#94a3b8", fontSize: 10, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", marginTop: 2, minWidth: 52 }}>
                          {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>

                        {/* App icon */}
                        <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: icon ? 12 : 9, fontWeight: 700, color: "#64748b" }}>
                          {isIdle ? "💤" : isSession ? "🚀" : (icon ?? (ev.app?.slice(0, 2).toUpperCase() ?? "—"))}
                        </div>

                        {/* Content */}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>
                              {isIdle ? (ev.type === "IDLE_START" ? "Idle started" : "Returned from idle") : isSession ? ev.type.replace("_", " ") : ev.app}
                            </span>
                            {ev.durationSeconds != null && (
                              <span style={{ fontSize: 10, padding: "0 5px", borderRadius: 8, background: "#f1f5f9", color: "#64748b" }}>
                                {fmt(ev.durationSeconds)}
                              </span>
                            )}
                            {ev.isBrowser && ev.domain && (
                              <span style={{ fontSize: 10, color: "#0891b2" }}>🌐 {ev.domain}</span>
                            )}
                            {ev.screenLabel && ev.screenLabel !== "Primary" && (
                              <span style={{ fontSize: 9, padding: "0 5px", borderRadius: 8, background: "#ede9fe", color: "#7c3aed" }}>{ev.screenLabel}</span>
                            )}
                          </div>
                          {isActive && ev.title && (
                            <p style={{ color: "#64748b", fontSize: 10, margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 480 }}>
                              {ev.isBrowser && ev.url ? ev.url : ev.title}
                            </p>
                          )}
                        </div>

                        {/* Productivity dot */}
                        {isActive && (
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: catColor(ev.productivityCategory), flexShrink: 0, marginTop: 6 }} title={ev.productivityCategory ?? "NEUTRAL"} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════════════ ATTENDANCE TAB ════════════════ */}
        {tab === "attendance" && (
          <>
            <div style={{ marginBottom: 18 }}>
              <h1 style={{ fontSize: 19, fontWeight: 800, color: "#0f172a", margin: 0 }}>Attendance</h1>
              <p style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}>Today's session details</p>
            </div>
            <div style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
                {[
                  { label: "Session started", value: fmtTime(tracking?.sessionStartAt ?? stats?.sessionStart) },
                  { label: "Last seen", value: fmtTime(tracking?.lastEventAt ?? stats?.lastSeen) },
                  { label: "Time on computer", value: fmt(stats?.totalTrackedSeconds ?? 0) },
                  { label: "Productive time", value: fmt(stats?.productiveSeconds ?? 0) },
                  { label: "Idle time", value: fmtHM(stats?.idleSeconds ?? 0) },
                  { label: "Focus score", value: `${stats?.focusScore ?? 0}%` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "14px", background: "#f8fafc", borderRadius: 10 }}>
                    <p style={{ color: "#94a3b8", fontSize: 10, margin: "0 0 4px", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{label}</p>
                    <p style={{ color: "#0f172a", fontSize: 18, fontWeight: 800, margin: 0, fontVariantNumeric: "tabular-nums" }}>{value}</p>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: 14, background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe" }}>
                <p style={{ color: "#1e40af", fontSize: 11, margin: 0 }}>
                  📋 Full attendance records are available in the employee dashboard — open your web browser and go to your dashboard for leave requests, attendance history, and more.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ════════════════ SETTINGS TAB ════════════════ */}
        {tab === "settings" && (
          <>
            <div style={{ marginBottom: 18 }}>
              <h1 style={{ fontSize: 19, fontWeight: 800, color: "#0f172a", margin: 0 }}>Settings</h1>
              <p style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}>Desktop agent configuration</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={card}>
                <h2 style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: "0 0 14px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Account</h2>
                {[
                  { label: "Name", value: user?.name ?? "—" },
                  { label: "Employee ID", value: (user as any)?.employeeId ?? "—" },
                  { label: "Role", value: user?.role ?? "—" },
                  { label: "Company", value: (user as any)?.companyId ?? "prosync" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ color: "#64748b", fontSize: 12 }}>{label}</span>
                    <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={card}>
                <h2 style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: "0 0 14px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Tracking</h2>
                {[
                  { label: "Tracking interval", value: "1s (change detection)" },
                  { label: "Upload interval", value: "Every 15 seconds" },
                  { label: "Idle threshold", value: "2 minutes" },
                  { label: "Active screens", value: `${tracking?.totalScreens ?? 1}` },
                  { label: "Backend", value: API },
                  { label: "Device ID", value: tracking ? `${require("os").hostname()}` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ color: "#64748b", fontSize: 12 }}>{label}</span>
                    <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600, maxWidth: 220, textAlign: "right" as const, wordBreak: "break-all" as const }}>{value}</span>
                  </div>
                ))}
              </div>

              <button onClick={logout} style={{ padding: "12px", borderRadius: 10, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                Sign out of this device
              </button>
            </div>
          </>
        )}

      </main>
    </div>
  );
};
