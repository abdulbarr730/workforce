"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  BarChart2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Download,
  MonitorOff,
  LineChart,
  Link as LinkIcon,
  UserX,
  UserCheck,
  FileText,
  ClipboardList,
} from "lucide-react";

function getWeekDates(weekString: string) {
  const [yearStr, weekStr] = weekString.split("-W");
  const year = parseInt(yearStr, 10);
  const weekNum = parseInt(weekStr, 10);
  const simple = new Date(Date.UTC(year, 0, 1 + (weekNum - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dow <= 4)
    ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  const start = ISOweekStart.toISOString().split("T")[0];
  const end = new Date(ISOweekStart.getTime() + 6 * 86400000)
    .toISOString()
    .split("T")[0];
  return { start, end };
}

function getMonthDates(monthString: string) {
  const [yearStr, monthStr] = monthString.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const startObj = new Date(Date.UTC(year, month, 1));
  const endObj = new Date(Date.UTC(year, month + 1, 0));
  const start = startObj.toISOString().split("T")[0];
  const end = endObj.toISOString().split("T")[0];
  return { start, end };
}

type ViewMode = "weekly" | "monthly" | "custom" | "all-time";

export default function ReportsDashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("all-time");
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const d = new Date();
    const w = Math.ceil(
      ((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 +
        new Date(d.getFullYear(), 0, 1).getDay() +
        1) /
        7,
    );
    return `${d.getFullYear()}-W${w.toString().padStart(2, "0")}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedEmployee, setSelectedEmployee] = useState("");

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { currentStart, currentEnd } = useMemo(() => {
    if (viewMode === "weekly") {
      const dates = getWeekDates(selectedWeek);
      return { currentStart: dates.start, currentEnd: dates.end };
    } else if (viewMode === "monthly") {
      const dates = getMonthDates(selectedMonth);
      return { currentStart: dates.start, currentEnd: dates.end };
    } else {
      return { currentStart: startDate, currentEnd: endDate };
    }
  }, [viewMode, selectedWeek, selectedMonth, startDate, endDate]);

  const urlParams = new URLSearchParams();
  urlParams.set("startDate", currentStart);
  urlParams.set("endDate", currentEnd);
  if (selectedEmployee) urlParams.set("employeeId", selectedEmployee);

  const qStr = urlParams.toString();

  const { data: intelligence, isLoading } = useQuery({
    queryKey: ["reports-team-intelligence", qStr],
    queryFn: () =>
      api
        .get(`/api/analytics/team-intelligence?${qStr}`)
        .then((r) => r.data.data),
  });

  const handleExport = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const url = new URL(baseUrl + "/api/analytics/export");
    url.searchParams.set("token", localStorage.getItem("wf_token") || "");
    if (selectedEmployee) url.searchParams.set("employeeId", selectedEmployee);
    url.searchParams.set("startDate", currentStart);
    url.searchParams.set("endDate", currentEnd);
    window.open(url.toString(), "_blank");
  };

  const stats = intelligence?.overview || {
    totalProdMins: 0,
    totalNonProdMins: 0,
    totalOtMins: 0,
    totalLate: 0,
    totalPresent: 0,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative">
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <LineChart className="w-7 h-7 text-indigo-600" />
            Team Intelligence
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            AI-driven insights on workforce productivity, lateness, and
            application usage.
          </p>
        </div>

        <div className="flex items-center gap-3 relative">
          <div className="flex bg-gray-100/80 p-1 rounded-xl backdrop-blur-sm border border-gray-200/50">
            <button
              onClick={() => setViewMode("weekly")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === "weekly" ? "bg-white shadow-sm text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              Weekly
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === "monthly" ? "bg-white shadow-sm text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode("all-time")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === "all-time" ? "bg-white shadow-sm text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              All Time
            </button>
            <button
              onClick={() => setViewMode("custom")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === "custom" ? "bg-white shadow-sm text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              Custom
            </button>
          </div>

          <button
            onClick={async () => {
              const btn = document.getElementById("sync-btn");
              if (btn)
                btn.innerHTML =
                  '<span class="animate-pulse">Syncing... (may take 20s)</span>';
              try {
                await api.post("/api/analytics/team-intelligence/sync", {
                  startDate: currentStart,
                  endDate: currentEnd,
                });
                if (btn) btn.innerHTML = "Synced!";
                setTimeout(() => window.location.reload(), 1000);
              } catch (err) {
                if (btn) btn.innerHTML = "Sync Failed (Try smaller date range)";
                setTimeout(() => {
                  if (btn) btn.innerHTML = "Force Sync Data";
                }, 3000);
              }
            }}
            id="sync-btn"
            className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-indigo-200 transition-all"
          >
            Force Sync Data
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm items-center">
        <select
          value={selectedEmployee}
          onChange={(e) => setSelectedEmployee(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium bg-gray-50 min-w-[200px] outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        >
          <option value="">-- All Employees --</option>
          {users
            ?.filter((u: any) => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN")
            .map((u: any) => (
              <option key={u.employeeId} value={u.employeeId}>
                {u.name} ({u.employeeId})
              </option>
            ))}
        </select>

        {viewMode === "weekly" && (
          <input
            type="week"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        )}

        {viewMode === "monthly" && (
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        )}

        {viewMode === "custom" && (
          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-transparent text-sm font-medium outline-none"
            />
            <span className="text-gray-400 font-bold">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-transparent text-sm font-medium outline-none"
            />
          </div>
        )}

        <div className="ml-auto text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">
          {currentStart} to {currentEnd}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* Top Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-2xl shadow-md text-white relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl group-hover:bg-white/20 transition-all"></div>
              <p className="text-sm font-medium text-indigo-100">
                Total Productive Time
              </p>
              <p className="text-3xl font-black mt-2 tracking-tight">
                {Math.floor(stats.totalProdMins / 60)}h{" "}
                {stats.totalProdMins % 60}m
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm group hover:border-gray-300 transition-all">
              <p className="text-sm font-medium text-gray-500">
                Non-Productive (Breaks/Idle)
              </p>
              <p className="text-3xl font-black text-gray-900 mt-2 tracking-tight">
                {Math.floor(stats.totalNonProdMins / 60)}h{" "}
                {stats.totalNonProdMins % 60}m
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm group hover:border-gray-300 transition-all">
              <p className="text-sm font-medium text-gray-500">
                Total Overtime
              </p>
              <p className="text-3xl font-black text-gray-900 mt-2 tracking-tight">
                {Math.floor(stats.totalOtMins / 60)}h {stats.totalOtMins % 60}m
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm group hover:border-gray-300 transition-all">
              <p className="text-sm font-medium text-gray-500">
                Days Present / Late
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <p className="text-3xl font-black text-gray-900 tracking-tight">
                  {stats.totalPresent}
                </p>
                <span className="text-xl font-black text-gray-300">/</span>
                <p className="text-3xl font-black text-amber-500 tracking-tight">
                  {stats.totalLate}
                </p>
              </div>
            </div>
          </div>

          {/* Intelligence Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Needs Attention */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 bg-red-50/30">
                <h3 className="text-sm font-bold text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Needs Attention
                </h3>
              </div>
              <div className="p-2 flex-1 overflow-y-auto">
                {intelligence?.needsAttention?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6 font-medium">
                    All clear! No employees flagged.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {intelligence?.needsAttention?.map((emp: any) => (
                      <li
                        key={emp.employeeId}
                        className="flex flex-col p-3 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm font-bold text-gray-900">
                          {emp.name}
                        </span>
                        <div className="flex gap-3 mt-1 text-xs font-medium text-gray-500">
                          <span className="text-red-500">
                            {emp.unproductiveHours}h unproductive
                          </span>
                          {emp.lateDays > 0 && (
                            <span className="text-amber-500">
                              {emp.lateDays} days late
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Latecomers */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 bg-amber-50/30">
                <h3 className="text-sm font-bold text-amber-600 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Frequent Latecomers
                </h3>
              </div>
              <div className="p-2 flex-1 overflow-y-auto">
                {intelligence?.latecomers?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6 font-medium">
                    No late arrivals in this period.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {intelligence?.latecomers?.map((emp: any) => (
                      <li
                        key={emp.employeeId}
                        className="flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm font-bold text-gray-900">
                          {emp.name}
                        </span>
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-black">
                          {emp.lateDays} Late
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Top Performers */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 bg-emerald-50/30">
                <h3 className="text-sm font-bold text-emerald-600 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Top Punctual / Performers
                </h3>
              </div>
              <div className="p-2 flex-1 overflow-y-auto">
                {intelligence?.topPerformers?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6 font-medium">
                    Not enough data to calculate.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {intelligence?.topPerformers?.map((emp: any, i: number) => (
                      <li
                        key={emp.employeeId}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">
                          {i + 1}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">
                            {emp.name}
                          </span>
                          <span className="text-xs font-medium text-emerald-600">
                            {emp.shiftCompletedDays} shifts completed
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Links Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Unproductive Links */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <MonitorOff className="w-5 h-5 text-rose-500" />
                  Top Unproductive Apps / Sites
                </h3>
              </div>
              <div className="p-0">
                {intelligence?.topUnproductiveLinks?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-10 font-medium">
                    No unproductive activity recorded.
                  </p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3">Application / URL</th>
                        <th className="px-6 py-3 text-right">
                          Total Time Spent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {intelligence?.topUnproductiveLinks?.map(
                        (link: any, i: number) => (
                          <tr
                            key={i}
                            className="hover:bg-gray-50/50 transition-colors"
                          >
                            <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-500">
                                <LinkIcon className="w-4 h-4" />
                              </div>
                              <span className="truncate max-w-[200px] sm:max-w-xs">
                                {link.app}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-rose-600">
                              {link.hours}h
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Productive Links */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-500" />
                  Top Productive Apps / Sites
                </h3>
              </div>
              <div className="p-0">
                {intelligence?.topProductiveLinks?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-10 font-medium">
                    No productive activity recorded.
                  </p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3">Application / URL</th>
                        <th className="px-6 py-3 text-right">
                          Total Time Spent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {intelligence?.topProductiveLinks?.map(
                        (link: any, i: number) => (
                          <tr
                            key={i}
                            className="hover:bg-gray-50/50 transition-colors"
                          >
                            <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
                                <LinkIcon className="w-4 h-4" />
                              </div>
                              <span className="truncate max-w-[200px] sm:max-w-xs">
                                {link.app}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-indigo-600">
                              {link.hours}h
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Compliance & Daily Flow */}
          <div className="mt-8">
            <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-indigo-600" />
              Compliance & Daily Flow
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Missed 1 Day */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-gray-100 bg-amber-50/30 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-amber-600 flex items-center gap-2">
                    <UserX className="w-4 h-4" />
                    Missed EOD (1 Day)
                  </h3>
                  <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {intelligence?.compliance?.missedOneDay?.length || 0}
                  </span>
                </div>
                <div className="p-2 flex-1 max-h-[300px] overflow-y-auto">
                  {intelligence?.compliance?.missedOneDay?.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6 font-medium">
                      All clear! Everyone submitted EODs.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {intelligence?.compliance?.missedOneDay?.map(
                        (emp: any) => (
                          <li
                            key={emp.employeeId}
                            className="flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-sm font-bold text-gray-900">
                              {emp.name}
                            </span>
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">
                              1 Day Missed
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              </div>

              {/* Missed 2+ Days */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-gray-100 bg-red-50/30 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-red-600 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Missed EOD (2+ Days)
                  </h3>
                  <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    {intelligence?.compliance?.missedMultipleDays?.length || 0}
                  </span>
                </div>
                <div className="p-2 flex-1 max-h-[300px] overflow-y-auto">
                  {intelligence?.compliance?.missedMultipleDays?.length ===
                  0 ? (
                    <p className="text-sm text-gray-500 text-center py-6 font-medium">
                      All clear! No repeat offenders.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {intelligence?.compliance?.missedMultipleDays?.map(
                        (emp: any) => (
                          <li
                            key={emp.employeeId}
                            className="flex justify-between items-center p-3 rounded-xl hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-sm font-bold text-gray-900">
                              {emp.name}
                            </span>
                            <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-black">
                              {emp.eodsMissed} Days Missed
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Flow Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center">
                <FileText className="w-6 h-6 text-indigo-400 mb-2" />
                <p className="text-xs font-bold text-gray-500">
                  Total EODs Submitted
                </p>
                <p className="text-2xl font-black text-gray-900 mt-1">
                  {stats.totalEods || 0}
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-2" />
                <p className="text-xs font-bold text-gray-500">
                  Total Todos Created
                </p>
                <p className="text-2xl font-black text-gray-900 mt-1">
                  {stats.totalTodos || 0}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
