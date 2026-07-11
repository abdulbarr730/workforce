"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate, formatMinutes } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function MyAnalyticsPage() {
  const { user } = useAuthStore();
  const [dateInput, setDateInput] = useState(
    new Date().toISOString().split("T")[0],
  );

  const { data: dailyAnalytics } = useQuery({
    queryKey: ["my-daily", dateInput],
    queryFn: () =>
      api.get(`/api/me/analytics?date=${dateInput}`).then((r) => r.data.data),
    enabled: !!user,
  });

  const { data: trendAnalytics } = useQuery({
    queryKey: ["my-trend"],
    queryFn: () => api.get("/api/me/trend").then((r) => r.data.data),
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your personal productivity insights
          </p>
        </div>
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {dailyAnalytics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Productive Time",
              value: formatMinutes(dailyAnalytics.productiveMinutes ?? 0),
              sub: formatDate(dateInput),
            },
            {
              label: "Break Time",
              value: formatMinutes(dailyAnalytics.breakMinutes ?? 0),
              sub: "45min allowance",
            },
            {
              label: "Productivity Score",
              value: `${dailyAnalytics.productivityScore ?? 0}%`,
              sub: "Today",
            },
          ].map(({ label, value, sub }) => (
            <div
              key={label}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <p className="text-sm text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-semibold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-1">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {trendAnalytics && trendAnalytics.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            7-Day Trend
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendAnalytics.slice(-7)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })
                }
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [formatMinutes(v), "Productive"]}
              />
              <Bar
                dataKey="productiveMinutes"
                fill="#111827"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          Not enough data for trend analysis yet. Keep working!
        </div>
      )}
    </div>
  );
}
