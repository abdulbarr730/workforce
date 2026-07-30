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

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-8 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
