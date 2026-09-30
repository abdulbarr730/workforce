"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
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
import { useMyAttendanceChanges } from "@/components/daily-flow/AttendanceChangesNotice";

type Tab = "leave" | "halfday" | "attendance" | "history" | "changes";
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

const TABS: Tab[] = ["leave", "halfday", "attendance", "history", "changes"];
type LeaveTypeOption = { code: string; name: string; isActive: boolean };
type Usage = {
  paid: number;
  monthly?: number;
  floating?: number;
  carriedIn?: number;
  unpaid: number;
  pending: number;
  left: number | null;
};
type BalanceType = {
  code: string;
  name: string;
  isPaid: boolean;
  isActive: boolean;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  month: Usage;
  year: Usage;
};
type Balance = {
  month: string;
  year: string;
  total: {
    monthlyLimit: number | null;
    yearlyLimit: number | null;
    floatingOnTop?: boolean;
    month: Usage;
    year: Usage;
  };
  types: BalanceType[];
};
type Preview = {
  days: number;
  paidDays: number;
  monthlyDays?: number;
  floatingDays?: number;
  unpaidDays: number;
};

/** Monthly paid leave left, including leave carried over from earlier months. */
const monthLeftText = (total: Balance["total"]) => {
  if (total.monthlyLimit === null) return `${total.month.paid} used`;
  const carried = total.month.carriedIn || 0;
  return `${total.month.left} left${carried ? ` (incl. ${carried} carried over)` : ""}`;
};

/** "2 of 4 left" / "3 used" when there is no limit. */
const leftText = (usage: Usage, limit: number | null) =>
  limit === null ? `${usage.paid} used` : `${usage.left} of ${limit} left`;

function PreviewNote({ preview, loading, error }: { preview?: Preview; loading: boolean; error?: string }) {
  if (loading) return <p className="text-xs text-slate-500">Checking your leave balance…</p>;
  if (error) return <p className="text-xs font-bold text-rose-600">{error}</p>;
  if (!preview) return null;
  return preview.unpaidDays > 0 ? (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
      This request is {preview.days} working day(s): {preview.paidDays} paid and{" "}
      {preview.unpaidDays} unpaid, because it goes over your leave balance. Unpaid days are not paid.
    </p>
  ) : (
    <p className="text-xs text-emerald-700">
      This request is {preview.days} working day(s), all paid
      {preview.floatingDays
        ? ` (${preview.monthlyDays ?? 0} from monthly leave, ${preview.floatingDays} from floating leave)`
        : ""}
      .
    </p>
  );
}

type FormKey = "leave" | "halfday" | "attendance";
type FieldErrors = Record<string, string>;

/** Red message under a field that needs fixing. */
function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-xs font-bold text-rose-600">{message}</span> : null;
}

/** Why the request could not be sent, shown right above the send button. */
function FormError({ message }: { message?: string }) {
  return message ? (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
      {message}
    </div>
  ) : null;
}

const Required = () => <span className="text-rose-600"> *</span>;

type BlockedRange = { _id: string; startDate: string; endDate: string; reason?: string };

const blockFor = (blocks: BlockedRange[], key: string) =>
  blocks.find((block) => block.startDate <= key && key <= block.endDate);
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const leaveColors: Record<Status, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-700 line-through",
  CANCELLED: "bg-slate-100 text-slate-500 line-through",
};

