import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";
import { TodoModal } from "../components/TodoModal";
import { EodModal } from "../components/EodModal";
import { SegmentsModal } from "../components/SegmentsModal";
import { Calendar } from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#64748b",
  "#ec4899",
  "#84cc16",
];

// ── Types ────────────────────────────────────────────────────────────────────
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
  currentAppStartedAt: string | null;
  isScreenshotTrackingEnabled?: boolean;
  isTrackingPaused?: boolean;
}
interface LiveStats {
  totalTrackedSeconds: number;
  productiveSeconds: number;
  idleSeconds: number;
  focusScore: number;
  breakSeconds: number;
  offlineWorkSeconds: number;
  topApps: { app: string; seconds: number }[];
  sessionStart: string | null;
  lastSeen: string | null;
  eventCount: number;
  expectedLogoutTime?: string | null;
  segments?: {
    start: string;
    end: string;
    durationSecs: number;
    type: string;
  }[];
}
interface FeedEvent {
  type: string;
  timestamp: string;
  app?: string;
  title?: string;
  url?: string;
  domain?: string;
  isBrowser?: boolean;
  screenLabel?: string;
  durationSeconds?: number;
  productivityCategory?: string;
}

type Tab = "dashboard" | "activity" | "attendance" | "settings";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s: number) {
  if (!s) return "0s";
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function fmtHM(s: number) {
  if (!s) return "0m";
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
function getShiftTimeLeft(expectedOut?: string | null) {
  if (!expectedOut) return null;
  const ms = new Date(expectedOut).getTime() - Date.now();
  if (ms <= 0) return "Shift Complete!";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h > 0 ? h + "h " : ""}${m}m ${s}s left`;
}
function appInitials(n: string) {
  return n.slice(0, 2).toUpperCase();
}
const ICONS: Record<string, string> = {
  "google chrome": "🌐",
  chrome: "🌐",
  firefox: "🦊",
  "microsoft edge": "🌀",
  edge: "🌀",
  brave: "🦁",
  safari: "🧭",
  arc: "🌈",
  "vs code": "💙",
  "visual studio code": "💙",
  slack: "💬",
  discord: "🎮",
  notion: "📝",
  figma: "🎨",
  zoom: "📹",
  spotify: "🎵",
  "microsoft teams": "💼",
  terminal: "⬛",
  "windows terminal": "⬛",
  postman: "📮",
  obsidian: "🔮",
};
function appIcon(n: string) {
  return ICONS[n.toLowerCase()] ?? null;
}

// ── Main component ───────────────────────────────────────────────────────────
export const DashboardPage = () => {
  const { user, logout, token } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [tracking, setTracking] = useState<TrackingState | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [shiftInfo, setShiftInfo] = useState<{
    shift: string;
    isLate: boolean;
    isHalfDay?: boolean;
    loginTime: string;
    shiftEndTime: string;
  } | null>(null);
  const [showTodo, setShowTodo] = useState(false);
  const [showEod, setShowEod] = useState(false);
  const [modalType, setModalType] = useState<"BREAK" | "OFFLINE" | null>(null);
  const [eodSubmittedLocally, setEodSubmittedLocally] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [isSchedulePaused, setIsSchedulePaused] = useState(false);
  const [, setTick] = useState(0);
  const [updateReady, setUpdateReady] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 17
        ? "Good afternoon"
        : "Good evening";

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API}/analytics/live?date=${today}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(r.data.data);
    } catch {
      /* silent */
    }
  }, [token, today]);

  // Initial setup: Assign shift and check if Todo is needed
  useEffect(() => {
    if (!token) return;
    const initFlow = async () => {
      try {
        const shiftRes = await axios.post(
          `${API}/me/shift/assign`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setShiftInfo(shiftRes.data.data);

        const todoRes = await axios.get(`${API}/me/todos/today`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!todoRes.data.data) {
          setShowTodo(true);
        }

        const eodRes = await axios.get(`${API}/me/eod/today`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (eodRes.data.data) {
          setEodSubmittedLocally(true);
        }
      } catch (err: any) {
        console.error("Init flow error", err);
        if (!err.response || err.response.status >= 500) {
          setTimeout(initFlow, 5000);
        }
      }
    };
    initFlow();

    if ((window as any).electronAPI.onNewDay) {
      (window as any).electronAPI.onNewDay(() => {
        setEodSubmittedLocally(false);
        setIsSleeping(false);
        try {
          (window as any).electronAPI.startTracking();
        } catch {}
        window.location.reload();
      });
    }

    if ((window as any).electronAPI.onOpenEod) {
      (window as any).electronAPI.onOpenEod(() => {
        setShowEod(true);
      });
    }

    if ((window as any).electronAPI.onSchedulePaused) {
      (window as any).electronAPI.onSchedulePaused(() => {
        setIsSchedulePaused(true);
      });
    }

    if ((window as any).electronAPI.onScheduleResumed) {
      (window as any).electronAPI.onScheduleResumed(() => {
        setIsSchedulePaused(false);
      });
    }

    if ((window as any).electronAPI.onUpdateDownloaded) {
      (window as any).electronAPI.onUpdateDownloaded((version: string) => {
        setUpdateReady(version);
      });
    }
  }, [token]);

  const fetchFeed = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(
        `${API}/analytics/feed?date=${today}&limit=80`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setFeed(r.data.data ?? []);
    } catch {
      /* silent */
    }
  }, [token, today]);

  const fetchTracking = useCallback(async () => {
    if (isSleeping) return;
    try {
      setTracking(await (window as any).electronAPI.getTrackingState());
    } catch {
      /* silent */
    }
  }, [isSleeping]);

  useEffect(() => {
    if (isSleeping) return;
    fetchStats();
    fetchFeed();
    fetchTracking();
    const statsIv = setInterval(fetchStats, 30_000);
    const feedIv = setInterval(fetchFeed, 10_000);
    const trackIv = setInterval(fetchTracking, 2_000); // 2s for snappy live feel
    const clockIv = setInterval(() => setTick((n: number) => n + 1), 1_000);
    return () => {
      clearInterval(statsIv);
      clearInterval(feedIv);
      clearInterval(trackIv);
      clearInterval(clockIv);
    };
  }, [fetchStats, fetchFeed, fetchTracking, isSleeping]);

  // Shift watcher logic
  useEffect(() => {
    if (!shiftInfo?.shiftEndTime || isSleeping) return;
    const checkShiftEnd = () => {
      const [h, m] = shiftInfo.shiftEndTime.split(":").map(Number);
      const now = new Date();
      if (now.getHours() === h && now.getMinutes() === m) {
        setShowEod(true);
      }
    };
    const iv = setInterval(checkShiftEnd, 30_000);
    return () => clearInterval(iv);
  }, [shiftInfo, isSleeping]);

  const handleSleep = useCallback(async () => {
    if (!eodSubmittedLocally) {
      alert("You must submit your EOD report fully before logging out.");
      return;
    }
    setIsSleeping(true);
    setShowEod(false);
    try {
      await (window as any).electronAPI.stopTracking();
    } catch {}
  }, [eodSubmittedLocally]);

  const handleCloseTodo = useCallback(() => setShowTodo(false), []);
  const handleCloseEod = useCallback(() => setShowEod(false), []);
  const handleSubmitSuccessEod = useCallback(() => {
    setShowEod(false);
    setEodSubmittedLocally(true);
  }, []);

  const handleWakeUp = async () => {
    setIsSleeping(false);
    try {
      await (window as any).electronAPI.startTracking();
    } catch {}
  };

  const topAppsTotal =
    stats?.topApps?.reduce((s: number, a: any) => s + a.seconds, 0) || 1;

  // ── Shared card style ────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    padding: "18px 20px",
  };

  if (isSleeping) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          fontFamily: "'Inter',system-ui,sans-serif",
          background: "#0f172a",
          color: "#fff",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
          🌙 Shift Ended
        </h1>
        <p style={{ color: "#94a3b8", marginBottom: 32 }}>
          Your tracking has been paused. Have a great rest of your day!
        </p>
        <button
          onClick={handleWakeUp}
          style={{
            padding: "14px 24px",
            borderRadius: 10,
            background: "#10b981",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          ☀️ Wake up & Start New Shift
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Inter',system-ui,sans-serif",
        background: "#f1f5f9",
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: 210,
          background: "#0f172a",
          display: "flex",
          flexDirection: "column",
          padding: "18px 10px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginBottom: 26,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "linear-gradient(135deg,#FF9900,#E68A00)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: "#fff",
              fontSize: 14,
            }}
          >
            W
          </div>
          <div>
            <p
              style={{
                color: "#f8fafc",
                fontWeight: 700,
                fontSize: 12,
                margin: 0,
              }}
            >
              PROSYNC
            </p>
            <p style={{ color: "#475569", fontSize: 10, margin: 0 }}>
              Desktop Agent v1.0
            </p>
          </div>
        </div>

        {(
          [
            { id: "dashboard", icon: "⊞", label: "Dashboard" },
            { id: "settings", icon: "⚙️", label: "Settings" },
          ] as { id: Tab; icon: string; label: string }[]
        ).map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              width: "100%",
              padding: "9px 10px",
              borderRadius: 8,
              marginBottom: 2,
              border: "none",
              cursor: "pointer",
              background: tab === id ? "rgba(20,184,166,0.18)" : "transparent",
              color: tab === id ? "#5eead4" : "#64748b",
              fontSize: 13,
              fontWeight: tab === id ? 600 : 400,
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 14 }}>{icon}</span> {label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Tracking status pill */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            borderRadius: 8,
            padding: "8px 10px",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: tracking?.isIdle ? "#f97316" : "#10b981",
              }}
            />
            <span
              style={{
                color: tracking?.isIdle ? "#fdba74" : "#6ee7b7",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {tracking?.isIdle ? "Idle" : "Tracking"}
            </span>
          </div>
          {tracking?.queueSize != null && (
            <p style={{ color: "#475569", fontSize: 10, margin: 0 }}>
              Queue: {tracking.queueSize} events
            </p>
          )}
        </div>

        {/* Update Notification */}
        {updateReady && (
          <div
            onClick={() => (window as any).electronAPI.installUpdate()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 12,
              padding: "12px",
              marginBottom: 12,
              border: "1px solid rgba(255,255,255,0.1)",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.03)")
            }
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  color: "#e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{ color: "#f8fafc", fontSize: 13, fontWeight: 600 }}
                >
                  Relaunch to update
                </span>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>
                  v{updateReady}
                </span>
              </div>
            </div>
            <div style={{ color: "#94a3b8" }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </div>
        )}

        {/* User card */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.07)",
            paddingTop: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#FF9900,#E68A00)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              {(user as any)?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  color: "#e2e8f0",
                  fontSize: 11,
                  fontWeight: 600,
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {(user as any)?.name}
              </p>
              <p style={{ color: "#475569", fontSize: 9, margin: 0 }}>
                {(user as any)?.employeeId}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowEod(true)}
            style={{
              width: "100%",
              padding: "6px 0",
              borderRadius: 7,
              background: "rgba(59,130,246,0.1)",
              color: "#93c5fd",
              border: "1px solid rgba(59,130,246,0.2)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Submit EOD Report
          </button>
          <button
            onClick={handleSleep}
            style={{
              width: "100%",
              padding: "6px 0",
              borderRadius: 7,
              background: "rgba(239,68,68,0.15)",
              color: "#fca5a5",
              border: "1px solid rgba(239,68,68,0.3)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Modals */}
      {showTodo && <TodoModal token={token!} onClose={handleCloseTodo} />}
      {showEod && (
        <EodModal
          token={token!}
          onClose={handleCloseEod}
          onSubmitSuccess={handleSubmitSuccessEod}
          onSignOut={handleSleep}
        />
      )}
      {modalType && (
        <SegmentsModal
          type={modalType}
          segments={stats?.segments ?? []}
          onClose={() => setModalType(null)}
        />
      )}

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>
        {/* ════════════════ DASHBOARD TAB ════════════════ */}
        {tab === "dashboard" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <div>
                <h1
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: 0,
                  }}
                >
                  {greeting}, {(user as any)?.name?.split(" ")[0]} 👋
                </h1>
                <p
                  style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}
                >
                  {todayLabel}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {shiftInfo && (
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <div
                        style={{
                          padding: "3px 8px",
                          background: shiftInfo.isHalfDay
                            ? "#ffedd5"
                            : shiftInfo.isLate
                              ? "#fee2e2"
                              : "#e0e7ff",
                          color: shiftInfo.isHalfDay
                            ? "#c2410c"
                            : shiftInfo.isLate
                              ? "#991b1b"
                              : "#3730a3",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Shift: {shiftInfo.shift}{" "}
                        {shiftInfo.isHalfDay
                          ? "(Half Day)"
                          : shiftInfo.isLate
                            ? "(Late Entry)"
                            : ""}
                      </div>
                      <div
                        style={{
                          padding: "3px 8px",
                          background: "#f1f5f9",
                          color: "#475569",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        ⏱ Logged In: {shiftInfo.loginTime} | Ends:{" "}
                        {shiftInfo.shiftEndTime}
                      </div>
                      {stats?.expectedLogoutTime && (
                        <div
                          style={{
                            padding: "3px 8px",
                            background: "#fef08a",
                            color: "#854d0e",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            border: "1px solid #fde047",
                            minWidth: 80,
                            textAlign: "center",
                          }}
                        >
                          ⏳ {getShiftTimeLeft(stats.expectedLogoutTime)}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setShowTodo(true)}
                    style={{
                      background: "#f1f5f9",
                      color: "#475569",
                      border: "1px solid #cbd5e1",
                      borderRadius: 4,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ✏️ Edit Daily Plan
                  </button>
                  {eodSubmittedLocally && !isSleeping && (
                    <div
                      style={{
                        padding: "3px 8px",
                        background: "#fef3c7",
                        color: "#b45309",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        border: "1px solid #fde68a",
                      }}
                    >
                      ⚠️ EOD Submitted - Logout Pending
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    background: tracking?.isTrackingPaused
                      ? "#f1f5f9"
                      : tracking?.isIdle
                        ? "#fff7ed"
                        : "#ecfdf5",
                    borderRadius: 20,
                    border: `1px solid ${tracking?.isTrackingPaused ? "#cbd5e1" : tracking?.isIdle ? "#fed7aa" : "#bbf7d0"}`,
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: tracking?.isTrackingPaused
                        ? "#64748b"
                        : tracking?.isIdle
                          ? "#f97316"
                          : "#10b981",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: tracking?.isTrackingPaused
                        ? "#334155"
                        : tracking?.isIdle
                          ? "#c2410c"
                          : "#065f46",
                    }}
                  >
                    {tracking?.isTrackingPaused
                      ? "Paused"
                      : tracking?.isIdle
                        ? "Idle"
                        : "Tracking active"}
                  </span>
                </div>
              </div>
            </div>

            {/* Live current window */}
            {tracking?.currentApp && !tracking.isIdle && (
              <div
                style={{
                  ...card,
                  marginBottom: 14,
                  background: "linear-gradient(135deg,#232F3E,#131A22)",
                  border: "1px solid #334155",
                  padding: "13px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "rgba(255,153,0,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: appIcon(tracking.currentApp) ? 18 : 12,
                    fontWeight: 700,
                    color: "#FF9900",
                    flexShrink: 0,
                  }}
                >
                  {appIcon(tracking.currentApp) ??
                    appInitials(tracking.currentApp)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        color: "#f1f5f9",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {tracking.currentApp}
                    </span>
                    {tracking.totalScreens > 1 && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 9,
                          background: "rgba(255,153,0,0.2)",
                          color: "#FF9900",
                        }}
                      >
                        {tracking.screenLabel}
                      </span>
                    )}
                    {tracking.isBrowser && tracking.currentDomain && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 9,
                          background: "rgba(16,185,129,0.15)",
                          color: "#6ee7b7",
                        }}
                      >
                        🌐 {tracking.currentDomain}
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: 11,
                      margin: "0 0 3px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 440,
                    }}
                  >
                    {tracking.isBrowser && tracking.currentUrl
                      ? tracking.currentUrl
                      : tracking.currentTitle}
                  </p>
                  <p
                    style={{
                      color: "#4ade80",
                      fontSize: 11,
                      fontWeight: 500,
                      margin: 0,
                    }}
                  >
                    Right now this app is being used by{" "}
                    <span style={{ color: "#fff" }}>
                      {(user as any)?.name?.split(" ")[0] || "you"}
                    </span>{" "}
                    and for{" "}
                    <span style={{ color: "#fff" }}>
                      {tracking.currentAppStartedAt
                        ? sessionDur(tracking.currentAppStartedAt)
                        : "0s"}
                    </span>
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p
                    style={{ color: "#475569", fontSize: 9, margin: "0 0 1px" }}
                  >
                    Session
                  </p>
                  <p
                    style={{
                      color: "#FF9900",
                      fontWeight: 700,
                      fontSize: 13,
                      margin: 0,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {sessionDur(tracking.sessionStartAt)}
                  </p>
                </div>
              </div>
            )}

            {/* Idle banner */}
            {tracking?.isIdle && (
              <div
                style={{
                  ...card,
                  marginBottom: 14,
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 18 }}>💤</span>
                <div>
                  <p
                    style={{
                      color: "#92400e",
                      fontWeight: 700,
                      fontSize: 12,
                      margin: 0,
                    }}
                  >
                    You appear to be idle
                  </p>
                  <p style={{ color: "#b45309", fontSize: 11, margin: 0 }}>
                    Last activity:{" "}
                    {tracking.lastEventAt ? elapsed(tracking.lastEventAt) : "—"}
                  </p>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5,1fr)",
                gap: 10,
                marginBottom: 14,
              }}
            >
              {(() => {
                const displayTracked = stats?.totalTrackedSeconds ?? 0;
                return [
                  {
                    label: "Tracked Today",
                    value: fmt(displayTracked),
                    sub: `${stats?.eventCount ?? 0} events`,
                    color: "#6366f1",
                    bg: "#eef2ff",
                    type: null,
                  },
                  {
                    label: "Productive",
                    value: fmt(stats?.productiveSeconds ?? 0),
                    sub: `${stats ? Math.round((stats.productiveSeconds / Math.max(stats.totalTrackedSeconds, 1)) * 100) : 0}%`,
                    color: "#059669",
                    bg: "#ecfdf5",
                    type: null,
                  },
                  {
                    label: "Focus Score",
                    value: `${stats?.focusScore ?? 0}%`,
                    sub: "productive / total",
                    color: "#7c3aed",
                    bg: "#f5f3ff",
                    type: null,
                  },
                  {
                    label: "Break Time",
                    value: fmt(stats?.breakSeconds ?? 0),
                    sub: "on break",
                    color: "#d97706",
                    bg: "#fffbeb",
                    type: "BREAK",
                  },
                  {
                    label: "Offline Work",
                    value: fmt(stats?.offlineWorkSeconds ?? 0),
                    sub: "away from pc",
                    color: "#0284c7",
                    bg: "#f0f9ff",
                    type: "OFFLINE",
                  },
                ].map(({ label, value, sub, color, bg, type }) => (
                  <div
                    key={label}
                    style={{
                      ...card,
                      cursor: type ? "pointer" : "default",
                      transition: "transform 0.2s, box-shadow 0.2s",
                    }}
                    onClick={() =>
                      type && setModalType(type as "BREAK" | "OFFLINE")
                    }
                    onMouseEnter={(e) => {
                      if (type) {
                        e.currentTarget.style.transform = "scale(1.03)";
                        e.currentTarget.style.boxShadow =
                          "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (type) {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                      }
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 7px",
                        borderRadius: 18,
                        background: bg,
                        color,
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.04em",
                        marginBottom: 7,
                      }}
                    >
                      {label}
                    </span>
                    <p
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: "#0f172a",
                        margin: "0 0 1px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {value}
                    </p>
                    <p style={{ fontSize: 9, color: "#94a3b8", margin: 0 }}>
                      {sub}
                    </p>
                  </div>
                ));
              })()}
            </div>

            {/* Bottom: top apps + session details */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 290px",
                gap: 12,
              }}
            >
              <div style={card}>
                <h2
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#0f172a",
                    margin: "0 0 14px",
                  }}
                >
                  Top applications today
                </h2>
                {stats?.topApps?.length ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 9 }}
                  >
                    {stats.topApps.slice(0, 8).map(({ app, seconds }, i) => {
                      const pct = Math.round((seconds / topAppsTotal) * 100);
                      const icon = appIcon(app);
                      return (
                        <div key={app}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: 3,
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                color: "#1e293b",
                                fontWeight: 500,
                              }}
                            >
                              {icon ? (
                                <span style={{ fontSize: 13 }}>{icon}</span>
                              ) : (
                                <span
                                  style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 4,
                                    background:
                                      COLORS[i % COLORS.length] + "22",
                                    color: COLORS[i % COLORS.length],
                                    fontSize: 8,
                                    fontWeight: 800,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {app.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                              <span
                                style={{
                                  maxWidth: 180,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {app}
                              </span>
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color: "#64748b",
                                whiteSpace: "nowrap",
                                marginLeft: 8,
                              }}
                            >
                              {fmt(seconds)} · {pct}%
                            </span>
                          </div>
                          <div
                            style={{
                              height: 4,
                              background: "#f1f5f9",
                              borderRadius: 99,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                borderRadius: 99,
                                width: `${pct}%`,
                                background: COLORS[i % COLORS.length],
                                transition: "width 0.4s",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p
                    style={{
                      textAlign: "center",
                      color: "#94a3b8",
                      fontSize: 12,
                      padding: "28px 0",
                    }}
                  >
                    No activity recorded yet today.
                  </p>
                )}
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {isSchedulePaused && (
                  <div
                    style={{
                      background: "rgba(234,179,8,0.15)",
                      border: "1px solid rgba(234,179,8,0.3)",
                      padding: "12px 16px",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <Calendar
                      style={{ width: 20, height: 20, color: "#eab308" }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#eab308",
                        }}
                      >
                        Outside Working Hours
                      </div>
                      <div
                        style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}
                      >
                        Tracking is paused automatically based on your schedule.
                      </div>
                    </div>
                  </div>
                )}
                <div style={card}>
                  <h2
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#0f172a",
                      margin: "0 0 10px",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
                    }}
                  >
                    Session info
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <span style={{ color: "#94a3b8", fontSize: 10 }}>
                      Started
                    </span>
                    <span
                      style={{
                        color: "#1e293b",
                        fontSize: 11,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {stats?.sessionStart
                        ? fmtTime(stats.sessionStart)
                        : tracking
                          ? fmtTime(tracking.sessionStartAt)
                          : "—"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <span style={{ color: "#94a3b8", fontSize: 10 }}>
                      Duration
                    </span>
                    <span
                      style={{
                        color: "#1e293b",
                        fontSize: 11,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {stats?.sessionStart
                        ? sessionDur(stats.sessionStart)
                        : tracking
                          ? sessionDur(tracking.sessionStartAt)
                          : "—"}
                    </span>
                  </div>
                  {[
                    {
                      label: "Last event",
                      value: tracking?.lastEventAt
                        ? elapsed(tracking.lastEventAt)
                        : "—",
                    },
                    {
                      label: "Events today",
                      value: `${stats?.eventCount ?? 0}`,
                    },
                    {
                      label: "Screens",
                      value: `${tracking?.totalScreens ?? 1}`,
                    },
                    {
                      label: "Upload queue",
                      value: `${tracking?.queueSize ?? 0} events`,
                    },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "4px 0",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <span style={{ color: "#94a3b8", fontSize: 10 }}>
                        {label}
                      </span>
                      <span
                        style={{
                          color: "#1e293b",
                          fontSize: 11,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                {tracking?.isBrowser && tracking.currentUrl && (
                  <div
                    style={{
                      ...card,
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    <p
                      style={{
                        color: "#166534",
                        fontSize: 11,
                        fontWeight: 700,
                        margin: "0 0 5px",
                      }}
                    >
                      {appIcon(tracking.currentApp) ?? "🌐"} Active tab
                    </p>
                    <p
                      style={{
                        color: "#15803d",
                        fontSize: 11,
                        fontWeight: 600,
                        margin: "0 0 3px",
                      }}
                    >
                      {tracking.currentDomain}
                    </p>
                    <p
                      style={
                        {
                          color: "#4ade80",
                          fontSize: 9,
                          margin: 0,
                          wordBreak: "break-all",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        } as React.CSSProperties
                      }
                    >
                      {tracking.currentUrl}
                    </p>
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
              <h1
                style={{
                  fontSize: 19,
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                Activity feed
              </h1>
              <p style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}>
                Every window switch tracked today — {todayLabel}
              </p>
            </div>

            {/* Mini stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 10,
                marginBottom: 16,
              }}
            >
              {[
                {
                  label: "Total tracked",
                  value: fmt(stats?.totalTrackedSeconds ?? 0),
                  color: "#6366f1",
                },
                {
                  label: "Productive",
                  value: fmt(stats?.productiveSeconds ?? 0),
                  color: "#10b981",
                },
                { label: "Events", value: `${feed.length}`, color: "#f59e0b" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    ...card,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 36,
                      borderRadius: 4,
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <p style={{ color: "#94a3b8", fontSize: 10, margin: 0 }}>
                      {label}
                    </p>
                    <p
                      style={{
                        color: "#0f172a",
                        fontSize: 16,
                        fontWeight: 800,
                        margin: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {value}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline Disabled */}
            <div style={card}>
              <p
                style={{
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: 12,
                  padding: "32px 0",
                }}
              >
                Detailed tracking timeline is securely hidden for your privacy.
                <br />
                Your high-level statistics are visible on the Dashboard tab.
              </p>
            </div>
          </>
        )}

        {/* ════════════════ ATTENDANCE TAB ════════════════ */}
        {tab === "attendance" && (
          <>
            <div style={{ marginBottom: 18 }}>
              <h1
                style={{
                  fontSize: 19,
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                Attendance
              </h1>
              <p style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}>
                Today's session details
              </p>
            </div>
            <div style={card}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2,1fr)",
                  gap: 16,
                }}
              >
                {[
                  {
                    label: "Session started",
                    value: fmtTime(
                      tracking?.sessionStartAt ?? stats?.sessionStart,
                    ),
                  },
                  {
                    label: "Last seen",
                    value: fmtTime(tracking?.lastEventAt ?? stats?.lastSeen),
                  },
                  {
                    label: "Time on computer",
                    value: fmt(stats?.totalTrackedSeconds ?? 0),
                  },
                  {
                    label: "Productive time",
                    value: fmt(stats?.productiveSeconds ?? 0),
                  },
                  { label: "Idle time", value: fmtHM(stats?.idleSeconds ?? 0) },
                  { label: "Focus score", value: `${stats?.focusScore ?? 0}%` },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      padding: "14px",
                      background: "#f8fafc",
                      borderRadius: 10,
                    }}
                  >
                    <p
                      style={{
                        color: "#94a3b8",
                        fontSize: 10,
                        margin: "0 0 4px",
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {label}
                    </p>
                    <p
                      style={{
                        color: "#0f172a",
                        fontSize: 18,
                        fontWeight: 800,
                        margin: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  background: "#eff6ff",
                  borderRadius: 10,
                  border: "1px solid #bfdbfe",
                }}
              >
                <p style={{ color: "#1e40af", fontSize: 11, margin: 0 }}>
                  📋 Full attendance records are available in the employee
                  dashboard — open your web browser and go to your dashboard for
                  leave requests, attendance history, and more.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ════════════════ SETTINGS TAB ════════════════ */}
        {tab === "settings" && (
          <>
            <div style={{ marginBottom: 18 }}>
              <h1
                style={{
                  fontSize: 19,
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                Settings
              </h1>
              <p style={{ color: "#64748b", fontSize: 12, margin: "3px 0 0" }}>
                Desktop agent configuration
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={card}>
                <h2
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#0f172a",
                    margin: "0 0 14px",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.05em",
                  }}
                >
                  Account
                </h2>
                {[
                  { label: "Name", value: (user as any)?.name ?? "—" },
                  {
                    label: "Employee ID",
                    value: (user as any)?.employeeId ?? "—",
                  },
                  { label: "Role", value: user?.role ?? "—" },
                  {
                    label: "Department",
                    value: (user as any)?.departmentName ?? "—",
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "7px 0",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <span style={{ color: "#64748b", fontSize: 12 }}>
                      {label}
                    </span>
                    <span
                      style={{
                        color: "#0f172a",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={logout}
                style={{
                  padding: "12px",
                  borderRadius: 10,
                  background: "#fef2f2",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Sign out of this device
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
