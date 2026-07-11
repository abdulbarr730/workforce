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
} from "lucide-react";

interface DailyStatus {
  _id: string;
  employeeId: string;
  name: string;
  department: string | null;
  todo: { items: any[]; submittedAt: string } | null;
  eod: {
    summary: string;
    completedItems: string[];
    top3Tasks?: string[];
    hoursWorked: string;
    submittedAt: string;
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedUser.name}
                </h2>
                <p className="text-sm text-gray-500 font-medium">
                  {selectedUser.employeeId}{" "}
                  {selectedUser.department
                    ? `• ${selectedUser.department}`
                    : ""}
                </p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* Session Timeline */}
              <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Session Log
                  </h3>
                  {selectedUser.sessions &&
                    selectedUser.sessions.length > 0 && (
                      <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-md">
                        {selectedUser.sessions.length} Session
                        {selectedUser.sessions.length === 1 ? "" : "s"}
                      </span>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div className="flex-1 bg-white p-3 rounded-xl border border-blue-100 shadow-sm text-center">
                    <p className="text-xs text-gray-500 font-bold mb-1 uppercase">
                      First Login
                    </p>
                    <p className="text-lg font-black text-emerald-600">
                      {selectedUser.loginTime
                        ? new Date(selectedUser.loginTime).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )
                        : "—"}
                    </p>
                  </div>
                  <div className="h-px sm:h-8 w-12 sm:w-px bg-blue-200 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400"></div>
                  </div>
                  <div className="flex-1 bg-white p-3 rounded-xl border border-blue-100 shadow-sm text-center">
                    <p className="text-xs text-gray-500 font-bold mb-1 uppercase">
                      Final Logout
                    </p>
                    <p className="text-lg font-black text-indigo-600">
                      {selectedUser.logoutTime ? (
                        selectedUser.expectedLogoutTime &&
                        new Date(selectedUser.logoutTime) >
                          new Date(selectedUser.expectedLogoutTime) ? (
                          <span title="Auto-capped to expected logout">
                            {new Date(
                              selectedUser.expectedLogoutTime,
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        ) : (
                          new Date(selectedUser.logoutTime).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )
                        )
                      ) : selectedUser.expectedLogoutTime &&
                        new Date() >
                          new Date(selectedUser.expectedLogoutTime) ? (
                        <span className="text-gray-400 italic" title="Expected">
                          {new Date(
                            selectedUser.expectedLogoutTime,
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : selectedUser.loginTime ? (
                        <span className="text-emerald-600 text-base">
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
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <LayoutList className="w-5 h-5 text-indigo-500" />
                    To-Do List
                  </h3>
                  {selectedUser.todo && (
                    <span className="text-xs font-medium bg-white px-2 py-1 rounded border border-gray-200 text-gray-500">
                      {new Date(
                        selectedUser.todo.submittedAt,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <div className="p-5 bg-white">
                  {!selectedUser.todo ? (
                    <p className="text-sm text-red-500 font-medium py-4 text-center">
                      No To-Do list submitted for this day.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {selectedUser.todo.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex gap-3 items-start text-sm text-gray-700 bg-gray-50/50 p-3 rounded-lg border border-gray-100"
                        >
                          <span className="text-indigo-400 shrink-0 mt-0.5 font-bold">
                            {idx + 1}.
                          </span>
                          <span className="leading-relaxed">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* EOD Report */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Check className="w-5 h-5 text-emerald-500" />
                    End of Day Report
                  </h3>
                  {selectedUser.eod && (
                    <span className="text-xs font-medium bg-white px-2 py-1 rounded border border-gray-200 text-gray-500">
                      {new Date(
                        selectedUser.eod.submittedAt,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <div className="p-5 bg-white">
                  {!selectedUser.eod ? (
                    <p className="text-sm text-gray-400 font-medium py-4 text-center">
                      EOD Report not yet submitted.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {selectedUser.eod.hoursWorked && (
                        <div className="inline-block bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-sm font-bold border border-emerald-100">
                          Hours tracked: {selectedUser.eod.hoursWorked}h
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                          Summary
                        </p>
                        <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-100 leading-relaxed">
                          {selectedUser.eod.summary || "No summary provided."}
                        </p>
                      </div>

                      {selectedUser.eod.top3Tasks &&
                        selectedUser.eod.top3Tasks.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                              🌟 Top 3 Tasks Completed
                            </p>
                            <ul className="space-y-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                              {selectedUser.eod.top3Tasks.map((t, idx) => (
                                <li
                                  key={idx}
                                  className="flex gap-3 items-start text-sm text-indigo-900"
                                >
                                  <span className="font-bold text-indigo-400 shrink-0 mt-0.5">
                                    {idx + 1}.
                                  </span>
                                  <span className="font-medium">{t}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {selectedUser.eod.completedItems &&
                        selectedUser.eod.completedItems.length > 0 &&
                        (() => {
                          let totalMinutes = 0;

                          const parseTime = (timeStr: string) => {
                            if (!timeStr) return 0;
                            const t = timeStr.trim().toLowerCase();
                            if (t.includes("h")) {
                              const hrs = parseFloat(t.replace("h", ""));
                              return isNaN(hrs) ? 0 : hrs * 60;
                            } else if (t.includes("m")) {
                              const mins = parseFloat(t.replace("m", ""));
                              return isNaN(mins) ? 0 : mins;
                            } else if (t.includes(":")) {
                              const [h, m] = t.split(":");
                              return (
                                (parseInt(h) || 0) * 60 + (parseInt(m) || 0)
                              );
                            } else {
                              const val = parseFloat(t);
                              return isNaN(val) ? 0 : val * 60; // default to hours if just a number like 2.5
                            }
                          };

                          const formatTime = (totalMins: number) => {
                            if (totalMins === 0) return "-";
                            const h = Math.floor(totalMins / 60);
                            const m = Math.round(totalMins % 60);
                            return h > 0 ? `${h}h ${m}m` : `${m}m`;
                          };

                          const parsedItems =
                            selectedUser.eod.completedItems.map((item) => {
                              const isHeader =
                                item.startsWith("📌") ||
                                item.startsWith("📋") ||
                                item.startsWith("🚨") ||
                                item.startsWith("---");
                              if (isHeader)
                                return {
                                  isHeader: true,
                                  task: item,
                                  timeStr: "",
                                  mins: 0,
                                };

                              let task = item;
                              let timeStr = "";

                              // Parse "Task Name - 2:30"
                              const dashMatch =
                                item.match(/^(.*)\s+-\s+(.*?)$/);
                              if (dashMatch) {
                                task = dashMatch[1].trim();
                                timeStr = dashMatch[2].trim();
                              } else {
                                // Parse legacy "Task Name (2.5h)"
                                const parenMatch =
                                  item.match(/^(.*)\s+\((.*?)\)$/);
                                if (parenMatch) {
                                  task = parenMatch[1].trim();
                                  timeStr = parenMatch[2].trim();
                                }
                              }

                              const mins = parseTime(timeStr);
                              totalMinutes += mins;

                              return { isHeader: false, task, timeStr, mins };
                            });

                          return (
                            <div className="mt-6">
                              <div className="flex justify-between items-end mb-3">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                  Completed Tasks
                                </p>
                                {totalMinutes > 0 && (
                                  <div className="bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg">
                                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-2">
                                      <Clock className="w-3.5 h-3.5" /> Total
                                      Time: {formatTime(totalMinutes)}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-50/80">
                                    <tr>
                                      <th
                                        scope="col"
                                        className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-full"
                                      >
                                        Task Description
                                      </th>
                                      <th
                                        scope="col"
                                        className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[120px]"
                                      >
                                        Time Logged
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {parsedItems.map((item, i) => {
                                      if (item.isHeader) {
                                        return (
                                          <tr key={i} className="bg-gray-50/50">
                                            <td
                                              colSpan={2}
                                              className="px-4 py-3 text-sm font-bold text-gray-800 border-l-2 border-indigo-500"
                                            >
                                              {item.task}
                                            </td>
                                          </tr>
                                        );
                                      }
                                      return (
                                        <tr
                                          key={i}
                                          className="hover:bg-gray-50 transition-colors"
                                        >
                                          <td className="px-4 py-3 text-sm text-gray-700">
                                            <div className="flex items-start gap-2">
                                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                              <span>{item.task}</span>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 text-sm text-gray-600 font-medium text-right font-mono bg-gray-50/30">
                                            {item.timeStr || "-"}
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
