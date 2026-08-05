"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  LayoutList,
  Check,
  User as UserIcon,
  RefreshCw,
  Star,
  Sparkles,
  X,
  Calendar,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

interface DailyStatus {
  _id: string;
  employeeId: string;
  name: string;
  department: string | null;
  todo: {
    items: any[];
    submittedAt: string;
    checkins?: any[];
    isMissedTodo?: boolean;
    todoHistory?: any[];
  } | null;
  eod: {
    summary: string;
    completedItems: string[];
    tasksWithTimings?: Array<{
      task: string;
      interval?: string;
      timeTaken?: string;
      isTopTask?: boolean;
    }>;
    top3Tasks?: string[];
    hoursWorked: string;
    submittedAt: string;
    isMissedEod?: boolean;
    eodHistory?: any[];
  } | null;
  loginTime: string | null;
  logoutTime: string | null;
  expectedLogoutTime?: string | null;
  sessions?: { loginAt: string; logoutAt: string | null }[];
}

export default function DailyReportsPage() {
  const [dateInput, setDateInput] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<DailyStatus | null>(null);
  const [todoFilter, setTodoFilter] = useState("ALL");
  const [eodFilter, setEodFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");

  const {
    data: statuses,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["daily-status", dateInput],
    queryFn: () =>
      api
        .get(`/api/daily-flow/status?date=${dateInput}`)
        .then((r) => r.data.data),
  });

  const departments = useMemo(() => {
    if (!statuses) return [];
    const depts = new Set<string>();
    statuses.forEach((s: DailyStatus) => {
      if (s.department) depts.add(s.department);
    });
    return Array.from(depts).sort();
  }, [statuses]);

  const filtered = useMemo(() => {
    return (statuses || []).filter((s: DailyStatus) => {
      let match = true;
      if (search) {
        const sq = search.toLowerCase();
        match =
          match &&
          (s.name.toLowerCase().includes(sq) ||
            s.employeeId.toLowerCase().includes(sq));
      }
      if (todoFilter === "SUBMITTED") match = match && !!s.todo;
      if (todoFilter === "MISSING") match = match && !s.todo;
      if (eodFilter === "SUBMITTED") match = match && !!s.eod;
      if (eodFilter === "PENDING") match = match && !s.eod;
      if (deptFilter !== "ALL") match = match && s.department === deptFilter;
      return match;
    });
  }, [statuses, search, todoFilter, eodFilter, deptFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            EOD and Todo list
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of To-Dos and EOD submissions across the team.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-48"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d: string) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={todoFilter}
            onChange={(e) => setTodoFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
          >
            <option value="ALL">To-Do: All</option>
            <option value="SUBMITTED">To-Do: Submitted</option>
            <option value="MISSING">To-Do: Missing</option>
          </select>
          <select
            value={eodFilter}
            onChange={(e) => setEodFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
          >
            <option value="ALL">EOD: All</option>
            <option value="SUBMITTED">EOD: Submitted</option>
            <option value="PENDING">EOD: Pending</option>
          </select>
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-gray-700 w-full sm:w-auto bg-gray-50 hover:bg-gray-100 transition-colors"
          />
          <button
            onClick={() => refetch()}
            className="px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors flex items-center justify-center"
            title="Refresh Data"
            disabled={isRefetching}
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">
          Loading daily status...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((user: DailyStatus) => {
            const hasTodo = !!user.todo;
            const hasEod = !!user.eod;

            // Green if To-Do submitted, Red if missing
            const borderClass = hasTodo
              ? "border-emerald-500 shadow-emerald-500/10"
              : "border-red-400 shadow-red-500/10";

            return (
              <div
                key={user.employeeId}
                onClick={() => setSelectedUser(user)}
                className={`bg-white rounded-2xl p-5 border-2 ${borderClass} shadow-md hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-sm ${hasTodo ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}
                    >
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 leading-tight">
                        {user.name}
                      </h3>
                      <p className="text-xs text-gray-500 font-medium">
                        {user.employeeId}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="text-gray-600 flex items-center gap-2">
                      <LayoutList className="w-4 h-4 text-indigo-400" /> To-Do
                    </span>
                    {hasTodo ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1 text-xs">
                        <CheckCircle2 className="w-4 h-4" /> Submitted
                      </span>
                    ) : (
                      <span className="text-red-500 font-bold flex items-center gap-1 text-xs">
                        <XCircle className="w-4 h-4" /> Missing
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="text-gray-600 flex items-center gap-2">
                      <Check className="w-4 h-4 text-violet-400" /> EOD
                    </span>
                    {hasEod ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1 text-xs">
                        <CheckCircle2 className="w-4 h-4" /> Submitted
                      </span>
                    ) : (
                      <span className="text-gray-400 font-bold flex items-center gap-1 text-xs">
                        <Clock className="w-4 h-4" /> Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-dashed border-gray-300">
              <UserIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                No employees found for this criteria.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 via-white to-gray-50/80">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white font-extrabold text-lg flex items-center justify-center shadow-md shadow-indigo-500/20">
                  {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : "U"}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                      {selectedUser.name}
                    </h2>
                    {selectedUser.loginTime && !selectedUser.logoutTime && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active Shift
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">
                      {selectedUser.employeeId}
                    </span>
                    {selectedUser.department && (
                      <span className="text-xs font-medium text-indigo-700 bg-indigo-50/80 px-2.5 py-0.5 rounded-md border border-indigo-100">
                        {selectedUser.department}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all hover:scale-105 active:scale-95"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* Session Summary Log */}
              <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-violet-50/40 rounded-2xl p-5 border border-blue-100/80 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" /> Shift & Session Log
                  </h3>
                  {selectedUser.sessions && selectedUser.sessions.length > 0 && (
                    <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full border border-blue-200">
                      {selectedUser.sessions.length} Session{selectedUser.sessions.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="bg-white/90 backdrop-blur-xs p-4 rounded-xl border border-blue-100/90 shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                        First Login
                      </p>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-lg font-black text-emerald-600 font-mono">
                      {selectedUser.loginTime
                        ? new Date(selectedUser.loginTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-white/90 backdrop-blur-xs p-4 rounded-xl border border-blue-100/90 shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                        Final Logout
                      </p>
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    </div>
                    <p className="text-lg font-black text-indigo-600 font-mono">
                      {selectedUser.logoutTime ? (
                        selectedUser.expectedLogoutTime &&
                        new Date(selectedUser.logoutTime) > new Date(selectedUser.expectedLogoutTime) ? (
                          <span title="Auto-capped to expected logout">
                            {new Date(selectedUser.expectedLogoutTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        ) : (
                          new Date(selectedUser.logoutTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        )
                      ) : selectedUser.expectedLogoutTime &&
                        new Date() > new Date(selectedUser.expectedLogoutTime) ? (
                        <span className="text-gray-400 italic font-sans text-sm" title="Expected">
                          {new Date(selectedUser.expectedLogoutTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : selectedUser.loginTime ? (
                        <span className="text-emerald-600 font-sans text-base font-bold">
                          Ongoing
                        </span>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* To-Do List */}
              <div className="border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xs bg-white">
                <div className="bg-gray-50/90 px-5 py-3.5 border-b border-gray-200/80 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                    <LayoutList className="w-4 h-4 text-indigo-600" />
                    Morning To-Do List
                  </h3>
                  {selectedUser.todo && (
                    <span className="text-xs font-semibold bg-white px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 shadow-2xs">
                      Submitted at {new Date(selectedUser.todo.submittedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <div className="p-5">
                  {!selectedUser.todo ? (
                    <p className="text-sm text-red-500 font-medium py-3 text-center">
                      No To-Do list submitted for this day.
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-2.5">
                        {selectedUser.todo.items.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-center justify-between gap-3 text-sm text-gray-700 bg-gray-50/70 hover:bg-gray-50 p-3 rounded-xl border border-gray-100 transition-colors"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="text-indigo-600 shrink-0 font-bold text-xs bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100/80">
                                #{idx + 1}
                              </span>
                              <span className="leading-relaxed font-medium text-gray-800 break-words">
                                {item.text}
                              </span>
                              {item.isTopTask && (
                                <span className="shrink-0 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  ★ Top Task
                                </span>
                              )}
                            </div>
                            {(item.timeTaken || item.estimatedTime) && (
                              <div className="shrink-0 flex items-center gap-1.5 bg-white border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 font-mono shadow-2xs">
                                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                <span>{item.timeTaken || item.estimatedTime}</span>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>

                      {selectedUser.todo.isMissedTodo && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800 font-semibold">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          This was a missed To-Do submitted retroactively.
                        </div>
                      )}

                      {selectedUser.todo.todoHistory && selectedUser.todo.todoHistory.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-gray-100">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                            Edit History
                          </h4>
                          <div className="space-y-2">
                            {selectedUser.todo.todoHistory.map((hist: any, i: number) => (
                              <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs">
                                <div className="flex justify-between items-center mb-1 text-gray-400 font-medium">
                                  <span>{new Date(hist.editedAt).toLocaleString()}</span>
                                  <span className="font-semibold text-gray-600">Reason: {hist.reason}</span>
                                </div>
                                <p className="text-gray-700 italic border-l-2 border-indigo-300 pl-2">
                                  {hist.items?.map((item: any) => item.text).join(", ")}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* End of Day Report */}
              <div className="border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xs bg-white">
                <div className="bg-gray-50/90 px-5 py-3.5 border-b border-gray-200/80 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    End of Day Report
                  </h3>
                  {selectedUser.eod && (
                    <span className="text-xs font-semibold bg-white px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 shadow-2xs">
                      Submitted at {new Date(selectedUser.eod.submittedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <div className="p-5">
                  {!selectedUser.eod ? (
                    <p className="text-sm text-gray-400 font-medium py-4 text-center">
                      EOD Report not yet submitted.
                    </p>
                  ) : (
                    <div className="space-y-5">
                      {/* Summary Box */}
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          Summary
                        </p>
                        <div className="text-sm text-gray-800 bg-slate-50/80 p-3.5 rounded-xl border-l-4 border-l-indigo-500 border border-gray-200/70 leading-relaxed font-medium">
                          {selectedUser.eod.summary || "End of Day submission"}
                        </div>
                      </div>

                      {/* Top 3 Tasks Completed */}
                      {selectedUser.eod.top3Tasks && selectedUser.eod.top3Tasks.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Top Tasks Completed
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            {selectedUser.eod.top3Tasks.map((t, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-50/60 to-indigo-50/40 rounded-xl border border-amber-200/70 text-sm font-semibold text-gray-800"
                              >
                                <span className="w-6 h-6 rounded-lg bg-amber-500 text-white font-extrabold text-xs flex items-center justify-center shadow-2xs shrink-0">
                                  #{idx + 1}
                                </span>
                                <span className="break-words">{t}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Completed Tasks Table with Per-Row Time Stamp */}
                      {(() => {
                        // Helper to parse duration string to minutes
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

                        const formatTotalMinutes = (totalMins: number) => {
                          if (totalMins === 0) return "-";
                          const h = Math.floor(totalMins / 60);
                          const m = Math.round(totalMins % 60);
                          return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
                        };

                        // Extract structured rows
                        const rawItems: Array<{
                          isHeader?: boolean;
                          task: string;
                          interval: string;
                          timeStr: string;
                          isTopTask?: boolean;
                        }> = [];

                        if (selectedUser.eod.tasksWithTimings && selectedUser.eod.tasksWithTimings.length > 0) {
                          selectedUser.eod.tasksWithTimings.forEach((t) => {
                            rawItems.push({
                              task: t.task || "",
                              interval: t.interval || "",
                              timeStr: t.timeTaken || "",
                              isTopTask: !!t.isTopTask,
                            });
                          });
                        } else if (selectedUser.eod.completedItems && selectedUser.eod.completedItems.length > 0) {
                          selectedUser.eod.completedItems.forEach((item) => {
                            const isHeader =
                              item.startsWith("📌") ||
                              item.startsWith("📋") ||
                              item.startsWith("🚨") ||
                              item.startsWith("---");
                            if (isHeader) {
                              rawItems.push({ isHeader: true, task: item, interval: "", timeStr: "" });
                              return;
                            }

                            let task = item;
                            let interval = "";
                            let timeStr = "";

                            // Extract interval pattern like (02:38 PM – 04:38 PM) or [10:00 AM - 12:40 PM]
                            const stampMatch = task.match(
                              /\(?(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?\s*[-–—]\s*\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)\)?/i
                            );
                            if (stampMatch) {
                              interval = stampMatch[1].trim();
                              task = task.replace(stampMatch[0], "").trim();
                            }

                            // Extract trailing duration pattern like " - 02:40:00" or " - 2h 40m" or " (2.5h)"
                            const dashMatch = task.match(/^(.*?)\s*-\s*([\d:.]+(?:\s*(?:h|hr|hrs|m|min|mins|s|sec|secs))?)$/i);
                            if (dashMatch) {
                              task = dashMatch[1].trim();
                              timeStr = dashMatch[2].trim();
                            } else {
                              const parenMatch = task.match(/^(.*?)\s*\(([\d:.]+(?:\s*(?:h|hr|hrs|m|min|mins|s|sec|secs))?)\)$/i);
                              if (parenMatch) {
                                task = parenMatch[1].trim();
                                timeStr = parenMatch[2].trim();
                              }
                            }

                            rawItems.push({ isHeader: false, task, interval, timeStr });
                          });
                        }

                        if (rawItems.length === 0) return null;

                        // Calculate progressive timestamps starting from login time (default 10:00 AM)
                        let cursorTime: Date;
                        if (selectedUser.loginTime) {
                          cursorTime = new Date(selectedUser.loginTime);
                        } else {
                          cursorTime = new Date();
                          cursorTime.setHours(10, 0, 0, 0);
                        }

                        let totalMinutes = 0;

                        const parsedRows = rawItems.map((item) => {
                          if (item.isHeader) {
                            return { ...item, mins: 0, timeStamp: "" };
                          }

                          const mins = parseDurationToMins(item.timeStr);
                          totalMinutes += mins;

                          let timeStamp = item.interval;
                          if (!timeStamp || timeStamp === "-" || timeStamp.trim() === "") {
                            const startTime = new Date(cursorTime);
                            const durationMins = mins > 0 ? mins : 45;
                            cursorTime = new Date(cursorTime.getTime() + durationMins * 60 * 1000);
                            const endTime = new Date(cursorTime);
                            timeStamp = `${formatClock(startTime)} – ${formatClock(endTime)}`;
                          }

                          const isTop =
                            item.isTopTask ||
                            (selectedUser.eod?.top3Tasks &&
                              selectedUser.eod.top3Tasks.some(
                                (top) => top && item.task && top.toLowerCase().includes(item.task.toLowerCase().slice(0, 15))
                              ));

                          return {
                            ...item,
                            mins,
                            timeStamp,
                            isTopTask: isTop,
                          };
                        });

                        return (
                          <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
                                Completed Tasks
                              </p>
                              {totalMinutes > 0 && (
                                <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-xl text-xs font-bold text-indigo-700 shadow-2xs">
                                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>TOTAL TIME: {formatTotalMinutes(totalMinutes)}</span>
                                </div>
                              )}
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xs">
                              <table className="min-w-full divide-y divide-gray-200/80">
                                <thead className="bg-gray-50/90">
                                  <tr>
                                    <th
                                      scope="col"
                                      className="px-4 py-3 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider w-44"
                                    >
                                      Time Stamp
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-4 py-3 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider"
                                    >
                                      Task Description
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-4 py-3 text-right text-[11px] font-extrabold text-gray-500 uppercase tracking-wider whitespace-nowrap w-32"
                                    >
                                      Time Logged
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm">
                                  {parsedRows.map((row, i) => {
                                    if (row.isHeader) {
                                      return (
                                        <tr key={i} className="bg-gray-50/60">
                                          <td
                                            colSpan={3}
                                            className="px-4 py-2.5 text-xs font-bold text-gray-700 border-l-4 border-l-indigo-500"
                                          >
                                            {row.task}
                                          </td>
                                        </tr>
                                      );
                                    }

                                    return (
                                      <tr
                                        key={i}
                                        className="hover:bg-indigo-50/30 transition-colors group"
                                      >
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-indigo-700 bg-indigo-50/80 px-2.5 py-1 rounded-lg border border-indigo-100 shadow-2xs">
                                            <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                                            {row.timeStamp}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-800">
                                          <div className="flex items-start gap-2.5">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                            <div className="flex-1">
                                              <span className="font-semibold text-gray-900 leading-snug">
                                                {row.task}
                                              </span>
                                              {row.isTopTask && (
                                                <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded-full">
                                                  ★ Top Task
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                          <span className="font-mono text-xs font-extrabold text-indigo-900 bg-slate-100/90 px-2.5 py-1 rounded-lg border border-gray-200 shadow-2xs">
                                            {row.timeStr || (row.mins > 0 ? formatTotalMinutes(row.mins) : "—")}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      {selectedUser.eod.isMissedEod && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800 font-semibold">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          This was a missed EOD submitted retroactively.
                        </div>
                      )}

                      {selectedUser.eod.eodHistory && selectedUser.eod.eodHistory.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-gray-100">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                            Edit History
                          </h4>
                          <div className="space-y-2">
                            {selectedUser.eod.eodHistory.map((hist: any, i: number) => (
                              <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs">
                                <div className="flex justify-between items-center mb-1 text-gray-400 font-medium">
                                  <span>{new Date(hist.editedAt).toLocaleString()}</span>
                                  <span className="font-semibold text-gray-600">Reason: {hist.reason}</span>
                                </div>
                                <p className="text-gray-700 italic border-l-2 border-indigo-300 pl-2">
                                  {hist.summary}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
