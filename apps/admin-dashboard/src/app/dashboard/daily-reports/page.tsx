"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { EodReportDetails } from "@/components/daily-flow/EodReportDetails";
import { ChangeDiffPanel } from "@/components/notifications/ChangeDiffPanel";
import { DailyReportInsights } from "./DailyReportInsights";
import {
  AdminNotification,
  useAdminNotifications,
} from "@/hooks/use-admin-notifications";
import {
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  LayoutList,
  Check,
  User as UserIcon,
  RefreshCw,
  X,
  Calendar,
  AlertCircle,
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
      text?: string;
      task?: string;
      interval?: string;
      timeTaken?: string;
      count?: number;
      callCount?: number;
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

const historyTexts = (items: any[] = []) =>
  items
    .map((item) => String(item?.text ?? item?.task ?? item ?? "").trim())
    .filter(Boolean);

function HistoryTaskDiff({ before, after }: { before?: any[]; after?: any[] }) {
  const afterTexts = historyTexts(after);
  if (!before) {
    return (
      <p className="border-l-2 border-indigo-300 pl-2 italic text-gray-700">
        {afterTexts.join(", ") || "No task details recorded"}
      </p>
    );
  }
  const beforeTexts = historyTexts(before);
  const beforeKeys = new Set(beforeTexts.map((item) => item.toLowerCase()));
  const afterKeys = new Set(afterTexts.map((item) => item.toLowerCase()));
  const removed = beforeTexts.filter(
    (item) => !afterKeys.has(item.toLowerCase()),
  );
  const added = afterTexts.filter(
    (item) => !beforeKeys.has(item.toLowerCase()),
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-red-100 bg-red-50 p-2">
        <p className="mb-1 font-bold text-red-700">Removed</p>
        <p className="text-red-800 line-through">
          {removed.join(", ") || "Nothing removed"}
        </p>
      </div>
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2">
        <p className="mb-1 font-bold text-emerald-700">Added</p>
        <p className="text-emerald-800">
          {added.join(", ") || "Nothing added"}
        </p>
      </div>
    </div>
  );
}

export default function DailyReportsPage() {
  const searchParams = useSearchParams();
  const linkedDate = searchParams.get("date");
  const linkedEmployeeId = searchParams.get("employeeId");
  const notificationId = searchParams.get("notification");
  const [dateInput, setDateInput] = useState(
    linkedDate || new Date().toISOString().split("T")[0],
  );
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<DailyStatus | null>(null);
  const [todoFilter, setTodoFilter] = useState("ALL");
  const [eodFilter, setEodFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const lastLinkedDateRef = useRef(linkedDate);
  const { markRead } = useAdminNotifications();

  const { data: linkedNotification } = useQuery({
    queryKey: ["admin-notification", notificationId],
    queryFn: () =>
      api
        .get(`/api/notifications/${notificationId}`)
        .then((response) => response.data.data as AdminNotification),
    enabled: Boolean(notificationId),
  });

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

  const editHistory = useMemo(() => {
    const rows: Array<{
      key: string;
      employee: DailyStatus;
      type: "TODO" | "EOD";
      reason: string;
      editedAt: string;
      changedBy?: string;
    }> = [];
    (statuses || []).forEach((status: DailyStatus) => {
      (status.todo?.todoHistory || []).forEach((item: any, index: number) => {
        rows.push({
          key: `${status.employeeId}-todo-${item.editedAt || index}`,
          employee: status,
          type: "TODO",
          reason: item.reason || "Todo edited",
          editedAt: item.editedAt || status.todo?.submittedAt || dateInput,
          changedBy: item.editedByName || item.editedBy || status.name,
        });
      });
      (status.eod?.eodHistory || []).forEach((item: any, index: number) => {
        rows.push({
          key: `${status.employeeId}-eod-${item.editedAt || index}`,
          employee: status,
          type: "EOD",
          reason: item.reason || "EOD edited",
          editedAt: item.editedAt || status.eod?.submittedAt || dateInput,
          changedBy: item.editedByName || item.editedBy || status.name,
        });
      });
    });
    const q = historySearch.trim().toLowerCase();
    return rows
      .filter((row) =>
        !q
          ? true
          : [
              row.employee.name,
              row.employee.employeeId,
              row.type,
              row.reason,
              row.changedBy || "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(q),
      )
      .sort(
        (a, b) =>
          new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime(),
      );
  }, [statuses, historySearch, dateInput]);

  useEffect(() => {
    if (!linkedDate || linkedDate === lastLinkedDateRef.current) return;
    lastLinkedDateRef.current = linkedDate;
    setDateInput(linkedDate);
    setSelectedUser(null);
  }, [linkedDate]);

  useEffect(() => {
    if (!notificationId) return;
    void markRead(notificationId).catch(() => undefined);
  }, [markRead, notificationId]);

  useEffect(() => {
    if (!linkedEmployeeId || !statuses) return;
    const employee = (statuses as DailyStatus[]).find(
      (status) => status.employeeId === linkedEmployeeId,
    );
    if (employee) setSelectedUser(employee);
  }, [linkedEmployeeId, statuses]);

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

      {linkedNotification && !selectedUser && (
        <ChangeDiffPanel notification={linkedNotification} />
      )}

      <DailyReportInsights
        date={dateInput}
        employees={(statuses || []).map((status: DailyStatus) => ({
          employeeId: status.employeeId,
          name: status.name,
        }))}
      />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              EOD / Todo edit history
            </h2>
            <p className="text-sm text-gray-500">
              Search edits for the selected date. Click a row to open that employee's report.
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search employee, reason, type..."
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        {editHistory.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No edit history found for this date.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
            {editHistory.slice(0, 12).map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => setSelectedUser(row.employee)}
                className="flex w-full items-center justify-between gap-4 bg-white px-4 py-3 text-left hover:bg-indigo-50/50"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {row.employee.name}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.type === "EOD" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                      {row.type}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-sm text-gray-600">
                    {row.reason}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-gray-500">
                  <span className="block font-semibold">{row.changedBy}</span>
                  <span>{new Date(row.editedAt).toLocaleString()}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

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
                  {selectedUser.name
                    ? selectedUser.name.charAt(0).toUpperCase()
                    : "U"}
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
              {linkedNotification && (
                <ChangeDiffPanel notification={linkedNotification} />
              )}
              {/* Session Summary Log */}
              <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-violet-50/40 rounded-2xl p-5 border border-blue-100/80 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" /> Shift & Session
                    Log
                  </h3>
                  {selectedUser.sessions &&
                    selectedUser.sessions.length > 0 && (
                      <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full border border-blue-200">
                        {selectedUser.sessions.length} Session
                        {selectedUser.sessions.length === 1 ? "" : "s"}
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
                        ? new Date(selectedUser.loginTime).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )
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
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )
                        )
                      ) : selectedUser.expectedLogoutTime &&
                        new Date() >
                          new Date(selectedUser.expectedLogoutTime) ? (
                        <span
                          className="text-gray-400 italic font-sans text-sm"
                          title="Expected"
                        >
                          {new Date(
                            selectedUser.expectedLogoutTime,
                          ).toLocaleTimeString([], {
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
                      Submitted at{" "}
                      {new Date(
                        selectedUser.todo.submittedAt,
                      ).toLocaleTimeString([], {
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
                                <span>
                                  {item.timeTaken || item.estimatedTime}
                                </span>
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

                      {selectedUser.todo.todoHistory &&
                        selectedUser.todo.todoHistory.length > 0 && (
                          <div className="mt-5 pt-4 border-t border-gray-100">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                              Edit History
                            </h4>
                            <div className="space-y-2">
                              {selectedUser.todo.todoHistory.map(
                                (hist: any, i: number) => (
                                  <div
                                    key={i}
                                    className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs"
                                  >
                                    <div className="flex justify-between items-center mb-1 text-gray-400 font-medium">
                                      <span>
                                        {new Date(
                                          hist.editedAt,
                                        ).toLocaleString()}
                                      </span>
                                      <span className="font-semibold text-gray-600">
                                        Reason: {hist.reason}
                                      </span>
                                    </div>
                                    <HistoryTaskDiff
                                      before={hist.beforeItems}
                                      after={hist.afterItems || hist.items}
                                    />
                                  </div>
                                ),
                              )}
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
                      Submitted at{" "}
                      {new Date(
                        selectedUser.eod.submittedAt,
                      ).toLocaleTimeString([], {
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
                      <EodReportDetails report={selectedUser.eod} />
                      {selectedUser.eod.isMissedEod && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800 font-semibold">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          This was a missed EOD submitted retroactively.
                        </div>
                      )}

                      {selectedUser.eod.eodHistory &&
                        selectedUser.eod.eodHistory.length > 0 && (
                          <div className="mt-5 pt-4 border-t border-gray-100">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                              Edit History
                            </h4>
                            <div className="space-y-2">
                              {selectedUser.eod.eodHistory.map(
                                (hist: any, i: number) => (
                                  <div
                                    key={i}
                                    className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs"
                                  >
                                    <div className="flex justify-between items-center mb-1 text-gray-400 font-medium">
                                      <span>
                                        {new Date(
                                          hist.editedAt,
                                        ).toLocaleString()}
                                      </span>
                                      <span className="font-semibold text-gray-600">
                                        Reason: {hist.reason}
                                      </span>
                                    </div>
                                    <HistoryTaskDiff
                                      before={
                                        hist.beforeSnapshot?.tasksWithTimings
                                          ?.length
                                          ? hist.beforeSnapshot.tasksWithTimings
                                          : hist.beforeSnapshot?.completedItems
                                      }
                                      after={
                                        hist.afterSnapshot?.tasksWithTimings
                                          ?.length
                                          ? hist.afterSnapshot.tasksWithTimings
                                          : hist.afterSnapshot
                                              ?.completedItems ||
                                            hist.completedItems
                                      }
                                    />
                                    {hist.beforeSnapshot?.summary !==
                                      undefined &&
                                      hist.beforeSnapshot.summary !==
                                        hist.afterSnapshot?.summary && (
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                          <p className="rounded-lg bg-red-50 p-2 text-red-800">
                                            <strong>Previous summary:</strong>{" "}
                                            {hist.beforeSnapshot.summary ||
                                              "Empty"}
                                          </p>
                                          <p className="rounded-lg bg-emerald-50 p-2 text-emerald-800">
                                            <strong>New summary:</strong>{" "}
                                            {hist.afterSnapshot?.summary ||
                                              hist.summary}
                                          </p>
                                        </div>
                                      )}
                                  </div>
                                ),
                              )}
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