/** Month calendar: click a day to start a leave, click another to end it. */
function LeaveCalendar({
  leaves,
  blocks,
  today,
  start,
  end,
  onPick,
}: {
  leaves: LeaveRow[];
  blocks: BlockedRange[];
  today: string;
  start: string;
  end: string;
  onPick: (dateKey: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date(`${start || today}T12:00:00`);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(month.getFullYear(), month.getMonth(), i - first.getDay() + 1);
      return { key: localDateKey(date), day: date.getDate(), inMonth: date.getMonth() === month.getMonth() };
    });
  }, [month]);
  const leavesOn = (key: string) =>
    leaves.filter((leave) => {
      const from = toDateKey(leave.startDate);
      const to = toDateKey(leave.endDate) || from;
      return from <= key && key <= to;
    });

  return (
    <div className="rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="rounded-lg p-1.5 hover:bg-slate-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-black text-slate-800">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="rounded-lg p-1.5 hover:bg-slate-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase text-slate-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {days.map(({ key, day, inMonth }) => {
          const blocked = blockFor(blocks, key);
          const past = key < today || Boolean(blocked);
          const selected = Boolean(start) && key >= start && key <= (end || start);
          const onDay = leavesOn(key);
          return (
            <button
              key={key}
              type="button"
              disabled={past}
              onClick={() => onPick(key)}
              title={
                blocked
                  ? `Leave is blocked on this day${blocked.reason ? `: ${blocked.reason}` : ""}`
                  : past
                    ? "Leave can only be requested for today or later"
                    : "Pick this day"
              }
              className={`flex min-h-[64px] flex-col items-start gap-1 p-1.5 text-left text-xs ${
                selected ? "bg-indigo-100 ring-2 ring-inset ring-indigo-500" : "bg-white"
              } ${inMonth ? "" : "opacity-40"} ${past ? "cursor-not-allowed bg-slate-50 text-slate-400" : "hover:bg-indigo-50"}`}
            >
              <span className={`font-bold ${key === today ? "rounded-full bg-indigo-600 px-1.5 text-white" : ""}`}>
                {day}
              </span>
              {blocked ? (
                <span className="w-full truncate rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700">
                  Blocked
                </span>
              ) : null}
              {onDay.slice(0, 2).map((leave) => (
                <span
                  key={leave._id}
                  className={`w-full truncate rounded px-1 text-[10px] font-bold ${leaveColors[leave.status]}`}
                >
                  {String(leave.type).toUpperCase() === "HALF_DAY" ? "Half day" : leave.type} · {leave.status.toLowerCase()}
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <p className="px-3 py-2 text-xs text-slate-500">
        Click a day to start the leave, then click the last day. Click again to start over.
      </p>
    </div>
  );
}

export default function RequestsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const today = localDateKey();

  const [tab, setTab] = useState<Tab>("leave");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Leave / half-day form
  const [leaveType, setLeaveType] = useState("");
  const [leaveStart, setLeaveStart] = useState(today);
  const [leaveEnd, setLeaveEnd] = useState(today);
  const [leaveReason, setLeaveReason] = useState("");
  const [halfDate, setHalfDate] = useState(today);
  const [halfReason, setHalfReason] = useState("");
  const [leaveView, setLeaveView] = useState<"list" | "calendar">("list");
  const [pickingEnd, setPickingEnd] = useState(false);
  const pickLeaveDay = (key: string) => {
    if (pickingEnd && key >= leaveStart) {
      setLeaveEnd(key);
      setPickingEnd(false);
      return;
    }
    setLeaveStart(key);
    setLeaveEnd(key);
    setPickingEnd(true);
  };

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

  // Checked once the employee presses Send; messages update as they type.
  const [attempted, setAttempted] = useState<Record<FormKey, boolean>>({
    leave: false,
    halfday: false,
    attendance: false,
  });
  const [serverError, setServerError] = useState<Record<FormKey, string>>({
    leave: "",
    halfday: "",
    attendance: "",
  });

  const say = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 8000);
  };

  // Leave types, balances and blocked days (set by admins).
  const typesQuery = useQuery<LeaveTypeOption[]>({
    queryKey: ["leave-policy-types"],
    queryFn: () =>
      api.get("/api/attendance/time-off/leave-policy").then((r) => r.data.data?.types || []),
    enabled: !!user,
  });
  // Only the types admins have set up (and switched on) are offered.
  const leaveTypes = (typesQuery.data || []).filter(
    (type) => type.isActive && type.code !== "HALF_DAY",
  );
  useEffect(() => {
    if (!leaveType && leaveTypes.length) setLeaveType(leaveTypes[0].code);
  }, [leaveType, leaveTypes]);
  const balanceQuery = useQuery<Balance>({
    queryKey: ["my-leave-balance", user?.employeeId],
    queryFn: () =>
      api
        .get(`/api/attendance/time-off/leave-balance?month=${today.slice(0, 7)}`)
        .then((r) => r.data.data),
    enabled: !!user,
  });
  const previewFor = (type: string, start: string, end: string) =>
    api
      .get(
        `/api/attendance/time-off/leave-preview?type=${encodeURIComponent(type)}&startDate=${start}&endDate=${end}`,
      )
      .then((r) => r.data.data as Preview);
  const leavePreview = useQuery({
    queryKey: ["leave-preview", leaveType, leaveStart, leaveEnd],
    queryFn: () => previewFor(leaveType, leaveStart, leaveEnd),
    enabled: !!user && !!leaveType && !!leaveStart && leaveStart >= today,
    retry: false,
  });
  const halfPreview = useQuery({
    queryKey: ["leave-preview", "HALF_DAY", halfDate],
    queryFn: () => previewFor("HALF_DAY", halfDate, halfDate),
    enabled: !!user && !!halfDate && halfDate >= today,
    retry: false,
  });

  const blocksQuery = useQuery<BlockedRange[]>({
    queryKey: ["my-leave-blocks", user?.employeeId],
    queryFn: () => api.get("/api/attendance/time-off/leave-blocks").then((r) => r.data.data),
    enabled: !!user,
  });
  const blocks = blocksQuery.data || [];

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
    void qc.invalidateQueries({ queryKey: ["my-leave-balance"] });
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

  const leaveErrors: FieldErrors = {};
  if (!leaveType) leaveErrors.type = "Leave type is required.";
  if (!leaveStart) leaveErrors.start = "Start date is required.";
  else if (leaveStart < today) leaveErrors.start = "Start date can't be in the past.";
  if (!leaveEnd) leaveErrors.end = "End date is required.";
  else if (leaveStart && leaveEnd < leaveStart) leaveErrors.end = "End date must be on or after the start date.";
  if (!leaveReason.trim()) leaveErrors.reason = "Reason is required.";

  const halfErrors: FieldErrors = {};
  if (!halfDate) halfErrors.date = "Date is required.";
  else if (halfDate < today) halfErrors.date = "Date can't be in the past.";
  if (!halfReason.trim()) halfErrors.reason = "Reason is required.";

  const fixErrors: FieldErrors = {};
  if (!fixDate) fixErrors.date = "Date is required.";
  else if (fixDate > today) fixErrors.date = "You can only correct today or an earlier day.";
  else if (fixDate < shiftDate(today, -MAX_DAYS_BACK))
    fixErrors.date = `Only the last ${MAX_DAYS_BACK} days can be corrected.`;
  if (!fixLogin) fixErrors.login = "Correct login time is required.";
  if (fixLogout && fixLogin && fixLogout <= fixLogin)
    fixErrors.logout = "Logout time must be after the login time.";
  if (!fixReason.trim()) fixErrors.reason = "Please say what is wrong.";
  else if (fixReason.trim().length < 5) fixErrors.reason = "Please explain a bit more (at least 5 characters).";

  const shown = (form: FormKey, errors: FieldErrors) => (attempted[form] ? errors : {});
  const leaveShown = shown("leave", leaveErrors);
  const halfShown = shown("halfday", halfErrors);
  const fixShown = shown("attendance", fixErrors);

  /** Marks the form as tried; false = something required is missing. */
  const readyToSend = (form: FormKey, errors: FieldErrors) => {
    setAttempted((a) => ({ ...a, [form]: true }));
    setServerError((e) => ({ ...e, [form]: "" }));
    if (Object.keys(errors).length) {
      setServerError((e) => ({
        ...e,
        [form]: "Please fill in the fields marked in red.",
      }));
      return false;
    }
    return true;
  };

  const submitLeave = async (halfDay: boolean) => {
    const form: FormKey = halfDay ? "halfday" : "leave";
    if (!readyToSend(form, halfDay ? halfErrors : leaveErrors)) return;
    setBusy(true);
    try {
      const response = await api.post(
        "/api/attendance/time-off/leaves/request",
        halfDay
          ? { type: "HALF_DAY", startDate: halfDate, endDate: halfDate, reason: halfReason.trim() }
          : { type: leaveType, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason.trim() },
      );
      const unpaid = Number(response.data?.data?.unpaidDays || 0);
      say(
        true,
        `${halfDay ? "Half-day request sent." : "Leave request sent."}${
          unpaid > 0 ? ` ${unpaid} day(s) are over your balance and will be unpaid.` : ""
        } You'll see the decision in History.`,
      );
      void qc.invalidateQueries({ queryKey: ["leave-preview"] });
      if (halfDay) setHalfReason("");
      else setLeaveReason("");
      setAttempted((a) => ({ ...a, [form]: false }));
      loadHistory();
    } catch (error) {
      const message = errorText(error, "Could not send the request.");
      setServerError((e) => ({ ...e, [form]: message }));
      say(false, message);
    } finally {
      setBusy(false);
    }
  };

  const submitCorrection = async () => {
    if (!readyToSend("attendance", fixErrors)) return;
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
      setAttempted((a) => ({ ...a, attendance: false }));
      loadHistory();
    } catch (error) {
      const message = errorText(error, "Could not send the correction.");
      setServerError((e) => ({ ...e, attendance: message }));
      say(false, message);
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
        title: isHalf
          ? "Half day"
          : (typesQuery.data || []).find((t) => t.code === String(leave.type).toUpperCase())?.name ||
            `${leave.type} leave`,
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
  }, [changes, kindFilter, leaves, search, statusFilter, today, typesQuery.data]);

  const pendingCount =
    leaves.filter((l) => l.status === "PENDING").length +
    changes.filter((c) => c.status === "PENDING").length;

  // Every change made to my attendance (requested by me or by an admin).
  const changesQuery = useMyAttendanceChanges();

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "leave", label: "Leave", icon: <CalendarOff className="h-4 w-4" /> },
    { id: "halfday", label: "Half Day", icon: <CalendarRange className="h-4 w-4" /> },
    { id: "attendance", label: "Attendance Correction", icon: <Clock3 className="h-4 w-4" /> },
    {
      id: "history",
      label: `History${pendingCount ? ` (${pendingCount} pending)` : ""}`,
      icon: <History className="h-4 w-4" />,
    },
    {
      id: "changes",
      label: `Attendance changes${changesQuery.data?.unseen ? ` (${changesQuery.data.unseen} new)` : ""}`,
      icon: <Clock3 className="h-4 w-4" />,
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black text-slate-900">Request leave</h2>
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5">
              {([
                ["list", "List", <List key="l" className="h-4 w-4" />],
                ["calendar", "Calendar", <CalendarDays key="c" className="h-4 w-4" />],
              ] as const).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLeaveView(id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold ${leaveView === id ? "bg-indigo-600 text-white" : "text-slate-600"}`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-slate-500">Leave can be requested for today or later.</p>
          {balanceQuery.data ? (
            <div className="grid gap-2">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <div className="text-xs font-bold uppercase text-indigo-700">Paid leave remaining</div>
                <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-800">
                  <span>
                    Monthly leave: <b>{monthLeftText(balanceQuery.data.total)}</b>
                  </span>
                  <span>
                    {balanceQuery.data.total.floatingOnTop ? "Floating leave this year" : "This year"}:{" "}
                    <b>
                      {balanceQuery.data.total.floatingOnTop && balanceQuery.data.total.yearlyLimit !== null
                        ? `${balanceQuery.data.total.year.left} of ${balanceQuery.data.total.yearlyLimit} left`
                        : leftText(balanceQuery.data.total.year, balanceQuery.data.total.yearlyLimit)}
                    </b>
                  </span>
                  {balanceQuery.data.total.year.unpaid ? (
                    <span className="text-rose-600">
                      {balanceQuery.data.total.year.unpaid} unpaid day(s) this year
                    </span>
                  ) : null}
                  {balanceQuery.data.total.year.pending ? (
                    <span className="text-amber-600">
                      {balanceQuery.data.total.year.pending} day(s) waiting for approval
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {balanceQuery.data.types
                  .filter((type) => type.isActive)
                  .map((type) => (
                    <div key={type.code} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">
                      <div className="font-extrabold text-slate-800">{type.name}</div>
                      {type.isPaid ? (
                        <div className="text-slate-600">
                          Month: <b>{leftText(type.month, type.monthlyLimit)}</b> · Year:{" "}
                          <b>{leftText(type.year, type.yearlyLimit)}</b>
                        </div>
                      ) : (
                        <div className="text-slate-600">Unpaid · {type.year.unpaid} day(s) this year</div>
                      )}
                      {type.isPaid && type.year.unpaid ? (
                        <div className="text-rose-600">{type.year.unpaid} unpaid (over balance)</div>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
          {blocks.length ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <b>Leave can&apos;t be requested on:</b>{" "}
              {blocks
                .map(
                  (block) =>
                    `${block.startDate === block.endDate ? block.startDate : `${block.startDate} → ${block.endDate}`}${block.reason ? ` (${block.reason})` : ""}`,
                )
                .join(", ")}
            </div>
          ) : null}
          {leaveView === "calendar" ? (
            <LeaveCalendar
              blocks={blocks}
              leaves={leaves}
              today={today}
              start={leaveStart}
              end={leaveEnd}
              onPick={pickLeaveDay}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              <span>Type<Required /></span>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={`${inputClass} ${leaveShown.type ? "border-rose-400" : ""}`}>
                {leaveTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.name}
                  </option>
                ))}
              </select>
              <FieldError message={leaveShown.type} />
            </label>
            <label className={labelClass}>
              <span>From<Required /></span>
              <input
                type="date"
                min={today}
                value={leaveStart}
                onChange={(e) => {
                  setLeaveStart(e.target.value);
                  if (leaveEnd < e.target.value) setLeaveEnd(e.target.value);
                }}
                className={`${inputClass} ${leaveShown.start ? "border-rose-400" : ""}`}
              />
              <FieldError message={leaveShown.start} />
            </label>
            <label className={labelClass}>
              <span>To<Required /></span>
              <input
                type="date"
                min={leaveStart || today}
                value={leaveEnd}
                onChange={(e) => setLeaveEnd(e.target.value)}
                className={`${inputClass} ${leaveShown.end ? "border-rose-400" : ""}`}
              />
              <FieldError message={leaveShown.end} />
            </label>
          </div>
          <label className={labelClass}>
            <span>Reason<Required /></span>
            <textarea
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              rows={3}
              placeholder="Why do you need this leave?"
              className={`${inputClass} ${leaveShown.reason ? "border-rose-400" : ""}`}
            />
            <FieldError message={leaveShown.reason} />
          </label>
          <PreviewNote
            preview={leavePreview.data}
            loading={leavePreview.isFetching}
            error={leavePreview.error ? errorText(leavePreview.error, "") : undefined}
          />
          <FormError message={serverError.leave} />
          <button
            type="button"
            onClick={() => void submitLeave(false)}
            disabled={busy}
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
              <span>Date<Required /></span>
              <input
                type="date"
                min={today}
                value={halfDate}
                onChange={(e) => setHalfDate(e.target.value)}
                className={`${inputClass} ${halfShown.date ? "border-rose-400" : ""}`}
              />
              <FieldError message={halfShown.date} />
            </label>
          </div>
          <label className={labelClass}>
            <span>Reason<Required /></span>
            <textarea
              value={halfReason}
              onChange={(e) => setHalfReason(e.target.value)}
              rows={3}
              placeholder="Why do you need a half day?"
              className={`${inputClass} ${halfShown.reason ? "border-rose-400" : ""}`}
            />
            <FieldError message={halfShown.reason} />
          </label>
          <PreviewNote
            preview={halfPreview.data}
            loading={halfPreview.isFetching}
            error={halfPreview.error ? errorText(halfPreview.error, "") : undefined}
          />
          <FormError message={serverError.halfday} />
          <button
            type="button"
            onClick={() => void submitLeave(true)}
            disabled={busy}
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
              <span>Date<Required /></span>
              <input
                type="date"
                max={today}
                min={shiftDate(today, -MAX_DAYS_BACK)}
                value={fixDate}
                onChange={(e) => setFixDate(e.target.value)}
                className={`${inputClass} ${fixShown.date ? "border-rose-400" : ""}`}
              />
              <FieldError message={fixShown.date} />
            </label>
            <label className={labelClass}>
              <span>Correct login time<Required /></span>
              <input
                type="time"
                value={fixLogin}
                onChange={(e) => setFixLogin(e.target.value)}
                className={`${inputClass} ${fixShown.login ? "border-rose-400" : ""}`}
              />
              <FieldError message={fixShown.login} />
            </label>
            <label className={labelClass}>
              Correct logout time (optional)
              <input
                type="time"
                value={fixLogout}
                onChange={(e) => setFixLogout(e.target.value)}
                className={`${inputClass} ${fixShown.logout ? "border-rose-400" : ""}`}
              />
              <FieldError message={fixShown.logout} />
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
            <span>What is wrong?<Required /></span>
            <textarea
              value={fixReason}
              onChange={(e) => setFixReason(e.target.value)}
              rows={3}
              placeholder="e.g. I started at 9:40 but the agent only opened at 11:10"
              className={`${inputClass} ${fixShown.reason ? "border-rose-400" : ""}`}
            />
            <FieldError message={fixShown.reason} />
          </label>
          <FormError message={serverError.attendance} />
          <button
            type="button"
            onClick={() => void submitCorrection()}
            disabled={busy}
            className={primaryButton}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Send correction request
          </button>
        </section>
      ) : null}

      {tab === "changes" ? (
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-900">Changes to my attendance</h2>
          <p className="text-sm text-slate-500">
            Every change made to your attendance. Changes you did not request are marked; if
            one looks wrong, contact your admin.
          </p>
          {changesQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(changesQuery.data?.changes || []).length ? (
            <p className="text-sm text-slate-500">No changes have been made to your attendance.</p>
          ) : (
            <div className="grid gap-2.5">
              {(changesQuery.data?.changes || []).map((change) => (
                <div
                  key={change.id}
                  className={`grid gap-1 rounded-xl border p-3.5 ${change.source === "ADMIN" ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>
                      {new Date(`${change.date}T12:00:00`).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </b>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-black ${change.source === "ADMIN" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                    >
                      {change.source === "ADMIN" ? "Changed by admin — not requested by you" : "Your request, approved"}
                    </span>
                  </div>
                  {change.changes.map((line) => (
                    <div key={line} className="text-sm text-slate-700">{line}</div>
                  ))}
                  <div className="text-xs text-slate-500">
                    {change.byName} ·{" "}
                    {new Date(change.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    {change.reason ? ` · Reason: ${change.reason}` : ""}
                  </div>
                  {change.source === "ADMIN" ? (
                    <div className="text-xs font-semibold text-amber-800">
                      Didn&apos;t ask for this? Contact your admin.
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
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
