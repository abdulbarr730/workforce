"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SendEmailToggle, useSendEmailChoice } from "@/components/SendEmailToggle";
import {
  CalendarOff,
  CalendarRange,
  Check,
  Clock3,
  Download,
  Inbox,
  Lock,
  Search,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type Tab = "LEAVE" | "HALF_DAY" | "ATTENDANCE";

type HistoryEntry = {
  at: string;
  byName?: string | null;
  action: string;
  note?: string;
};

type Leave = {
  _id: string;
  employeeId: string;
  employeeName?: string;
  decidedByName?: string | null;
  paidDays?: number | null;
  monthlyPaidDays?: number | null;
  floatingPaidDays?: number | null;
  unpaidDays?: number | null;
  history?: HistoryEntry[];
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: Status;
  adminReason?: string | null;
  createdAt?: string;
};

type ChangeRequest = {
  _id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  requestedLoginTime: string;
  requestedLogoutTime?: string | null;
  reason: string;
  status: Status;
  decisionReason?: string;
  decidedByName?: string | null;
  createdAt?: string;
  before?: {
    attendanceStatus?: string | null;
    loginTime?: string | null;
    logoutTime?: string | null;
  };
  history?: HistoryEntry[];
};

type Row = {
  id: string;
  rawId: string;
  kind: Tab;
  employeeId: string;
  employeeName: string;
  dateKey: string;
  dates: string;
  detail: string;
  reason: string;
  status: Status;
  decision: string;
  createdAt: string;
  history?: ChangeRequest["history"];
};

const dateKey = (value?: string | null) => String(value || "").slice(0, 10);
const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
const clock = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const statusStyles: Record<Status, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export default function RequestsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [tab, setTab] = useState<Tab>("LEAVE");
  // Opens on the Pending section; Approved / Rejected / Cancelled / All are one click away.
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("PENDING");
  const [exportMonth, setExportMonth] = useState(todayKey().slice(0, 7));
  const [exporting, setExporting] = useState(false);
  const [focusId, setFocusId] = useState("");

  // Deep links from notifications: ?tab=attendance&id=... or ?leaveId=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "attendance") setTab("ATTENDANCE");
    const id = params.get("id") || params.get("leaveId") || "";
    if (id) setFocusId(id);
  }, []);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notice, setNotice] = useState("");
  const [sendEmail, setSendEmail] = useSendEmailChoice("request-decisions");

  const { data: leaves = [] } = useQuery<Leave[]>({
    queryKey: ["requests-leaves"],
    queryFn: () =>
      api.get("/api/attendance/time-off/leaves").then((r) => r.data.data),
    refetchInterval: 60_000,
  });
  const { data: changes = [] } = useQuery<ChangeRequest[]>({
    queryKey: ["requests-attendance"],
    queryFn: () =>
      api.get("/api/attendance/change-requests").then((r) => r.data.data),
    refetchInterval: 60_000,
  });
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });
  const nameById = useMemo(() => {
    const rows = Array.isArray(usersData) ? usersData : usersData?.users || [];
    return new Map<string, string>(
      rows.map((u: any) => [String(u.employeeId), String(u.name)]),
    );
  }, [usersData]);

  const rows: Row[] = useMemo(() => {
    const leaveRows: Row[] = leaves.map((leave) => {
      const isHalf = String(leave.type).toUpperCase() === "HALF_DAY";
      const start = dateKey(leave.startDate);
      const end = dateKey(leave.endDate);
      return {
        id: `leave-${leave._id}`,
        rawId: leave._id,
        kind: isHalf ? "HALF_DAY" : "LEAVE",
        employeeId: leave.employeeId,
        employeeName:
          leave.employeeName || nameById.get(leave.employeeId) || leave.employeeId,
        dateKey: start,
        dates: start === end ? start : `${start} → ${end}`,
        detail: `${isHalf ? "Half day" : `${leave.type} leave`}${
          leave.paidDays != null
            ? ` · ${leave.paidDays} paid${
                leave.floatingPaidDays
                  ? ` (${leave.monthlyPaidDays ?? 0} monthly, ${leave.floatingPaidDays} floating)`
                  : ""
              }${leave.unpaidDays ? `, ${leave.unpaidDays} unpaid (over balance)` : ""}`
            : ""
        }`,
        reason: leave.reason,
        status: leave.status,
        decision: [leave.adminReason, leave.decidedByName && `— ${leave.decidedByName}`]
          .filter(Boolean)
          .join(" "),
        createdAt: leave.createdAt || "",
        history: leave.history,
      };
    });
    const changeRows: Row[] = changes.map((change) => ({
      id: `change-${change._id}`,
      rawId: change._id,
      kind: "ATTENDANCE",
      employeeId: change.employeeId,
      employeeName:
        change.employeeName || nameById.get(change.employeeId) || change.employeeId,
      dateKey: change.date,
      dates: change.date,
      detail: `Recorded ${change.before?.attendanceStatus || "—"} ${clock(change.before?.loginTime)}–${clock(change.before?.logoutTime)} → requested ${clock(change.requestedLoginTime)}–${clock(change.requestedLogoutTime)}`,
      reason: change.reason,
      status: change.status,
      decision: [change.decisionReason, change.decidedByName && `— ${change.decidedByName}`]
        .filter(Boolean)
        .join(" "),
      createdAt: change.createdAt || "",
      history: change.history,
    }));
    return [...leaveRows, ...changeRows];
  }, [changes, leaves, nameById]);

  // Jump to a deep-linked request once (not on every refresh).
  const [focusApplied, setFocusApplied] = useState(false);
  useEffect(() => {
    if (!focusId || focusApplied) return;
    const row = rows.find((r) => r.rawId === focusId);
    if (row) {
      setTab(row.kind);
      setStatusFilter(row.status);
      setFocusApplied(true);
    }
  }, [focusApplied, focusId, rows]);

  const counts = useMemo(() => {
    const pending = (kind: Tab) =>
      rows.filter((r) => r.kind === kind && r.status === "PENDING").length;
    return {
      LEAVE: pending("LEAVE"),
      HALF_DAY: pending("HALF_DAY"),
      ATTENDANCE: pending("ATTENDANCE"),
    };
  }, [rows]);

  // Rows of this tab matching search/dates, before the status section.
  const matching = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((r) => r.kind === tab)
      .filter((r) => !from || r.dateKey >= from)
      .filter((r) => !to || r.dateKey <= to)
      .filter(
        (r) =>
          !query ||
          [r.employeeName, r.employeeId, r.dates, r.reason, r.decision, r.detail]
            .join(" ")
            .toLowerCase()
            .includes(query),
      );
  }, [from, rows, search, tab, to]);
  const statusCounts = useMemo(() => {
    const counts: Record<Status | "ALL", number> = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      CANCELLED: 0,
      ALL: matching.length,
    };
    matching.forEach((r) => (counts[r.status] += 1));
    return counts;
  }, [matching]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((r) => r.kind === tab)
      .filter((r) => statusFilter === "ALL" || r.status === statusFilter)
      .filter((r) => !from || r.dateKey >= from)
      .filter((r) => !to || r.dateKey <= to)
      .filter(
        (r) =>
          !query ||
          [r.employeeName, r.employeeId, r.dates, r.reason, r.decision, r.detail]
            .join(" ")
            .toLowerCase()
            .includes(query),
      )
      .sort((a, b) =>
        a.status === "PENDING" && b.status !== "PENDING"
          ? -1
          : b.status === "PENDING" && a.status !== "PENDING"
            ? 1
            : b.createdAt.localeCompare(a.createdAt),
      );
  }, [from, rows, search, statusFilter, tab, to]);

  /** Why this row can't be changed by the current user (null = editable). */
  const lockReason = (row: Row) => {
    if (row.status === "CANCELLED") return "Cancelled";
    if (isSuperAdmin) return null;
    if (row.status !== "PENDING") return "Locked — already decided";
    if (row.kind !== "ATTENDANCE" && row.dateKey < todayKey()) {
      return "Locked — date has passed";
    }
    return null;
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const response = await api.get(
        `/api/attendance/requests/export?month=${exportMonth}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `requests_${exportMonth}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setNotice("Could not export that month.");
    } finally {
      setExporting(false);
    }
  };

  // Super Admin only: remove a leave request for good (the deletion itself is
  // kept in the admin audit log).
  const deleteForever = useMutation({
    mutationFn: async (row: Row) => {
      const typed = window.prompt(
        `Permanently delete ${row.employeeName}'s leave (${row.dates})? This cannot be undone.
Type DELETE to confirm.`,
        "",
      );
      if (typed !== "DELETE") throw new Error("__cancelled__");
      return api.delete(`/api/attendance/time-off/leaves/${row.rawId}?permanent=true`);
    },
    onSuccess: (_res, row) => {
      setNotice(`${row.employeeName}'s leave was permanently deleted.`);
      qc.invalidateQueries({ queryKey: ["requests-leaves"] });
    },
    onError: (error: any) => {
      if (error?.message === "__cancelled__") return;
      setNotice(error?.response?.data?.message || "Could not delete.");
    },
  });

  const decide = useMutation({
    mutationFn: async ({ row, status }: { row: Row; status: "APPROVED" | "REJECTED" }) => {
      const reason = window.prompt(
        status === "REJECTED"
          ? isSuperAdmin
            ? "Reason for rejecting (optional):"
            : "Reason for rejecting (required):"
          : "Note for the employee (optional):",
        "",
      );
      if (reason === null) throw new Error("__cancelled__");
      if (status === "REJECTED" && !reason.trim() && !isSuperAdmin) {
        throw new Error("A reason is required to reject.");
      }
      if (row.kind === "ATTENDANCE") {
        return api.patch(`/api/attendance/change-requests/${row.rawId}/decide`, {
          status,
          decisionReason: reason.trim(),
          sendEmail,
        });
      }
      return api.patch(`/api/attendance/time-off/leaves/${row.rawId}/process`, {
        status,
        adminReason: reason.trim() || undefined,
        sendEmail,
      });
    },
    onSuccess: (_res, vars) => {
      setNotice(
        `${vars.row.employeeName}'s request ${vars.status === "APPROVED" ? "approved" : "rejected"}.`,
      );
      qc.invalidateQueries({ queryKey: ["requests-leaves"] });
      qc.invalidateQueries({ queryKey: ["requests-attendance"] });
      // Approved correction: finish it on the Attendance page (status, times).
      if (vars.row.kind === "ATTENDANCE" && vars.status === "APPROVED") {
        window.location.href = `/dashboard/attendance?employeeId=${encodeURIComponent(
          vars.row.employeeId,
        )}&date=${vars.row.dateKey}&edit=1`;
      }
    },
    onError: (error: any) => {
      if (error?.message === "__cancelled__") return;
      setNotice(error?.response?.data?.message || error?.message || "Could not save.");
    },
  });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "LEAVE", label: "Leave", icon: <CalendarOff className="h-4 w-4" /> },
    { id: "HALF_DAY", label: "Half Day", icon: <CalendarRange className="h-4 w-4" /> },
    { id: "ATTENDANCE", label: "Attendance Correction", icon: <Clock3 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
          <Inbox className="h-4 w-4" /> Requests
        </div>
        <h1 className="mt-3 text-2xl font-black text-slate-950">Employee requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every leave, half-day and attendance-correction request from every
          employee, with its full history. Once a request is decided, or its
          date has passed, it is locked.
        </p>
        <div className="mt-4">
          <SendEmailToggle
            checked={sendEmail}
            onChange={setSendEmail}
            label="Email the employee when I approve or reject"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          <span className="text-sm font-bold text-slate-700">Monthly Excel</span>
          <input
            type="month"
            value={exportMonth}
            onChange={(e) => setExportMonth(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={exporting || !exportMonth}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
          <span className="text-xs text-slate-500">
            All employees&apos; leave, half-day and correction requests for the month, with status and who decided.
          </span>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black ${tab === item.id ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
          >
            {item.icon} {item.label}
            {counts[item.id] ? (
              <span className={`rounded-full px-2 text-xs ${tab === item.id ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>
                {counts[item.id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["PENDING", "Pending", "bg-amber-500"],
            ["APPROVED", "Approved", "bg-emerald-600"],
            ["REJECTED", "Rejected", "bg-rose-600"],
            ["CANCELLED", "Cancelled", "bg-slate-500"],
            ["ALL", "All", "bg-slate-900"],
          ] as const
        ).map(([value, label, activeColor]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black ${
              statusFilter === value ? `${activeColor} text-white` : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            {label}
            <span className={`rounded-full px-2 text-xs ${statusFilter === value ? "bg-white/20" : "bg-slate-100"}`}>
              {statusCounts[value]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, reason, date, decision…"
            className="w-full py-2 text-sm outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
          Leave date from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">
          {notice}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No requests match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Date(s)</th>
                <th className="px-4 py-3">Requested on</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row) => {
                const locked = lockReason(row);
                return (
                  <tr
                    key={row.id}
                    className={`align-top ${row.rawId === focusId ? "bg-indigo-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{row.employeeName}</div>
                      <div className="text-xs text-slate-500">{row.employeeId}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      {row.dates}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {row.createdAt ? (
                        <>
                          <div className="font-semibold">
                            {new Date(row.createdAt).toLocaleDateString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-xs">
                            {new Date(row.createdAt).toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{row.detail}</div>
                      <div className="text-slate-600">Reason: {row.reason}</div>
                      {row.decision ? (
                        <div className="mt-1 text-indigo-700">Decision: {row.decision}</div>
                      ) : null}
                      {row.history && row.history.length > 0 ? (
                        <details className="mt-1 text-xs text-slate-500">
                          <summary className="cursor-pointer">History ({row.history.length})</summary>
                          <ul className="mt-1 space-y-0.5">
                            {row.history.map((h, i) => (
                              <li key={i}>
                                {new Date(h.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — {h.action}
                                {h.byName ? ` by ${h.byName}` : ""}
                                {h.note ? `: ${h.note}` : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusStyles[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {locked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400" title={locked}>
                          <Lock className="h-3.5 w-3.5" /> {locked}
                        </span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {row.status !== "APPROVED" ? (
                            <button
                              type="button"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ row, status: "APPROVED" })}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> Approve
                            </button>
                          ) : null}
                          {row.status !== "REJECTED" ? (
                            <button
                              type="button"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ row, status: "REJECTED" })}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" /> Reject
                            </button>
                          ) : null}
                        </div>
                      )}
                      {isSuperAdmin && row.kind !== "ATTENDANCE" ? (
                        <button
                          type="button"
                          disabled={deleteForever.isPending}
                          onClick={() => deleteForever.mutate(row)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-rose-700 underline disabled:opacity-50"
                        >
                          Delete permanently
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
