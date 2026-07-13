"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate, formatMinutes, getStatusColor } from "@/lib/utils";
import { CalendarCheck, Clock, BarChart2, Umbrella } from "lucide-react";

export default function EmployeeDashboardPage() {
  const { user } = useAuthStore();
  const today = new Date().toISOString().split("T")[0];

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
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">
          Good{" "}
          {new Date().getHours() < 12
            ? "morning"
            : new Date().getHours() < 17
              ? "afternoon"
              : "evening"}
          , {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{formatDate(today)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">Today&apos;s Status</p>
            <CalendarCheck className="w-4 h-4 text-gray-400" />
          </div>
          {dailyAnalytics?.attendanceStatus ? (
            <span
              className={`text-sm px-2 py-0.5 rounded-full font-medium ${getStatusColor(dailyAnalytics.attendanceStatus)}`}
            >
              {dailyAnalytics.attendanceStatus}
            </span>
          ) : (
            <p className="text-xl font-semibold text-gray-400">—</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">Productive Time</p>
            <BarChart2 className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {dailyAnalytics
              ? formatMinutes(dailyAnalytics.productiveMinutes ?? 0)
              : "—"}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">Break Time</p>
            <Umbrella className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {dailyAnalytics
              ? formatMinutes(dailyAnalytics.breakMinutes ?? 0)
              : "—"}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">Session Status</p>
            <Clock className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {activeSession ? (
              <span className="text-green-600">Active</span>
            ) : (
              <span className="text-gray-400">No active session</span>
            )}
          </p>
        </div>
      </div>

      {activeSession && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Current Session
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Started</span>
              <span className="text-gray-900">
                {formatDate(activeSession.loginTime)}{" "}
                {new Date(activeSession.loginTime).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Session ID</span>
              <span className="text-gray-600 font-mono text-xs">
                {activeSession.sessionId?.slice(0, 16)}...
              </span>
            </div>
            {activeSession.todos?.length > 0 && (
              <div>
                <p className="text-gray-500 mb-1">Today&apos;s tasks</p>
                <ul className="space-y-1">
                  {activeSession.todos.map((t: string, i: number) => (
                    <li key={i} className="text-gray-700 text-xs">
                      • {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
