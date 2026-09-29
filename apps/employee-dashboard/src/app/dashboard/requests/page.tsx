"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarOff,
  CalendarRange,
  CheckCircle2,
  Clock3,
  History,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type Tab = "leave" | "halfday" | "attendance" | "history";
type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

type LeaveRow = {
  _id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: Status;
  adminReason?: string | null;
  createdAt?: string;
};

type ChangeRow = {
  _id: string;
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
};

type HistoryItem = {
  id: string;
  kind: "LEAVE" | "HALF_DAY" | "ATTENDANCE";
  title: string;
  dates: string;
  detail: string;
  reason: string;
  status: Status;
  decision: string;
  createdAt: string;
  cancel?: () => Promise<unknown>;
};

const TABS: Tab[] = ["leave", "halfday", "attendance", "history"];
const LEAVE_TYPES = ["CASUAL", "SICK", "ANNUAL", "EMERGENCY", "UNPAID", "PAID LEAVE"];
const MAX_DAYS_BACK = 45;

const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const toDateKey = (value?: string | null) => String(value || "").slice(0, 10);

const shiftDate = (dateKey: string, days: number) => {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
};

const clock = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

const toTimeInput = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const errorText = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback;

const badgeColors: Record<Status, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500";
const labelClass = "grid gap-1.5 text-sm font-bold text-slate-700";
const primaryButton =
  "inline-flex w-fit items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50";
const ghostButton =
  "inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-700";

