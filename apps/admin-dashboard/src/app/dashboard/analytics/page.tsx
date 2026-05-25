"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatMinutes } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function AnalyticsPage() {
  const [employeeId, setEmployeeId] = useState("");
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: dailyAnalytics, isLoading } = useQuery({
    queryKey: ["analytics-daily", employeeId, dateInput],
    queryFn: () => api.get(`/api/analytics/employee-daily?employeeId=${employeeId}&date=${dateInput}`).then((r) => r.data.data),
    enabled: !!employeeId,
  });

  const { data: trendAnalytics } = useQuery({
    queryKey: ["analytics-trend", employeeId],
    queryFn: () => api.get(`/api/analytics/employee-trend?employeeId=${employeeId}`).then((r) => r.data.data),
    enabled: !!employeeId,
  });

  const employees = (users?.users ?? []).filter((u: { role: string }) => u.role === "EMPLOYEE");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Employee productivity and work insights</p>
      </div>

      <div className="flex gap-3">
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Select employee</option>
          {employees.map((e: { employeeId: string; name: string }) => (
            <option key={e.employeeId} value={e.employeeId}>{e.name} ({e.employeeId})</option>
          ))}
        </select>
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {!employeeId && (
        <div className="p-12 text-center text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          Select an employee to view their analytics
        </div>
      )}

      {employeeId && isLoading && (
        <div className="p-8 text-center text-sm text-gray-400">Loading analytics...</div>
      )}

      {dailyAnalytics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Productive Time", value: formatMinutes(dailyAnalytics.productiveMinutes ?? 0) },
            { label: "Break Time", value: formatMinutes(dailyAnalytics.breakMinutes ?? 0) },
            { label: "Productivity Score", value: `${dailyAnalytics.productivityScore ?? 0}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-semibold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-1">{formatDate(dateInput)}</p>
            </div>
          ))}
        </div>
      )}

      {trendAnalytics && trendAnalytics.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">7-Day Productivity Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendAnalytics.slice(-7)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [formatMinutes(v), "Productive"]} />
              <Bar dataKey="productiveMinutes" fill="#111827" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
