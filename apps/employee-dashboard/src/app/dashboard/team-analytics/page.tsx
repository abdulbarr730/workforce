"use client";
import { useState, useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { TeamOverview } from "./TeamOverview";
import { formatDate } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Search,
  X,
  Clock,
  MonitorPlay,
  Activity,
  Power,
  Filter,
  PlayCircle,
  StopCircle,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  User,
  Coffee,
  UserX,
  CheckCircle2,
  Calendar,
  ExternalLink,
  Layers,
  TrendingUp,
} from "lucide-react";

// Vibrant, curated color palette
const PIE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#10b981",
];

function fmtSecs(s: number) {
  if (!s) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m ${secs}s`;
  if (m > 0) return `${m}m ${secs}s`;
  return `${secs}s`;
}

function getFallbackUrl(app: string, title: string) {
  const s = (app || "").toLowerCase();
  const t = (title || "").toLowerCase();
  if (s === "spotify" || t.includes("spotify")) return "https://open.spotify.com";
  if (s === "google calendar" || t.includes("google calendar"))
    return "https://calendar.google.com";
  if (s === "google sheets" || t.includes("google sheets"))
    return "https://docs.google.com/spreadsheets";
  if (s === "google docs" || t.includes("google docs"))
    return "https://docs.google.com/document";
  if (s === "gmail" || t.includes("gmail")) return "https://mail.google.com";
  if (s === "google meet" || t.includes("meet.google"))
    return "https://meet.google.com";
  if (s === "whatsapp" || t.includes("whatsapp"))
    return "https://web.whatsapp.com";
  if (s === "notion" || t.includes("notion")) return "https://notion.so";
  if (s === "figma" || t.includes("figma")) return "https://figma.com";
  if (s === "github" || t.includes("github")) return "https://github.com";
  if (s === "youtube" || t.includes("youtube")) return "https://youtube.com";
  if (s === "linkedin" || t.includes("linkedin")) return "https://linkedin.com";
  if (s === "chatgpt" || t.includes("chatgpt")) return "https://chatgpt.com";
  if (s === "claude" || t.includes("claude")) return "https://claude.ai";
  return null;
}

// Visual Interactive Day Timeline
function DayTimelineBar({
  segments,
  exactLoginTime,
  exactLogoutTime,
  lastSeen,
}: {
  segments: {
    start: string;
    end: string;
    durationSecs: number;
    type: string;
  }[];
  exactLoginTime?: string | null;
  exactLogoutTime?: string | null;
  lastSeen?: string | null;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<{
    type: string;
    start: string;
    end: string;
    durationSecs: number;
  } | null>(null);

  if (!segments || segments.length === 0) return null;

  const totalSecs = segments.reduce((acc, s) => acc + (s.durationSecs || 0), 0);
  if (totalSecs <= 0) return null;

  const typeConfig: Record<
    string,
    { label: string; bg: string; dot: string; text: string }
  > = {
    PRODUCTIVE: {
      label: "Productive Work",
      bg: "bg-emerald-500 hover:bg-emerald-600",
      dot: "bg-emerald-500",
      text: "text-emerald-700",
    },
    BREAK: {
      label: "Logged Break",
      bg: "bg-amber-400 hover:bg-amber-500",
      dot: "bg-amber-400",
      text: "text-amber-700",
    },
    OFFLINE: {
      label: "Offline / Meeting Work",
      bg: "bg-purple-500 hover:bg-purple-600",
      dot: "bg-purple-500",
      text: "text-purple-700",
    },
    UNPRODUCTIVE: {
      label: "Unproductive / Distraction",
      bg: "bg-rose-500 hover:bg-rose-600",
      dot: "bg-rose-500",
      text: "text-rose-700",
    },
    NEUTRAL: {
      label: "Neutral / System Task",
      bg: "bg-slate-300 hover:bg-slate-400",
      dot: "bg-slate-400",
      text: "text-slate-700",
    },
    IDLE: {
      label: "Away from PC / Inactivity",
      bg: "bg-orange-400 hover:bg-orange-500",
      dot: "bg-orange-400",
      text: "text-orange-700",
    },
  };

  return (
    <div className="bg-white border border-slate-200/70 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50"></div>
            Continuous Day Activity Timeline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Visual progression of active focus, breaks, away-from-PC intervals, and tasks.
          </p>
        </div>

        {/* Hovered segment indicator tooltip */}
        {hoveredSegment ? (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 shadow-sm animate-in fade-in duration-150">
            <span
              className={`w-2 h-2 rounded-full ${typeConfig[hoveredSegment.type]?.dot || "bg-slate-400"}`}
            ></span>
            <span className="font-bold">
              {typeConfig[hoveredSegment.type]?.label || hoveredSegment.type}
            </span>
            <span className="text-slate-400">|</span>
            <span className="font-mono text-slate-600">
              {new Date(hoveredSegment.start).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              -{" "}
              {new Date(hoveredSegment.end).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-indigo-600 font-bold">
              {fmtSecs(hoveredSegment.durationSecs)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-400 font-medium">
            Hover over timeline segments to view details
          </span>
        )}
      </div>

      {/* Visual Bar */}
      <div className="relative w-full h-8 bg-slate-100 rounded-2xl overflow-hidden flex border border-slate-200/70 p-0.5 gap-0.5">
        {segments.map((seg, idx) => {
          const pct = Math.max(0.5, (seg.durationSecs / totalSecs) * 100);
          const conf = typeConfig[seg.type] || typeConfig.NEUTRAL;
          return (
            <div
              key={idx}
              style={{ width: `${pct}%` }}
              className={`h-full rounded-sm transition-all duration-150 cursor-pointer ${conf.bg}`}
              onMouseEnter={() => setHoveredSegment(seg)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs border-t border-slate-100 text-slate-600 font-medium">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Productive</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>Break</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
            <span>Away / Idle</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span>Offline Work</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>Unproductive</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
          {exactLoginTime && (
            <span>
              Start:{" "}
              <strong className="text-slate-600">
                {new Date(exactLoginTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
            </span>
          )}
          {exactLogoutTime ? (
            <span>
              End:{" "}
              <strong className="text-slate-600">
                {new Date(exactLogoutTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
            </span>
          ) : lastSeen ? (
            <span>
              Last seen:{" "}
              <strong className="text-slate-600">
                {new Date(lastSeen).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TeamAnalyticsContent() {
  const { user } = useAuthStore();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [dateInput, setDateInput] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Filters for feed
  const [appFilter, setAppFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");

  // Modals
  const [selectedAppForModal, setSelectedAppForModal] = useState<string | null>(
    null
  );
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<"ALL" | "SYSTEM">("ALL");

  const resetFilters = () => {
    setAppFilter("");
    setCategoryFilter("ALL");
    setTimeFrom("");
    setTimeTo("");
  };

  const hasActiveFilters =
    appFilter !== "" ||
    categoryFilter !== "ALL" ||
    timeFrom !== "" ||
    timeTo !== "";

  // Fetch users
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const allUsers = Array.isArray(users) ? users : (users?.users ?? []);
  const teamEmployees = allUsers.filter(
    (u: { role: string; departmentId?: string }) =>
      u.role !== "SUPER_ADMIN" && u.role !== "ADMIN"
  );

  const selectedEmployeeObj = teamEmployees.find(
    (e: any) => e.employeeId === employeeId
  );

  // Live Stats for selected employee
  const { data: liveStats, isLoading } = useQuery({
    queryKey: ["analytics-live", employeeId, dateInput],
    queryFn: () =>
      api
        .get(`/api/analytics/live?employeeId=${employeeId}&date=${dateInput}`)
        .then((r) => r.data.data),
    enabled: !!employeeId,
    refetchInterval: 15_000,
  });

  // 7-day trend
  const { data: trendAnalytics } = useQuery({
    queryKey: ["analytics-trend", employeeId],
    queryFn: () =>
      api
        .get(`/api/analytics/employee-trend?employeeId=${employeeId}`)
        .then((r) => r.data.data),
    enabled: !!employeeId,
  });

  // Activity Feed
  const { data: feed } = useQuery({
    queryKey: ["analytics-feed", employeeId, dateInput],
    queryFn: () =>
      api
        .get(
          `/api/analytics/feed?employeeId=${employeeId}&date=${dateInput}&limit=2000`
        )
        .then((r) => r.data.data),
    enabled: !!employeeId,
    refetchInterval: 15_000,
  });

  const filteredFeed = useMemo(() => {
    if (!feed) return [];

    const normalizedFeed = feed.map((ev: any) => {
      let overrideApp = ev.app;
      if (ev.title) {
        if (ev.title.endsWith("- Google Chrome")) overrideApp = "Google Chrome";
        else if (
          ev.title.endsWith("- Microsoft Edge") ||
          ev.title.endsWith("- Personal - Microsoft Edge")
        )
          overrideApp = "Microsoft Edge";
        else if (ev.title.endsWith("- Brave")) overrideApp = "Brave";
        else if (ev.title.endsWith("- Mozilla Firefox"))
          overrideApp = "Firefox";
      }
      return { ...ev, app: overrideApp };
    });

    return normalizedFeed.filter((ev: any) => {
      if (ev.type === "IDLE_START" || ev.type === "IDLE_END") return false;

      if (feedTab === "SYSTEM") {
        const isSystem = [
          "SYSTEM_SLEEP",
          "SYSTEM_WAKE",
          "APP_CRASH",
          "TRACKING_STOPPED",
          "SESSION_START",
          "SESSION_END",
        ].includes(ev.type);
        if (!isSystem) return false;
      } else {
        if (
          [
            "SYSTEM_SLEEP",
            "SYSTEM_WAKE",
            "APP_CRASH",
            "TRACKING_STOPPED",
            "SESSION_START",
            "SESSION_END",
          ].includes(ev.type)
        )
          return false;
      }

      let matchesApp = true;
      if (appFilter) {
        const search = appFilter.toLowerCase();
        const appName = (ev.app || "").toLowerCase();
        const url = (ev.url || "").toLowerCase();
        const domain = (ev.domain || "").toLowerCase();
        const title = (ev.title || "").toLowerCase();
        matchesApp =
          appName.includes(search) ||
          url.includes(search) ||
          domain.includes(search) ||
          title.includes(search);
      }

      let matchesCategory = true;
      if (categoryFilter !== "ALL") {
        matchesCategory = ev.productivityCategory === categoryFilter;
      }

      let matchesTime = true;
      if (timeFrom || timeTo) {
        const d = new Date(ev.timestamp);
        const hh = d.getHours().toString().padStart(2, "0");
        const mm = d.getMinutes().toString().padStart(2, "0");
        const timeStr = `${hh}:${mm}`;
        if (timeFrom && timeStr < timeFrom) matchesTime = false;
        if (timeTo && timeStr > timeTo) matchesTime = false;
      }
      return matchesApp && matchesCategory && matchesTime;
    });
  }, [feed, appFilter, categoryFilter, timeFrom, timeTo, feedTab]);

  if (user?.role !== "MANAGER") {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2 font-medium">
          Only department managers have access to team analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 font-sans text-slate-800">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-xl border border-slate-200/70 p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3.5">
          {employeeId ? (
            <button
              onClick={() => setEmployeeId("")}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-all border border-slate-200/60 shadow-sm cursor-pointer group"
              title="Back to Team Overview"
            >
              <ChevronLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Activity size={22} className="stroke-[2.5]" />
            </div>
          )}

          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              {employeeId ? (
                <>
                  <span>{selectedEmployeeObj?.name || employeeId}</span>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Team Telemetry
                  </span>
                </>
              ) : (
                "Team Analytics"
              )}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {employeeId
                ? `Detailed productivity telemetry, work hours, breaks & activity audit`
                : `Monitor department-wide productivity, attendance, and task status`}
            </p>
          </div>
        </div>

        {/* Controls: Member Selector & Date Picker */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Employee Selector */}
          <div className="relative group">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="appearance-none bg-white text-slate-700 font-semibold rounded-2xl py-2.5 pl-4 pr-10 text-sm border border-slate-200/80 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer min-w-[210px] transition-all hover:bg-slate-50"
            >
              <option value="">👥 All Team Overview</option>
              {teamEmployees.map((e: any) => (
                <option key={e.employeeId} value={e.employeeId}>
                  👤 {e.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 group-hover:text-indigo-500 transition-colors">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-white border border-slate-200/80 shadow-sm rounded-2xl py-1.5 px-3">
            <Calendar size={15} className="text-slate-400" />
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="bg-transparent text-slate-700 font-semibold text-sm focus:outline-none cursor-pointer"
            />
          </div>

          {/* Quick Today Button */}
          {dateInput !== new Date().toISOString().split("T")[0] && (
            <button
              onClick={() => setDateInput(new Date().toISOString().split("T")[0])}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition border border-indigo-200/60 shadow-sm cursor-pointer"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Main View Mode */}
      {!employeeId ? (
        <TeamOverview
          dateInput={dateInput}
          users={users}
          onSelectEmployee={(empId) => setEmployeeId(empId)}
        />
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm">
          <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin shadow-md"></div>
          <p className="mt-6 text-sm font-bold text-slate-600 uppercase tracking-widest animate-pulse">
            Analyzing Team Member Telemetry...
          </p>
        </div>
      ) : (
        liveStats && (
          <div className="space-y-6">
            {/* Shift & Session Status Hero Bar */}
            {(() => {
              const isOnline = liveStats.lastSeen
                ? Date.now() - new Date(liveStats.lastSeen).getTime() < 5 * 60 * 1000
                : false;

              return (
                <div className="bg-white border border-slate-200/70 rounded-3xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-2 ${
                      isOnline ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  ></div>

                  <div className="flex items-center gap-4 pl-3">
                    <div className="relative flex h-5 w-5 items-center justify-center">
                      {isOnline && !liveStats.exactLogoutTime && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      )}
                      <span
                        className={`relative inline-flex rounded-full h-4 w-4 ${
                          isOnline ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      ></span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-lg font-black text-slate-900">
                          {isOnline ? "🟢 Active Working Session" : "⚪ Offline Session"}
                        </h2>
                        {liveStats.shiftAssigned && (
                          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-lg">
                            Shift: {liveStats.shiftAssigned}
                          </span>
                        )}
                        {liveStats.attendanceStatus && (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg ${
                              liveStats.attendanceStatus === "PRESENT"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : liveStats.attendanceStatus === "LATE"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : liveStats.attendanceStatus === "HALF_DAY"
                                ? "bg-orange-50 text-orange-700 border border-orange-200"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            Status: {liveStats.attendanceStatus}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 mt-1 font-medium flex items-center gap-2">
                        <span>{liveStats.eventCount} telemetry datapoints collected</span>
                        <span className="text-slate-300">•</span>
                        <span>Date: {formatDate(dateInput)}</span>
                        {!isOnline && liveStats.lastSeen && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                              Last active:{" "}
                              {new Date(liveStats.lastSeen).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Timestamps Snapshot */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/60">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-white rounded-xl shadow-sm text-emerald-500 border border-slate-100">
                        <PlayCircle size={17} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Login Time
                        </div>
                        <div className="text-sm font-black text-slate-800">
                          {liveStats.exactLoginTime
                            ? new Date(liveStats.exactLoginTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "--:--"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-white rounded-xl shadow-sm text-amber-500 border border-slate-100">
                        <Clock size={17} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Expected Logout
                        </div>
                        <div className="text-sm font-black text-slate-800">
                          {liveStats.expectedLogoutTime
                            ? new Date(liveStats.expectedLogoutTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "--:--"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-white rounded-xl shadow-sm text-rose-500 border border-slate-100">
                        <StopCircle size={17} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Actual Logout
                        </div>
                        <div className="text-sm font-black text-slate-800">
                          {liveStats.exactLogoutTime ? (
                            new Date(liveStats.exactLogoutTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          ) : (
                            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs">
                              Ongoing
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Metric KPI Cards (6 Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              {[
                {
                  id: "TOTAL",
                  label: "Tracked Time",
                  value: fmtSecs(liveStats.totalTrackedSeconds),
                  icon: Clock,
                  color: "text-indigo-600",
                  bg: "bg-indigo-50",
                  border: "hover:border-indigo-300",
                  desc: "Active workstation session",
                },
                {
                  id: "PRODUCTIVE",
                  label: "Productive Focus",
                  value: fmtSecs(liveStats.productiveSeconds),
                  badge: `${liveStats.focusScore}% Score`,
                  badgeColor: "bg-emerald-100 text-emerald-800",
                  icon: Activity,
                  color: "text-emerald-600",
                  bg: "bg-emerald-50",
                  border: "hover:border-emerald-300",
                  desc: "Approved business tools",
                },
                {
                  id: "BREAK",
                  label: "Break Time",
                  value: fmtSecs(liveStats.breakSeconds || 0),
                  icon: Coffee,
                  color: "text-amber-600",
                  bg: "bg-amber-50",
                  border: "hover:border-amber-300",
                  desc: "Logged break intervals",
                },
                {
                  id: "IDLE",
                  label: "Away from PC",
                  value: fmtSecs(liveStats.idleSeconds || 0),
                  icon: UserX,
                  color: "text-orange-600",
                  bg: "bg-orange-50",
                  border: "hover:border-orange-300",
                  desc: "Unattended workstation time",
                },
                {
                  id: "UNPRODUCTIVE",
                  label: "Unproductive",
                  value: fmtSecs(liveStats.unproductiveSeconds),
                  icon: AlertCircle,
                  color: "text-rose-600",
                  bg: "bg-red-50",
                  border: "hover:border-red-300",
                  desc: "Non-work websites & apps",
                },
                {
                  id: "OFFLINE",
                  label: "Offline Work",
                  value: fmtSecs(liveStats.offlineWorkSeconds || 0),
                  icon: MonitorPlay,
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                  border: "hover:border-purple-300",
                  desc: "Meetings & manual tasks",
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className={`bg-white border border-slate-200/70 rounded-3xl p-5 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group ${kpi.border} relative overflow-hidden`}
                  onClick={() => setSelectedMetric(kpi.id)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div
                      className={`p-2.5 rounded-2xl ${kpi.bg} ${kpi.color} shadow-sm group-hover:scale-110 transition-transform duration-300`}
                    >
                      <kpi.icon size={19} strokeWidth={2.5} />
                    </div>
                    {kpi.badge ? (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${kpi.badgeColor}`}>
                        {kpi.badge}
                      </span>
                    ) : (
                      <div className="bg-slate-50 text-slate-400 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <Search size={13} />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {kpi.label}
                  </p>
                  <p className="text-2xl font-black text-slate-800 tracking-tight">
                    {kpi.value}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    {kpi.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Continuous Day Activity Timeline */}
            <DayTimelineBar
              segments={liveStats.segments || []}
              exactLoginTime={liveStats.exactLoginTime}
              exactLogoutTime={liveStats.exactLogoutTime}
              lastSeen={liveStats.lastSeen}
            />

            {/* App Usage Charts Row */}
            {liveStats.topApps && liveStats.topApps.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Visual Donut Chart */}
                <div className="bg-white border border-slate-200/70 rounded-3xl shadow-sm p-6 hover:shadow-lg transition-shadow duration-300">
                  <h2 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div> App Usage Distribution
                  </h2>
                  <div className="h-[240px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={liveStats.topApps}
                          dataKey="seconds"
                          nameKey="app"
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={95}
                          paddingAngle={3}
                          stroke="none"
                          cornerRadius={4}
                        >
                          {liveStats.topApps.map((_: unknown, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => [fmtSecs(v), "Duration"]}
                          contentStyle={{
                            borderRadius: "16px",
                            border: "none",
                            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                            fontWeight: 600,
                            padding: "12px 16px",
                          }}
                          itemStyle={{ color: "#334155" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                      <span className="text-2xl font-black text-slate-800">
                        {liveStats.topApps.length}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Applications
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ranked Apps List */}
                <div className="lg:col-span-2 bg-white border border-slate-200/70 rounded-3xl shadow-sm p-6 flex flex-col hover:shadow-lg transition-shadow duration-300">
                  <h2 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-widest flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div> Top Applications & Web Tools
                    </div>
                    <span className="text-xs text-slate-400 font-medium">Click app to view logs</span>
                  </h2>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-2 max-h-[260px]">
                    {liveStats.topApps.map(
                      ({ app, seconds }: { app: string; seconds: number }, i: number) => {
                        const pct = liveStats.totalTrackedSeconds
                          ? ((seconds / liveStats.totalTrackedSeconds) * 100).toFixed(1)
                          : 0;
                        return (
                          <div
                            key={app}
                            className="group flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-all"
                            onClick={() => setSelectedAppForModal(app)}
                          >
                            <div className="flex items-center gap-3.5">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm text-white font-black text-sm"
                                style={{
                                  background: `linear-gradient(135deg, ${PIE_COLORS[i % PIE_COLORS.length]}dd, ${PIE_COLORS[i % PIE_COLORS.length]})`,
                                }}
                              >
                                {app.substring(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">
                                  {app}
                                </span>
                                <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                                    }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-bold text-slate-400">{pct}%</span>
                              <span className="text-xs font-mono font-bold text-slate-700 w-20 text-right bg-white py-1 px-2.5 rounded-lg border border-slate-100 shadow-sm">
                                {fmtSecs(seconds)}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 7-Day Performance Trend */}
            {trendAnalytics && trendAnalytics.length > 0 && (
              <div className="bg-white border border-slate-200/70 rounded-3xl shadow-sm p-6 hover:shadow-lg transition-shadow duration-300">
                <h2 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> 7-Day Performance Trajectory
                </h2>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={trendAnalytics.slice(-7)}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          new Date(v).toLocaleDateString("en-US", {
                            weekday: "short",
                            day: "numeric",
                          })
                        }
                        dy={10}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${Math.round(v / 3600)}h`}
                      />
                      <Tooltip
                        formatter={(v: number) => [fmtSecs(v), "Productive Time"]}
                        cursor={{ fill: "#f8fafc" }}
                        contentStyle={{
                          borderRadius: "16px",
                          border: "none",
                          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                          fontWeight: 600,
                          padding: "12px 16px",
                        }}
                      />
                      <Bar
                        dataKey="productiveSeconds"
                        fill="url(#mgrProdColor)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={44}
                      />
                      <defs>
                        <linearGradient id="mgrProdColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.8} />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Activity & Workstation Audit Stream */}
            {feed && feed.length > 0 && (
              <div className="bg-white border border-slate-200/70 rounded-3xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow duration-300">
                <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-5">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-pink-500"></div> Workstation Telemetry Audit
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5 font-medium">
                        Detailed chronological log of application titles, urls, and timestamps.
                      </p>
                    </div>
                    <div className="hidden sm:flex bg-slate-200/60 p-1 rounded-xl items-center shadow-inner">
                      <button
                        onClick={() => {
                          setFeedTab("ALL");
                          resetFilters();
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          feedTab === "ALL"
                            ? "bg-white text-indigo-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        Activity
                      </button>
                      <button
                        onClick={() => {
                          setFeedTab("SYSTEM");
                          resetFilters();
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          feedTab === "SYSTEM"
                            ? "bg-white text-rose-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        System Events
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {hasActiveFilters && (
                      <button
                        onClick={resetFilters}
                        className="text-xs font-bold bg-white text-rose-500 border border-rose-200 hover:bg-rose-50 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                      >
                        <X size={14} strokeWidth={3} /> Clear
                      </button>
                    )}
                    <div className="flex items-center relative">
                      <Search size={14} className="absolute left-3 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search apps, URLs..."
                        value={appFilter}
                        onChange={(e) => setAppFilter(e.target.value)}
                        className="pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 w-full sm:w-56"
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-1.5">
                      <Filter size={14} className="text-slate-400" />
                      <input
                        type="time"
                        value={timeFrom}
                        onChange={(e) => setTimeFrom(e.target.value)}
                        className="text-sm bg-transparent border-none focus:ring-0 p-0 w-[65px] outline-none text-slate-600 font-medium"
                      />
                      <span className="text-slate-300 font-bold">-</span>
                      <input
                        type="time"
                        value={timeTo}
                        onChange={(e) => setTimeTo(e.target.value)}
                        className="text-sm bg-transparent border-none focus:ring-0 p-0 w-[65px] outline-none text-slate-600 font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 max-h-[550px] overflow-y-auto">
                  {filteredFeed.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 font-medium flex flex-col items-center">
                      <Search className="w-8 h-8 mb-3 text-slate-200" />
                      No telemetry datapoints match your current filters.
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-100 ml-3 space-y-4">
                      {filteredFeed.map((ev: any, idx: number) => {
                        let eventDate = new Date(ev.timestamp);
                        if (ev.type === "IDLE_START" || ev.type === "IDLE_RESPONSE") {
                          let dur =
                            ev.type === "IDLE_START"
                              ? ev.metadata?.idleDurationSecs ??
                                ev.metadata?.idleSeconds ??
                                300
                              : (ev.metadata?.idleMinutes ?? 5) * 60;
                          eventDate = new Date(eventDate.getTime() - dur * 1000);
                        }

                        if (ev.type === "IDLE_RESPONSE") {
                          const isWorking = ev.metadata?.isWorking;
                          const fromDate = ev.metadata?.from
                            ? new Date(ev.metadata.from)
                            : null;
                          const toDate = ev.metadata?.to
                            ? new Date(ev.metadata.to)
                            : null;

                          const fromStr = fromDate
                            ? fromDate.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "";
                          const toStr = toDate
                            ? toDate.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "";

                          ev = {
                            ...ev,
                            app: isWorking ? "Offline Work" : "Break Time",
                            title: `${isWorking ? "Completed Offline Work" : "Took a Break"} from ${fromStr} to ${toStr} (${ev.metadata?.idleMinutes} minutes)${ev.metadata?.reason ? ` - "${ev.metadata.reason}"` : ""}`,
                            durationSeconds: (ev.metadata?.idleMinutes || 0) * 60,
                            type: isWorking ? "OFFLINE_WORK_LOGGED" : "BREAK_LOGGED",
                          };
                        }

                        const isProductive = ev.productivityCategory === "PRODUCTIVE";
                        const isUnproductive = ev.productivityCategory === "UNPRODUCTIVE";

                        const isBrowserLike =
                          ev.isBrowser ||
                          ev.title?.includes("Google Chrome") ||
                          ev.title?.includes("Edge");
                        const displayUrl =
                          ev.url ||
                          (isBrowserLike ? getFallbackUrl(ev.app, ev.title) : null);

                        let statusColor = "bg-slate-300 ring-slate-100";
                        let badgeColor = "bg-slate-100 text-slate-600 border-slate-200";

                        if (ev.type === "ACTIVE_WINDOW") {
                          statusColor = isProductive
                            ? "bg-emerald-500 ring-emerald-100"
                            : isUnproductive
                            ? "bg-rose-500 ring-rose-100"
                            : "bg-slate-400 ring-slate-100";
                          badgeColor = isProductive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : isUnproductive
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-slate-100 text-slate-700 border-slate-200";
                        } else if (ev.type.includes("IDLE")) {
                          statusColor = "bg-amber-500 ring-amber-100";
                          badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                        } else if (ev.type.includes("SESSION")) {
                          statusColor = "bg-indigo-500 ring-indigo-100";
                          badgeColor = "bg-indigo-50 text-indigo-700 border-indigo-200";
                        } else if (
                          ev.type.includes("SYSTEM") ||
                          ev.type.includes("TRACKING") ||
                          ev.type.includes("CRASH")
                        ) {
                          statusColor = "bg-rose-500 ring-rose-100";
                          badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
                        }

                        return (
                          <div
                            key={idx}
                            className="relative pl-6 group transition-all duration-200 hover:bg-slate-50/50 rounded-2xl p-2 -ml-2"
                          >
                            <div
                              className={`absolute left-[-11px] top-4 w-4 h-4 rounded-full ring-4 shadow-sm ${statusColor}`}
                            />

                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 bg-white border border-slate-100 p-4 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] group-hover:shadow-md group-hover:border-slate-200 transition-all">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                  <span className="text-sm font-bold text-slate-800">
                                    {ev.app || "System Event"}
                                  </span>
                                  <span
                                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border ${badgeColor}`}
                                  >
                                    {ev.type.replace(/_/g, " ")}
                                  </span>
                                </div>

                                {ev.title && (
                                  <p
                                    className="text-[13px] text-slate-600 mb-1.5 max-w-2xl break-words font-medium"
                                    title={ev.title}
                                  >
                                    {ev.title}
                                  </p>
                                )}

                                {displayUrl && (
                                  <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 max-w-max">
                                    <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-sm text-slate-400">
                                      URL
                                    </span>
                                    <a
                                      href={displayUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline max-w-lg truncate font-medium block"
                                    >
                                      {displayUrl}
                                    </a>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between shrink-0 gap-2 sm:gap-1.5">
                                <span className="text-[11px] text-slate-500 font-bold font-mono bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                  {eventDate.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </span>
                                {ev.durationSeconds > 0 && (
                                  <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 shadow-sm">
                                    {fmtSecs(ev.durationSeconds)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty State */}
            {liveStats.totalTrackedSeconds === 0 && (
              <div className="bg-white border border-slate-200/70 rounded-3xl p-16 text-center shadow-sm">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <Activity className="w-6 h-6 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  No Telemetry Recorded
                </h3>
                <p className="text-slate-500 mt-2 font-medium">
                  There are no productivity events logged for {formatDate(dateInput)}.
                </p>
              </div>
            )}
          </div>
        )
      )}

      {/* Modals */}
      {selectedMetric && feed && (
        <MetricDetailsModal
          metricId={selectedMetric}
          feed={feed}
          onClose={() => setSelectedMetric(null)}
        />
      )}
      {selectedAppForModal && feed && (
        <AppTimelineModal
          appName={selectedAppForModal}
          feed={feed}
          onClose={() => setSelectedAppForModal(null)}
        />
      )}
    </div>
  );
}

// Metric Details Modal
function MetricDetailsModal({
  metricId,
  feed,
  onClose,
}: {
  metricId: string;
  feed: any[];
  onClose: () => void;
}) {
  const titles: Record<string, string> = {
    TOTAL: "Total Tracked Telemetry Timeline",
    PRODUCTIVE: "Productive Work Blocks",
    UNPRODUCTIVE: "Unproductive Apps & URLs",
    BREAK: "Break Time Logs",
    IDLE: "Away from PC & Inactivity Intervals",
    OFFLINE: "Offline & Meeting Work",
  };

  const filteredFeed = feed
    .filter((ev) => {
      if (ev.type === "IDLE_START" || ev.type === "IDLE_END") return false;

      const isWorkingRaw = ev.metadata?.isWorking;
      const isWorking = isWorkingRaw === true || isWorkingRaw === "true";

      if (metricId === "TOTAL") return true;
      if (metricId === "PRODUCTIVE") return ev.productivityCategory === "PRODUCTIVE";
      if (metricId === "UNPRODUCTIVE") return ev.productivityCategory === "UNPRODUCTIVE";
      if (metricId === "BREAK") return ev.type === "IDLE_RESPONSE" && !isWorking;
      if (metricId === "IDLE") return ev.type.includes("IDLE") && !isWorking;
      if (metricId === "OFFLINE") return ev.type === "IDLE_RESPONSE" && isWorking;
      return true;
    })
    .map((ev) => {
      if (ev.type === "IDLE_RESPONSE") {
        const isWorkingRaw = ev.metadata?.isWorking;
        const isWorking = isWorkingRaw === true || isWorkingRaw === "true";
        const fromDate = ev.metadata?.from ? new Date(ev.metadata.from) : null;
        const toDate = ev.metadata?.to ? new Date(ev.metadata.to) : null;

        const fromStr = fromDate
          ? fromDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        const toStr = toDate
          ? toDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        return {
          ...ev,
          app: isWorking ? "Offline Work" : "Break Time",
          title: `${isWorking ? "Completed Offline Work" : "Took a Break"} from ${fromStr} to ${toStr} (${ev.metadata?.idleMinutes} minutes)${ev.metadata?.reason ? ` - "${ev.metadata.reason}"` : ""}`,
          durationSeconds: (ev.metadata?.idleMinutes || 0) * 60,
          type: isWorking ? "OFFLINE_WORK_LOGGED" : "BREAK_LOGGED",
        };
      }
      return ev;
    })
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl border border-white flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h2 className="text-base font-extrabold text-slate-800 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            {titles[metricId] || "Telemetry Details"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
          >
            <X size={18} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 overflow-y-auto flex-1 bg-slate-50/50">
          {filteredFeed.length === 0 ? (
            <div className="text-center py-12 text-sm font-medium text-slate-400">
              No telemetry events found for this filter.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFeed.map((ev: any, idx: number) => {
                const date = new Date(ev.timestamp);
                return (
                  <div
                    key={idx}
                    className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center gap-4 group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-700 break-words group-hover:text-indigo-600 transition-colors">
                        {ev.title || ev.app}
                      </p>
                      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mt-1">
                        {ev.type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <p className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
                        {date.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {ev.durationSeconds > 0 && (
                        <p className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          {fmtSecs(ev.durationSeconds)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// App Timeline Modal
function AppTimelineModal({
  appName,
  feed,
  onClose,
}: {
  appName: string;
  feed: any[];
  onClose: () => void;
}) {
  const filteredFeed = feed
    .filter((ev) => ev.app === appName)
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl border border-white flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50"></div>
            {appName} <span className="font-medium text-slate-400">Activity Log</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
          >
            <X size={18} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 overflow-y-auto flex-1 bg-slate-50/50">
          {filteredFeed.length === 0 ? (
            <div className="text-center py-12 text-sm font-medium text-slate-400">
              No records found.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFeed.map((ev: any, idx: number) => {
                const date = new Date(ev.timestamp);
                const isBrowserLike =
                  ev.isBrowser ||
                  ev.title?.includes("Google Chrome") ||
                  ev.title?.includes("Edge");
                const displayUrl =
                  ev.url || (isBrowserLike ? getFallbackUrl(ev.app, ev.title) : null);

                return (
                  <div
                    key={idx}
                    className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex justify-between items-start gap-4 group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 break-words" title={ev.title}>
                        {ev.title}
                      </p>
                      {displayUrl && (
                        <div className="mt-2 inline-flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          <span className="text-[9px] font-bold text-slate-400 uppercase bg-white px-1 rounded shadow-sm">
                            URL
                          </span>
                          <a
                            href={displayUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-indigo-500 hover:text-indigo-700 hover:underline truncate max-w-[220px] font-medium block"
                          >
                            {displayUrl}
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <p className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
                        {date.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {ev.durationSeconds > 0 && (
                        <p className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          {fmtSecs(ev.durationSeconds)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeamAnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 font-bold">Loading Team Analytics...</div>}>
      <TeamAnalyticsContent />
    </Suspense>
  );
}