export default function RequestsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const today = localDateKey();

  const [tab, setTab] = useState<Tab>("leave");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Leave / half-day form
  const [leaveType, setLeaveType] = useState("CASUAL");
  const [leaveStart, setLeaveStart] = useState(today);
  const [leaveEnd, setLeaveEnd] = useState(today);
  const [leaveReason, setLeaveReason] = useState("");
  const [halfDate, setHalfDate] = useState(today);
  const [halfReason, setHalfReason] = useState("");

  // Attendance correction form
  const [fixDate, setFixDate] = useState(today);
  const [fixLogin, setFixLogin] = useState("");
  const [fixLogout, setFixLogout] = useState("");
  const [fixReason, setFixReason] = useState("");

  // History filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
  const [kindFilter, setKindFilter] = useState<HistoryItem["kind"] | "ALL">("ALL");

  // ?tab=attendance&date=YYYY-MM-DD (links from Attendance and the agent).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab") as Tab | null;
    const requestedDate = params.get("date");
    if (requestedTab && TABS.includes(requestedTab)) setTab(requestedTab);
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      setFixDate(requestedDate);
    }
  }, []);

  const say = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 8000);
  };

  const historyQuery = useQuery({
    queryKey: ["my-requests", user?.employeeId],
    queryFn: async () => {
      const [leaveRes, changeRes] = await Promise.all([
        api.get("/api/attendance/time-off/leaves/mine"),
        api.get("/api/attendance/change-requests/mine"),
      ]);
      return {
        leaves: (leaveRes.data?.data || []) as LeaveRow[],
        changes: (changeRes.data?.data || []) as ChangeRow[],
      };
    },
    enabled: !!user,
  });
  const leaves = historyQuery.data?.leaves || [];
  const changes = historyQuery.data?.changes || [];
  const loadHistory = () => {
    void qc.invalidateQueries({ queryKey: ["my-requests"] });
    // Leave pages share these records.
    void qc.invalidateQueries({ queryKey: ["my-leaves"] });
  };

  // What is currently recorded for the chosen correction date.
  const currentQuery = useQuery({
    queryKey: ["my-attendance-day", user?.employeeId, fixDate],
    queryFn: () =>
      api
        .get(`/api/attendance/records?date=${fixDate}`)
        .then((res) => ((res.data?.data || [])[0] || null) as any),
    enabled: !!user && !!fixDate,
  });
  const current = currentQuery.data ?? null;

  // Pre-fill the recorded times once per chosen date (not on background
  // refetches, which would overwrite what the employee typed).
  const [prefilledDate, setPrefilledDate] = useState("");
  useEffect(() => {
    if (!currentQuery.isSuccess || prefilledDate === fixDate) return;
    setPrefilledDate(fixDate);
    setFixLogin(toTimeInput(current?.loginTime));
    setFixLogout(toTimeInput(current?.logoutTime));
  }, [current, currentQuery.isSuccess, fixDate, prefilledDate]);

  const submitLeave = async (halfDay: boolean) => {
    setBusy(true);
    try {
      await api.post(
        "/api/attendance/time-off/leaves/request",
        halfDay
          ? { type: "HALF_DAY", startDate: halfDate, endDate: halfDate, reason: halfReason.trim() }
          : { type: leaveType, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason.trim() },
      );
      say(
        true,
        halfDay
          ? "Half-day request sent. You'll see the decision in History."
          : "Leave request sent. You'll see the decision in History.",
      );
      if (halfDay) setHalfReason("");
      else setLeaveReason("");
      loadHistory();
    } catch (error) {
      say(false, errorText(error, "Could not send the request."));
    } finally {
      setBusy(false);
    }
  };

  const submitCorrection = async () => {
    setBusy(true);
    try {
      await api.post("/api/attendance/change-requests", {
        date: fixDate,
        loginTime: fixLogin,
        logoutTime: fixLogout || undefined,
        reason: fixReason.trim(),
      });
      say(true, "Correction request sent to your admin.");
      setFixReason("");
      loadHistory();
    } catch (error) {
      say(false, errorText(error, "Could not send the correction."));
    } finally {
      setBusy(false);
    }
  };

  const historyItems: HistoryItem[] = useMemo(() => {
    const leaveItems: HistoryItem[] = leaves.map((leave) => {
      const isHalf = String(leave.type).toUpperCase() === "HALF_DAY";
      const start = toDateKey(leave.startDate);
      const end = toDateKey(leave.endDate);
      return {
        id: `leave-${leave._id}`,
        kind: isHalf ? "HALF_DAY" : "LEAVE",
        title: isHalf ? "Half day" : `${leave.type} leave`,
        dates: start === end ? start : `${start} → ${end}`,
        detail: "",
        reason: leave.reason,
        status: leave.status,
        decision: leave.adminReason || "",
        createdAt: leave.createdAt || "",
        cancel:
          leave.status === "PENDING" && start >= today
            ? () => api.delete(`/api/attendance/time-off/leaves/${leave._id}`)
            : undefined,
      };
    });
    const changeItems: HistoryItem[] = changes.map((change) => ({
      id: `change-${change._id}`,
      kind: "ATTENDANCE",
      title: "Attendance correction",
      dates: change.date,
      detail: `Recorded ${clock(change.before?.loginTime)} – ${clock(change.before?.logoutTime)} → requested ${clock(change.requestedLoginTime)} – ${clock(change.requestedLogoutTime)}`,
      reason: change.reason,
      status: change.status,
      decision: [change.decisionReason, change.decidedByName && `by ${change.decidedByName}`]
        .filter(Boolean)
        .join(" "),
      createdAt: change.createdAt || "",
      cancel:
        change.status === "PENDING"
          ? () => api.patch(`/api/attendance/change-requests/${change._id}/cancel`, {})
          : undefined,
    }));
    const query = search.trim().toLowerCase();
    return [...leaveItems, ...changeItems]
      .filter((item) => statusFilter === "ALL" || item.status === statusFilter)
      .filter((item) => kindFilter === "ALL" || item.kind === kindFilter)
      .filter(
        (item) =>
          !query ||
          [item.title, item.dates, item.reason, item.decision, item.detail]
            .join(" ")
            .toLowerCase()
            .includes(query),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [changes, kindFilter, leaves, search, statusFilter, today]);

  const pendingCount =
    leaves.filter((l) => l.status === "PENDING").length +
    changes.filter((c) => c.status === "PENDING").length;

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "leave", label: "Leave", icon: <CalendarOff className="h-4 w-4" /> },
    { id: "halfday", label: "Half Day", icon: <CalendarRange className="h-4 w-4" /> },
    { id: "attendance", label: "Attendance Correction", icon: <Clock3 className="h-4 w-4" /> },
    {
      id: "history",
      label: `History${pendingCount ? ` (${pendingCount} pending)` : ""}`,
      icon: <History className="h-4 w-4" />,
    },
  ];

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <section className="flex items-start justify-between gap-4 rounded-3xl bg-gradient-to-br from-teal-700 to-indigo-600 p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
            <Inbox className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Requests</h1>
            <p className="mt-1 text-sm opacity-80">
              Ask for leave or a half day, or report a wrong login/logout.
              Every request and decision is saved in your history.
            </p>
          </div>
        </div>
        <button type="button" onClick={loadHistory} className={ghostButton}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </section>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-extrabold ${tab === item.id ? "bg-indigo-600 text-white" : "bg-white text-slate-700"}`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {notice ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}
        >
          {notice.text}
        </div>
      ) : null}

      {tab === "leave" ? (
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-900">Request leave</h2>
          <p className="text-sm text-slate-500">Leave can be requested for today or later.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Type
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={inputClass}>
                {LEAVE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              From
              <input
                type="date"
                min={today}
                value={leaveStart}
                onChange={(e) => {
                  setLeaveStart(e.target.value);
                  if (leaveEnd < e.target.value) setLeaveEnd(e.target.value);
                }}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              To
              <input
                type="date"
                min={leaveStart || today}
                value={leaveEnd}
                onChange={(e) => setLeaveEnd(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <label className={labelClass}>
            Reason
            <textarea
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              rows={3}
              placeholder="Why do you need this leave?"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={() => void submitLeave(false)}
            disabled={busy || !leaveReason.trim() || leaveStart < today}
            className={primaryButton}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Send leave request
          </button>
        </section>
      ) : null}

      {tab === "halfday" ? (
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-900">Request a half day</h2>
          <p className="text-sm text-slate-500">
            For today or a future date. Working less than your half-day limit on
            an approved half day is not marked absent.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Date
              <input
                type="date"
                min={today}
                value={halfDate}
                onChange={(e) => setHalfDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <label className={labelClass}>
            Reason
            <textarea
              value={halfReason}
              onChange={(e) => setHalfReason(e.target.value)}
              rows={3}
              placeholder="Why do you need a half day?"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={() => void submitLeave(true)}
            disabled={busy || !halfReason.trim() || halfDate < today}
            className={primaryButton}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Send half-day request
          </button>
        </section>
      ) : null}

      {tab === "attendance" ? (
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-900">Correct my attendance</h2>
          <p className="text-sm text-slate-500">
            Pick the day that is wrong (today or up to {MAX_DAYS_BACK} days back),
            enter the correct times and why. Your admin will review it.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Date
              <input
                type="date"
                max={today}
                min={shiftDate(today, -MAX_DAYS_BACK)}
                value={fixDate}
                onChange={(e) => setFixDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Correct login time
              <input type="time" value={fixLogin} onChange={(e) => setFixLogin(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Correct logout time (optional)
              <input type="time" value={fixLogout} onChange={(e) => setFixLogout(e.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            {currentQuery.isLoading ? (
              "Loading what is recorded…"
            ) : current ? (
              <>
                Recorded for {fixDate}: <b>{current.attendanceStatus}</b>, login{" "}
                <b>{clock(current.loginTime)}</b>, logout <b>{clock(current.logoutTime)}</b>
              </>
            ) : (
              <>Nothing is recorded for {fixDate}.</>
            )}
          </div>
          <label className={labelClass}>
            What is wrong?
            <textarea
              value={fixReason}
              onChange={(e) => setFixReason(e.target.value)}
              rows={3}
              placeholder="e.g. I started at 9:40 but the agent only opened at 11:10"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={() => void submitCorrection()}
            disabled={
              busy ||
              !fixLogin ||
              fixReason.trim().length < 5 ||
              fixDate > today ||
              Boolean(fixLogout && fixLogout <= fixLogin)
            }
            className={primaryButton}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Send correction request
          </button>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap gap-2">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-300 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reason, date, decision…"
                className="w-full py-2 text-sm outline-none"
              />
            </div>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as any)} className={`${inputClass} w-auto`}>
              <option value="ALL">All types</option>
              <option value="LEAVE">Leave</option>
              <option value="HALF_DAY">Half day</option>
              <option value="ATTENDANCE">Attendance correction</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={`${inputClass} w-auto`}>
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {historyQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : historyQuery.isError ? (
            <p className="text-sm text-rose-600">{errorText(historyQuery.error, "Could not load your requests.")}</p>
          ) : historyItems.length === 0 ? (
            <p className="text-sm text-slate-500">No requests match.</p>
          ) : (
            <div className="grid gap-2.5">
              {historyItems.map((item) => (
                <div key={item.id} className="grid gap-1.5 rounded-xl border border-slate-200 p-3.5">
                  <div className="flex justify-between gap-2">
                    <div>
                      <b>{item.title}</b> <span className="text-slate-500">· {item.dates}</span>
                    </div>
                    <span className={`h-fit rounded-full px-2.5 py-0.5 text-xs font-black ${badgeColors[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  {item.detail ? <div className="text-sm text-slate-600">{item.detail}</div> : null}
                  <div className="text-sm text-slate-700">Reason: {item.reason}</div>
                  {item.decision ? <div className="text-sm text-indigo-600">Admin: {item.decision}</div> : null}
                  {item.cancel ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await item.cancel?.();
                          say(true, "Request cancelled.");
                          loadHistory();
                        } catch (error) {
                          say(false, errorText(error, "Could not cancel."));
                        }
                      }}
                      className={`${ghostButton} text-rose-700`}
                    >
                      <XCircle className="h-4 w-4" /> Cancel request
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
