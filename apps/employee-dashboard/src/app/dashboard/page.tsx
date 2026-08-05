"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate, formatMinutes, getStatusColor } from "@/lib/utils";
import { CalendarCheck, Clock, BarChart2, Umbrella, WifiOff, Coffee } from "lucide-react";
import { ActivityLogsModal } from "@/components/analytics/ActivityLogsModal";
import { MissedTasksAlert } from "@/components/daily-flow/MissedTasksAlert";
import { TeamNeedsAttention } from "@/components/daily-flow/TeamNeedsAttention";

export default function EmployeeDashboardPage() {
  const { user } = useAuthStore();
  const today = new Date().toISOString().split("T")[0];
  const [modalType, setModalType] = useState<"BREAK" | "OFFLINE" | null>(null);

  const { data: dailyAnalytics } = useQuery({
    queryKey: ["my-daily", today],
    queryFn: () =>
      api.get(`/api/me/analytics?date=${today}`).then((r) => r.data.data),
    enabled: !!user,
  });

  const { data: activeSession } = useQuery({
    queryKey: ["my-session"],
    queryFn: () =>
      api.get("/api/work-sessions/active").then((r) => r.data.data),
    enabled: !!user,
  });

  const { data: todayTodo } = useQuery({
    queryKey: ["my-today-todo", today],
    queryFn: () =>
      api.get("/api/daily-flow/me/todo/today").then((r) => r.data?.data).catch(() => null),
    enabled: !!user,
  });

  const { data: todayEod } = useQuery({
    queryKey: ["my-today-eod", today],
    queryFn: () =>
      api.get("/api/daily-flow/me/eod/today").then((r) => r.data?.data).catch(() => null),
    enabled: !!user,
  });

  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-8">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-10 -mb-10 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
        
        <div className="relative z-10">
          <h1 className="text-3xl font-bold tracking-tight">
            Good{" "}
            {new Date().getHours() < 12
              ? "morning"
              : new Date().getHours() < 17
                ? "afternoon"
                : "evening"}
            , {user?.name?.split(" ")[0]}!
          </h1>
          <p className="text-indigo-100 mt-2 font-medium">{formatDate(today)}</p>
        </div>
      </div>

      <MissedTasksAlert />

      {user?.role === "MANAGER" && <TeamNeedsAttention />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Today&apos;s Status</p>
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-500">
              <CalendarCheck className="w-5 h-5" />
            </div>
          </div>
          {dailyAnalytics?.attendanceStatus ? (
            <span
              className={`text-sm px-3 py-1 rounded-full font-semibold ${getStatusColor(dailyAnalytics.attendanceStatus)}`}
            >
              {dailyAnalytics.attendanceStatus}
            </span>
          ) : (
            <span className="text-sm px-3 py-1 rounded-full font-semibold bg-gray-100 text-gray-600">
              Not Started
            </span>
          )}
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Productive Time</p>
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-500">
              <BarChart2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {formatMinutes(dailyAnalytics?.actualProductiveMinutes ?? dailyAnalytics?.productiveMinutes ?? 0)}
          </p>
        </div>

        <div 
          onClick={() => setModalType("BREAK")}
          className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group hover:ring-2 hover:ring-cyan-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider group-hover:text-cyan-600 transition-colors">Break Time</p>
            <div className="bg-cyan-50 p-2 rounded-lg text-cyan-500 group-hover:bg-cyan-100 transition-colors">
              <Umbrella className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 group-hover:text-cyan-700 transition-colors">
            {formatMinutes(dailyAnalytics?.breakMinutes ?? 0)}
          </p>
          <p className="text-xs text-gray-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click to view logs</p>
        </div>

        <div 
          onClick={() => setModalType("OFFLINE")}
          className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group hover:ring-2 hover:ring-teal-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider group-hover:text-teal-600 transition-colors">Offline Work</p>
            <div className="bg-teal-50 p-2 rounded-lg text-teal-500 group-hover:bg-teal-100 transition-colors">
              <WifiOff className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 group-hover:text-teal-700 transition-colors">
            {formatMinutes(dailyAnalytics?.awayWorkingMinutes ?? 0)}
          </p>
          <p className="text-xs text-gray-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click to view logs</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Idle Time</p>
            <div className="bg-amber-50 p-2 rounded-lg text-amber-500">
              <Coffee className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {formatMinutes(dailyAnalytics?.idleMinutes ?? 0)}
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Session Status</p>
            <div className="bg-blue-50 p-2 rounded-lg text-blue-500">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-lg font-bold text-gray-900 mt-1">
            {activeSession ? (
              <span className="inline-flex items-center text-emerald-600">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                Active
              </span>
            ) : (
              <span className="text-gray-400">Offline</span>
            )}
          </p>
        </div>
      </div>

      {/* Today's Work & EOD Tasks Summary */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-gray-900">Today&apos;s Work &amp; EOD Tasks Summary</h2>
          </div>
          {todayEod ? (
            <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200">
              EOD Submitted
            </span>
          ) : (
            <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full border border-indigo-200">
              In Progress
            </span>
          )}
        </div>

        {/* EOD Completed Tasks Table / List */}
        {todayEod && todayEod.completedItems && todayEod.completedItems.length > 0 ? (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Completed Tasks</p>
            {(() => {
              const parseDurationToMins = (timeStr: string): number => {
                if (!timeStr) return 0;
                const t = timeStr.trim().toLowerCase();
                if (t.includes(":")) {
                  const parts = t.split(":");
                  const h = parseInt(parts[0]) || 0;
                  const m = parseInt(parts[1]) || 0;
                  return h * 60 + m;
                }
                let total = 0;
                const hMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs)/);
                const mMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins)/);
                if (hMatch) total += parseFloat(hMatch[1]) * 60;
                if (mMatch) total += parseFloat(mMatch[1]);
                if (total > 0) return total;
                const val = parseFloat(t);
                return isNaN(val) ? 0 : (val < 12 ? Math.round(val * 60) : Math.round(val));
              };

              const formatClock = (d: Date) => {
                return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
              };

              let cursorTime: Date;
              if (activeSession?.loginTime) {
                cursorTime = new Date(activeSession.loginTime);
              } else {
                cursorTime = new Date();
                cursorTime.setHours(10, 0, 0, 0);
              }

              return (
                <ul className="space-y-2">
                  {todayEod.completedItems.map((item: string, i: number) => {
                    let task = item;
                    let duration = "";
                    let timeStamp = "";

                    const dashMatch = item.match(/^(.*)\s+-\s+(.*?)$/);
                    if (dashMatch) {
                      task = dashMatch[1].trim();
                      duration = dashMatch[2].trim();
                    } else {
                      const parenMatch = item.match(/^(.*)\s+\((.*?)\)$/);
                      if (parenMatch) {
                        task = parenMatch[1].trim();
                        duration = parenMatch[2].trim();
                      }
                    }

                    const stampMatch = task.match(
                      /\(?(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?\s*[-–—]\s*\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)\)?/i
                    );
                    if (stampMatch) {
                      task = task.replace(stampMatch[0], "").trim();
                      timeStamp = stampMatch[1].trim();
                    }

                    const mins = parseDurationToMins(duration);
                    if (!timeStamp || timeStamp === "-" || timeStamp.trim() === "") {
                      const startTime = new Date(cursorTime);
                      const durationMins = mins > 0 ? mins : 45;
                      cursorTime = new Date(cursorTime.getTime() + durationMins * 60 * 1000);
                      const endTime = new Date(cursorTime);
                      timeStamp = `${formatClock(startTime)} – ${formatClock(endTime)}`;
                    }

                    return (
                      <li
                        key={i}
                        className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-emerald-500 font-bold shrink-0">✓</span>
                          <span className="font-mono text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-100 font-semibold shrink-0">
                            {timeStamp}
                          </span>
                          <span className="font-semibold text-gray-800 break-words">{task}</span>
                        </div>
                        {duration && (
                          <span className="font-mono font-bold text-indigo-900 bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs shrink-0">
                            {duration}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>
        ) : (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500">
            No EOD report submitted yet today. When you submit your End of Day report, your completed tasks with timestamps will appear here.
          </div>
        )}
      </div>

      {activeSession && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-50">
            Current Session Details
          </h2>
          <div className="space-y-4 text-sm">
            <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-xl">
              <span className="text-gray-500 font-medium">Started At</span>
              <span className="text-gray-900 font-semibold bg-white px-3 py-1 rounded-lg border border-gray-100 shadow-sm">
                {formatDate(activeSession.loginTime)}{" "}
                {new Date(activeSession.loginTime).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-xl">
              <span className="text-gray-500 font-medium">Session ID</span>
              <span className="text-gray-500 font-mono text-xs bg-white px-3 py-1 rounded-lg border border-gray-100 shadow-sm">
                {activeSession.sessionId}
              </span>
            </div>
            {activeSession.todos?.length > 0 && (
              <div className="pt-2">
                <p className="text-gray-600 font-semibold mb-3">Today&apos;s Focus</p>
                <ul className="space-y-2">
                  {activeSession.todos.map((t: string, i: number) => (
                    <li key={i} className="flex items-start text-gray-700 bg-indigo-50/30 p-3 rounded-xl">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 mr-3 flex-shrink-0"></span>
                      <span className="leading-relaxed">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <ActivityLogsModal 
        type={modalType} 
        date={today} 
        onClose={() => setModalType(null)} 
      />
    </div>
  );
}
