import { API_BASE_URL } from "../config/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowLeft,
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
import { useAuth } from "../auth/AuthContext";
import { getLocalDateKey } from "../../shared/daily-flow";

const API =
  API_BASE_URL;

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

const LEAVE_TYPES = [
  "CASUAL",
  "SICK",
  "ANNUAL",
  "EMERGENCY",
  "UNPAID",
  "PAID LEAVE",
];
const MAX_DAYS_BACK = 45;

const toDateKey = (value?: string | null) =>
  String(value || "").slice(0, 10);

const shiftDate = (dateKey: string, days: number) => {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return getLocalDateKey(d);
};

const clock = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const toTimeInput = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const errorText = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback;

/** Reads ?tab= & ?date= from the hash route (#/requests?tab=attendance&date=...). */
const readHashParams = () => {
  const query = window.location.hash.split("?")[1] || "";
  const params = new URLSearchParams(query);
  return {
    tab: params.get("tab") as Tab | null,
    date: params.get("date"),
  };
};

export function RequestsPage() {
  const { token } = useAuth();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );
  const today = getLocalDateKey();
  const initial = readHashParams();

  const [tab, setTab] = useState<Tab>(initial.tab || "leave");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  // Leave / half-day form
  const [leaveType, setLeaveType] = useState("CASUAL");
  const [leaveStart, setLeaveStart] = useState(today);
  const [leaveEnd, setLeaveEnd] = useState(today);
  const [leaveReason, setLeaveReason] = useState("");
  const [halfDate, setHalfDate] = useState(today);
  const [halfReason, setHalfReason] = useState("");

  // Attendance correction form
  const [fixDate, setFixDate] = useState(initial.date || today);
  const [fixLogin, setFixLogin] = useState("");
  const [fixLogout, setFixLogout] = useState("");
  const [fixReason, setFixReason] = useState("");
  const [current, setCurrent] = useState<any>(null);
  const [currentLoading, setCurrentLoading] = useState(false);

  // History
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
  const [kindFilter, setKindFilter] = useState<HistoryItem["kind"] | "ALL">(
    "ALL",
  );

  const say = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 8000);
  };

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const [leaveRes, changeRes] = await Promise.all([
        axios.get(`${API}/attendance/time-off/leaves/mine`, { headers }),
        axios.get(`${API}/attendance/change-requests/mine`, { headers }),
      ]);
      setLeaves(leaveRes.data?.data || []);
      setChanges(changeRes.data?.data || []);
    } catch (error) {
      say(false, errorText(error, "Could not load your requests."));
    } finally {
      setHistoryLoading(false);
    }
  }, [headers, token]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Current attendance for the chosen correction date.
  useEffect(() => {
    if (!token || !fixDate) return;
    let cancelled = false;
    setCurrentLoading(true);
    axios
      .get(`${API}/attendance/records?date=${fixDate}`, { headers })
      .then((res) => {
        if (cancelled) return;
        const record = (res.data?.data || [])[0] || null;
        setCurrent(record);
        setFixLogin(toTimeInput(record?.loginTime));
        setFixLogout(toTimeInput(record?.logoutTime));
      })
      .catch(() => !cancelled && setCurrent(null))
      .finally(() => !cancelled && setCurrentLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fixDate, headers, token]);

  const submitLeave = async (halfDay: boolean) => {
    setBusy(true);
    try {
      await axios.post(
        `${API}/attendance/time-off/leaves/request`,
        halfDay
          ? {
              type: "HALF_DAY",
              startDate: halfDate,
              endDate: halfDate,
              reason: halfReason.trim(),
            }
          : {
              type: leaveType,
              startDate: leaveStart,
              endDate: leaveEnd,
              reason: leaveReason.trim(),
            },
        { headers },
      );
      say(
        true,
        halfDay
          ? "Half-day request sent. You'll see the decision in History."
          : "Leave request sent. You'll see the decision in History.",
      );
      if (halfDay) setHalfReason("");
      else setLeaveReason("");
      void loadHistory();
    } catch (error) {
      say(false, errorText(error, "Could not send the request."));
    } finally {
      setBusy(false);
    }
  };

  const submitCorrection = async () => {
    setBusy(true);
    try {
      await axios.post(
        `${API}/attendance/change-requests`,
        {
          date: fixDate,
          loginTime: fixLogin,
          logoutTime: fixLogout || undefined,
          reason: fixReason.trim(),
        },
        { headers },
      );
      say(true, "Correction request sent to your admin.");
      setFixReason("");
      void loadHistory();
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
            ? () =>
                axios.delete(`${API}/attendance/time-off/leaves/${leave._id}`, {
                  headers,
                })
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
          ? () =>
              axios.patch(
                `${API}/attendance/change-requests/${change._id}/cancel`,
                {},
                { headers },
              )
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
  }, [changes, headers, kindFilter, leaves, search, statusFilter, today]);

  const pendingCount =
    leaves.filter((l) => l.status === "PENDING").length +
    changes.filter((c) => c.status === "PENDING").length;

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "leave", label: "Leave", icon: <CalendarOff size={16} /> },
    { id: "halfday", label: "Half Day", icon: <CalendarRange size={16} /> },
    { id: "attendance", label: "Attendance Correction", icon: <Clock3 size={16} /> },
    {
      id: "history",
      label: `History${pendingCount ? ` (${pendingCount} pending)` : ""}`,
      icon: <History size={16} />,
    },
  ];

  return (
    <div style={page}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => (window.location.hash = "/")} style={ghostButton}>
            <ArrowLeft size={17} /> Back to dashboard
          </button>
          <button onClick={() => void loadHistory()} style={ghostButton}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <section style={hero}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={heroIcon}>
              <Inbox size={28} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 28 }}>Requests</h1>
              <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
                Ask for leave or a half day, or report a wrong login/logout.
                Every request and decision is saved in your history.
              </p>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                ...tabButton,
                background: tab === item.id ? "#4f46e5" : "#fff",
                color: tab === item.id ? "#fff" : "#334155",
              }}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {notice ? (
          <div
            style={{
              ...card,
              padding: "12px 16px",
              color: notice.ok ? "#166534" : "#b91c1c",
              background: notice.ok ? "#f0fdf4" : "#fef2f2",
              fontWeight: 700,
            }}
          >
            {notice.text}
          </div>
        ) : null}

        {tab === "leave" ? (
          <section style={card}>
            <h2 style={sectionTitle}>Request leave</h2>
            <p style={hint}>Leave can be requested for today or later.</p>
            <div style={grid3}>
              <label style={label}>
                Type
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  style={input}
                >
                  {LEAVE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label style={label}>
                From
                <input
                  type="date"
                  min={today}
                  value={leaveStart}
                  onChange={(e) => {
                    setLeaveStart(e.target.value);
                    if (leaveEnd < e.target.value) setLeaveEnd(e.target.value);
                  }}
                  style={input}
                />
              </label>
              <label style={label}>
                To
                <input
                  type="date"
                  min={leaveStart || today}
                  value={leaveEnd}
                  onChange={(e) => setLeaveEnd(e.target.value)}
                  style={input}
                />
              </label>
            </div>
            <label style={label}>
              Reason
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                rows={3}
                placeholder="Why do you need this leave?"
                style={{ ...input, resize: "vertical" }}
              />
            </label>
            <button
              onClick={() => void submitLeave(false)}
              disabled={busy || !leaveReason.trim() || leaveStart < today}
              style={primaryButton}
            >
              {busy ? <Loader2 size={16} /> : <CheckCircle2 size={16} />} Send
              leave request
            </button>
          </section>
        ) : null}

        {tab === "halfday" ? (
          <section style={card}>
            <h2 style={sectionTitle}>Request a half day</h2>
            <p style={hint}>
              For today or a future date. Working less than your half-day
              limit on an approved half day is not marked absent.
            </p>
            <div style={grid3}>
              <label style={label}>
                Date
                <input
                  type="date"
                  min={today}
                  value={halfDate}
                  onChange={(e) => setHalfDate(e.target.value)}
                  style={input}
                />
              </label>
            </div>
            <label style={label}>
              Reason
              <textarea
                value={halfReason}
                onChange={(e) => setHalfReason(e.target.value)}
                rows={3}
                placeholder="Why do you need a half day?"
                style={{ ...input, resize: "vertical" }}
              />
            </label>
            <button
              onClick={() => void submitLeave(true)}
              disabled={busy || !halfReason.trim() || halfDate < today}
              style={primaryButton}
            >
              {busy ? <Loader2 size={16} /> : <CheckCircle2 size={16} />} Send
              half-day request
            </button>
          </section>
        ) : null}

        {tab === "attendance" ? (
          <section style={card}>
            <h2 style={sectionTitle}>Correct my attendance</h2>
            <p style={hint}>
              Pick the day that is wrong (today or up to {MAX_DAYS_BACK} days
              back), enter the correct times and why. Your admin will review it.
            </p>
            <div style={grid3}>
              <label style={label}>
                Date
                <input
                  type="date"
                  max={today}
                  min={shiftDate(today, -MAX_DAYS_BACK)}
                  value={fixDate}
                  onChange={(e) => setFixDate(e.target.value)}
                  style={input}
                />
              </label>
              <label style={label}>
                Correct login time
                <input
                  type="time"
                  value={fixLogin}
                  onChange={(e) => setFixLogin(e.target.value)}
                  style={input}
                />
              </label>
              <label style={label}>
                Correct logout time (optional)
                <input
                  type="time"
                  value={fixLogout}
                  onChange={(e) => setFixLogout(e.target.value)}
                  style={input}
                />
              </label>
            </div>
            <div style={recordedBox}>
              {currentLoading ? (
                "Loading what is recorded…"
              ) : current ? (
                <>
                  Recorded for {fixDate}: <b>{current.attendanceStatus}</b>,
                  login <b>{clock(current.loginTime)}</b>, logout{" "}
                  <b>{clock(current.logoutTime)}</b>
                </>
              ) : (
                <>Nothing is recorded for {fixDate}.</>
              )}
            </div>
            <label style={label}>
              What is wrong?
              <textarea
                value={fixReason}
                onChange={(e) => setFixReason(e.target.value)}
                rows={3}
                placeholder="e.g. I started at 9:40 but the agent only opened at 11:10"
                style={{ ...input, resize: "vertical" }}
              />
            </label>
            <button
              onClick={() => void submitCorrection()}
              disabled={
                busy ||
                !fixLogin ||
                fixReason.trim().length < 5 ||
                fixDate > today ||
                Boolean(fixLogout && fixLogout <= fixLogin)
              }
              style={primaryButton}
            >
              {busy ? <Loader2 size={16} /> : <CheckCircle2 size={16} />} Send
              correction request
            </button>
          </section>
        ) : null}

        {tab === "history" ? (
          <section style={card}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ ...input, display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220 }}>
                <Search size={16} color="#94a3b8" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search reason, date, decision…"
                  style={{ border: 0, outline: "none", flex: 1, fontSize: 14 }}
                />
              </div>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as any)}
                style={{ ...input, width: 190 }}
              >
                <option value="ALL">All types</option>
                <option value="LEAVE">Leave</option>
                <option value="HALF_DAY">Half day</option>
                <option value="ATTENDANCE">Attendance correction</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{ ...input, width: 160 }}
              >
                <option value="ALL">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            {historyLoading ? (
              <p style={hint}>Loading…</p>
            ) : historyItems.length === 0 ? (
              <p style={hint}>No requests match.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {historyItems.map((item) => (
                  <div key={item.id} style={historyRow}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <b>{item.title}</b>{" "}
                        <span style={{ color: "#64748b" }}>· {item.dates}</span>
                      </div>
                      <span style={{ ...badge, ...badgeColors[item.status] }}>
                        {item.status}
                      </span>
                    </div>
                    {item.detail ? (
                      <div style={{ color: "#475569", fontSize: 13 }}>{item.detail}</div>
                    ) : null}
                    <div style={{ color: "#334155", fontSize: 13 }}>
                      Reason: {item.reason}
                    </div>
                    {item.decision ? (
                      <div style={{ color: "#4f46e5", fontSize: 13 }}>
                        Admin: {item.decision}
                      </div>
                    ) : null}
                    {item.cancel ? (
                      <button
                        onClick={async () => {
                          try {
                            await item.cancel?.();
                            say(true, "Request cancelled.");
                            void loadHistory();
                          } catch (error) {
                            say(false, errorText(error, "Could not cancel."));
                          }
                        }}
                        style={{ ...ghostButton, justifySelf: "start", color: "#b91c1c" }}
                      >
                        <XCircle size={15} /> Cancel request
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg,#f8fafc,#eef2ff)",
  color: "#0f172a",
  padding: 24,
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};
const hero: React.CSSProperties = {
  borderRadius: 24,
  padding: 24,
  background: "linear-gradient(135deg,#0f766e,#4f46e5)",
  color: "#fff",
  boxShadow: "0 24px 70px rgba(79,70,229,.22)",
};
const heroIcon: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 18,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.16)",
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 18,
  padding: 20,
  border: "1px solid #e2e8f0",
  display: "grid",
  gap: 12,
};
const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 18 };
const hint: React.CSSProperties = { margin: 0, color: "#64748b", fontSize: 13 };
const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};
const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
};
const input: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 14,
  fontFamily: "inherit",
  background: "#fff",
};
const baseButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "9px 14px",
  fontWeight: 800,
  cursor: "pointer",
};
const ghostButton: React.CSSProperties = {
  ...baseButton,
  background: "#fff",
  color: "#334155",
};
const primaryButton: React.CSSProperties = {
  ...baseButton,
  justifySelf: "start",
  background: "#4f46e5",
  color: "#fff",
  border: "none",
};
const tabButton: React.CSSProperties = { ...baseButton };
const recordedBox: React.CSSProperties = {
  borderRadius: 12,
  padding: "10px 12px",
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  color: "#334155",
  fontSize: 13,
};
const historyRow: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 6,
};
const badge: React.CSSProperties = {
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 900,
  height: "fit-content",
};
const badgeColors: Record<Status, React.CSSProperties> = {
  PENDING: { background: "#fef3c7", color: "#92400e" },
  APPROVED: { background: "#dcfce7", color: "#166534" },
  REJECTED: { background: "#fee2e2", color: "#991b1b" },
  CANCELLED: { background: "#f1f5f9", color: "#475569" },
};
