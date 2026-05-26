"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatMinutes } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const PIE_COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#64748b"];

function fmtSecs(s: number) {
  if (!s) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AnalyticsPage() {
  const [employeeId, setEmployeeId] = useState("");
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: liveStats, isLoading } = useQuery({
    queryKey: ["analytics-live", employeeId, dateInput],
    queryFn: () =>
      api.get(`/api/analytics/live?employeeId=${employeeId}&date=${dateInput}`).then((r) => r.data.data),
    enabled: !!employeeId,
    refetchInterval: 30_000,
  });

  const { data: trendAnalytics } = useQuery({
    queryKey: ["analytics-trend", employeeId],
    queryFn: () =>
      api.get(`/api/analytics/employee-trend?employeeId=${employeeId}`).then((r) => r.data.data),
    enabled: !!employeeId,
  });

  const allUsers = Array.isArray(users) ? users : (users?.users ?? []);
  const employees = allUsers.filter((u: { role: string }) => u.role !== "SUPER_ADMIN");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Employee productivity and work insights</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">Select employee…</option>
          {employees.map((e: { employeeId: string; name: string; role: string }) => (
            <option key={e.employeeId} value={e.employeeId}>
              {e.name} ({e.employeeId})
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      {!employeeId && (
        <div className="p-12 text-center text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          Select an employee to view their analytics
        </div>
      )}

      {employeeId && isLoading && (
        <div className="p-8 text-center text-sm text-gray-400">Loading analytics…</div>
      )}

      {liveStats && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Tracked Time", value: fmtSecs(liveStats.totalTrackedSeconds), color: "#4f46e5" },
              { label: "Productive", value: fmtSecs(liveStats.productiveSeconds), color: "#10b981" },
              { label: "Idle Time", value: fmtSecs(liveStats.idleSeconds), color: "#f59e0b" },
              { label: "Focus Score", value: `${liveStats.focusScore ?? 0}%`, color: "#6366f1" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs text-gray-400 mt-1">{formatDate(dateInput)}</p>
              </div>
            ))}
          </div>

          {/* Session info */}
          {liveStats.sessionStart && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 text-sm flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
              <span className="text-indigo-700">
                First activity at{" "}
                <strong>{new Date(liveStats.sessionStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
                {liveStats.lastSeen && (
                  <> · Last seen at{" "}
                    <strong>{new Date(liveStats.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
                  </>
                )}
                {" "}· {liveStats.eventCount} events tracked
              </span>
            </div>
          )}

          {/* Top apps — pie + table */}
          {liveStats.topApps && liveStats.topApps.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pie */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Screen time by app</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={liveStats.topApps}
                      dataKey="seconds"
                      nameKey="app"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ app, percent }: { app: string; percent: number }) =>
                        `${app.split(".")[0]} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {liveStats.topApps.map((_: unknown, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtSecs(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Top applications</h2>
                <div className="space-y-2">
                  {liveStats.topApps.map(({ app, seconds }: { app: string; seconds: number }, i: number) => {
                    const pct = liveStats.totalTrackedSeconds
                      ? Math.round((seconds / liveStats.totalTrackedSeconds) * 100)
                      : 0;
                    return (
                      <div key={app}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                            <span className="font-medium text-gray-800 truncate max-w-[160px]">{app}</span>
                          </span>
                          <span className="text-gray-500 text-xs whitespace-nowrap ml-2">{fmtSecs(seconds)} · {pct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {liveStats.totalTrackedSeconds === 0 && (
            <div className="p-8 text-center text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
              No tracking events recorded for this employee on {formatDate(dateInput)}.
              Ensure the desktop agent is running and events are being uploaded.
            </div>
          )}
        </>
      )}

      {/* 7-day trend */}
      {trendAnalytics && trendAnalytics.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">7-Day Productivity Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendAnalytics.slice(-7)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                }
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 60)}m`} />
              <Tooltip formatter={(v: number) => [fmtSecs(v), "Productive"]} />
              <Bar dataKey="productiveSeconds" fill="#4f46e5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
