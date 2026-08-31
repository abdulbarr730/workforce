import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getLocalDateKey } from "../../shared/daily-flow";

const API =
  import.meta.env.VITE_API_BASE_URL || "https://api.prosyncedu.com/api";

type ScheduledTask = {
  id: string;
  todoId: string;
  itemIndex: number;
  date: string;
  text: string;
  done: boolean;
  estimatedTime?: string;
  scheduledFor?: string;
  deadlineAt?: string | null;
  reminderAt?: string | null;
  deadlineReminderFrequency?: "OFF" | "DAILY" | "EVERY_2_DAYS" | "WEEKLY";
};

type EditState = {
  text: string;
  scheduledFor: string;
  deadlineDate: string;
  deadlineTime: string;
  reminderTime: string;
  estimatedTime: string;
  deadlineReminderFrequency: "OFF" | "DAILY" | "EVERY_2_DAYS" | "WEEKLY";
};

type CalendarView = "agenda" | "week" | "month" | "year";

const blankEdit = (task: ScheduledTask): EditState => {
  const deadline = task.deadlineAt ? new Date(task.deadlineAt) : null;
  const reminder = task.reminderAt ? new Date(task.reminderAt) : null;
  return {
    text: task.text || "",
    scheduledFor: task.scheduledFor || task.date || getLocalDateKey(),
    deadlineDate: deadline ? deadline.toISOString().slice(0, 10) : "",
    deadlineTime: deadline ? deadline.toTimeString().slice(0, 5) : "",
    reminderTime: reminder ? reminder.toTimeString().slice(0, 5) : "",
    estimatedTime: task.estimatedTime || "",
    deadlineReminderFrequency: task.deadlineReminderFrequency || "OFF",
  };
};

function toLocalIso(date: string, time: string) {
  if (!date || !time) return null;
  const [h, m] = time.split(":").map(Number);
  const value = new Date(`${date}T00:00:00`);
  value.setHours(h || 0, m || 0, 0, 0);
  return value.toISOString();
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function niceDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function niceDateTime(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(12, 0, 0, 0);
  return date;
}

function addMonths(value: Date, months: number) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + months);
  return date;
}

function monthGrid(value: Date) {
  const first = new Date(value.getFullYear(), value.getMonth(), 1, 12);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

function weekGrid(value: Date) {
  const start = startOfWeek(value);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

function periodTitle(view: CalendarView, cursor: Date) {
  if (view === "week") {
    const days = weekGrid(cursor);
    return `${days[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (view === "year") return String(cursor.getFullYear());
  if (view === "agenda") return "All scheduled tasks";
  return cursor.toLocaleDateString([], { month: "long", year: "numeric" });
}

const TIME_GRID_START_HOUR = 0;
const TIME_GRID_END_HOUR = 24;
const HOUR_HEIGHT = 52;

function taskTimeMinutes(task: ScheduledTask) {
  const timedValue = task.reminderAt || task.deadlineAt;
  if (!timedValue) return null;
  const date = new Date(timedValue);
  return date.getHours() * 60 + date.getMinutes();
}

function timeLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric" });
}

function eventTimeLabel(task: ScheduledTask) {
  const value = task.reminderAt || task.deadlineAt;
  if (!value) return "All day";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ScheduledTasksPage = () => {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<CalendarView>("month");
  const [cursorDate, setCursorDate] = useState(
    new Date(`${getLocalDateKey()}T12:00:00`),
  );

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token],
  );

  const loadTasks = async () => {
    if (!headers) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/me/todos/scheduled`, {
        headers,
      });
      setTasks(Array.isArray(response.data?.data) ? response.data.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, [headers]);

  const grouped = tasks.reduce<Record<string, ScheduledTask[]>>((acc, task) => {
    const key = task.scheduledFor || task.date;
    acc[key] = acc[key] || [];
    acc[key].push(task);
    return acc;
  }, {});

  const movePeriod = (direction: -1 | 1) => {
    setCursorDate((current) => {
      const next = new Date(current);
      if (view === "week") next.setDate(next.getDate() + direction * 7);
      else if (view === "year") next.setFullYear(next.getFullYear() + direction);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const openCreateForDate = (targetDate: string) => {
    setCreating(true);
    setEdit({
      text: "",
      scheduledFor: targetDate,
      deadlineDate: "",
      deadlineTime: "",
      reminderTime: "09:30",
      estimatedTime: "",
      deadlineReminderFrequency: "OFF",
    });
  };

  const updateTask = async (task: ScheduledTask, patch: Partial<EditState> & { done?: boolean }) => {
    if (!headers) return;
    const current = { ...blankEdit(task), ...patch };
    setSavingId(task.id);
    try {
      await axios.put(
        `${API}/me/todos/${task.todoId}/items/${task.itemIndex}`,
        {
          text: current.text,
          estimatedTime: current.estimatedTime,
          scheduledFor: current.scheduledFor,
          deadlineAt: toLocalIso(current.deadlineDate, current.deadlineTime),
          reminderAt: toLocalIso(current.scheduledFor, current.reminderTime),
          deadlineReminderFrequency: current.deadlineReminderFrequency,
          done: typeof patch.done === "boolean" ? patch.done : task.done,
        },
        { headers },
      );
      await loadTasks();
    } finally {
      setSavingId(null);
    }
  };

  const deleteTask = async (task: ScheduledTask) => {
    if (!headers) return;
    if (!confirm(`Delete "${task.text}"?`)) return;
    setSavingId(task.id);
    try {
      await axios.delete(`${API}/me/todos/${task.todoId}/items/${task.itemIndex}`, {
        headers,
      });
      await loadTasks();
    } finally {
      setSavingId(null);
    }
  };

  const openEdit = (task: ScheduledTask) => {
    setEditing(task);
    setEdit(blankEdit(task));
  };

  const saveEdit = async () => {
    if (!editing || !edit) return;
    await updateTask(editing, edit);
    setEditing(null);
    setEdit(null);
  };

  const createTask = async () => {
    if (!headers || !edit) return;
    setSavingId("new");
    try {
      await axios.post(
        `${API}/me/todos`,
        {
          date: edit.scheduledFor,
          silent: true,
          items: [
            {
              text: edit.text,
              estimatedTime: edit.estimatedTime,
              scheduledFor: edit.scheduledFor,
              deadlineAt: toLocalIso(edit.deadlineDate, edit.deadlineTime),
              reminderAt: toLocalIso(edit.scheduledFor, edit.reminderTime),
              deadlineReminderFrequency: edit.deadlineReminderFrequency,
            },
          ],
        },
        { headers },
      );
      setCreating(false);
      setEdit(null);
      await loadTasks();
    } finally {
      setSavingId(null);
    }
  };

  const renderTaskPill = (task: ScheduledTask, compact = false) => (
    <div
      key={task.id}
      title={`${task.text}${task.deadlineAt ? ` • Deadline ${niceDateTime(task.deadlineAt)}` : ""}`}
      style={{
        border: "1px solid #ddd6fe",
        borderRadius: compact ? 8 : 10,
        background: task.done ? "#e2e8f0" : "#ede9fe",
        color: task.done ? "#64748b" : "#4c1d95",
        padding: compact ? "3px 4px" : "5px 6px",
        fontSize: compact ? 10 : 11,
        fontWeight: 800,
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 4,
      }}
    >
      <button
        onClick={() => openEdit(task)}
        style={{
          border: "none",
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
          padding: 0,
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: task.done ? "line-through" : "none",
        }}
      >
        {task.text}
      </button>
      <button
        onClick={() => openEdit(task)}
        disabled={savingId === task.id}
        aria-label={`Edit ${task.text}`}
        title="Edit task"
        style={miniIconBtn("#4f46e5")}
      >
        <Pencil size={compact ? 12 : 13} />
      </button>
      <button
        onClick={() => deleteTask(task)}
        disabled={savingId === task.id}
        aria-label={`Delete ${task.text}`}
        title="Delete task"
        style={miniIconBtn("#dc2626")}
      >
        <Trash2 size={compact ? 12 : 13} />
      </button>
    </div>
  );

  const renderCalendarDay = (day: Date, currentMonth?: number) => {
    const key = dateKey(day);
    const dayTasks = grouped[key] || [];
    const muted = currentMonth !== undefined && day.getMonth() !== currentMonth;
    const isToday = key === getLocalDateKey();
    return (
      <div
        key={key}
        onDoubleClick={() => openCreateForDate(key)}
        style={{
        minHeight: view === "week" ? 210 : 118,
          border: isToday ? "2px solid #4f46e5" : "1px solid #e2e8f0",
          borderRadius: 18,
          background: muted ? "#f8fafc" : "#fff",
          padding: 9,
          display: "flex",
          flexDirection: "column",
          gap: 7,
          boxShadow: isToday ? "0 8px 24px rgba(79,70,229,.16)" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: muted ? "#94a3b8" : "#0f172a",
            fontWeight: 850,
            fontSize: view === "week" ? 14 : 12,
          }}
        >
          <span>
            {view === "week"
              ? day.toLocaleDateString([], { weekday: "short", day: "numeric" })
              : day.getDate()}
          </span>
          <button
            onClick={() => openCreateForDate(key)}
            style={{
              border: "1px solid #ddd6fe",
              background: "#f5f3ff",
              color: "#6d28d9",
              borderRadius: 999,
              height: 20,
              width: 20,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            +
          </button>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {dayTasks.slice(0, view === "week" ? 8 : 4).map((task) =>
            renderTaskPill(task, view !== "week"),
          )}
          {dayTasks.length > (view === "week" ? 8 : 4) && (
            <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>
              +{dayTasks.length - (view === "week" ? 8 : 4)} more
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderTimedTask = (task: ScheduledTask, overlapIndex = 0) => {
    const minutes = taskTimeMinutes(task) ?? TIME_GRID_START_HOUR * 60;
    const clamped = Math.max(
      TIME_GRID_START_HOUR * 60,
      Math.min(minutes, TIME_GRID_END_HOUR * 60 - 30),
    );
    const top =
      ((clamped - TIME_GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT + overlapIndex * 10;
    const height = Math.max(42, Math.min(70, HOUR_HEIGHT - 8));
    return (
      <div
        key={task.id}
        style={{
          position: "absolute",
          top,
          left: 5 + overlapIndex * 7,
          right: 5,
          minHeight: height,
          borderRadius: 9,
          background: task.done ? "#e2e8f0" : "#dbeafe",
          borderLeft: task.done ? "4px solid #94a3b8" : "4px solid #2563eb",
          boxShadow: "0 5px 12px rgba(37,99,235,.12)",
          padding: "5px 6px",
          color: task.done ? "#64748b" : "#172554",
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 5,
          alignItems: "start",
          zIndex: 3 + overlapIndex,
        }}
      >
        <button
          onClick={() => openEdit(task)}
          style={{
            border: "none",
            background: "transparent",
            color: "inherit",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 850,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textDecoration: task.done ? "line-through" : "none",
            }}
          >
            {task.text}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.76 }}>
            {eventTimeLabel(task)}
          </div>
        </button>
        <button
          onClick={() => openEdit(task)}
          disabled={savingId === task.id}
          title="Edit task"
          style={miniIconBtn("#2563eb")}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => deleteTask(task)}
          disabled={savingId === task.id}
          title="Delete task"
          style={miniIconBtn("#dc2626")}
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  };

  const renderWeekCalendar = () => {
    const days = weekGrid(cursorDate);
    const hours = Array.from(
      { length: TIME_GRID_END_HOUR - TIME_GRID_START_HOUR + 1 },
      (_, index) => TIME_GRID_START_HOUR + index,
    );
    return (
      <section
        style={{
          marginTop: 20,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(15,23,42,.07)",
        }}
      >
        <div
          style={{
            display: "grid",
          gridTemplateColumns: "62px repeat(7, minmax(112px, 1fr))",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <div />
          {days.map((day) => {
            const key = dateKey(day);
            const isToday = key === getLocalDateKey();
            return (
              <div
                key={key}
                style={{
                  padding: "9px 8px",
                  textAlign: "center",
                  borderLeft: "1px solid #e2e8f0",
                }}
              >
                <div style={{ color: "#64748b", fontWeight: 800, fontSize: 11 }}>
                  {day.toLocaleDateString([], { weekday: "short" }).toUpperCase()}
                </div>
                <button
                  onClick={() => openCreateForDate(key)}
                  style={{
                    marginTop: 5,
                    height: 30,
                    width: 30,
                    borderRadius: "50%",
                    border: "none",
                    background: isToday ? "#1a73e8" : "transparent",
                    color: isToday ? "#fff" : "#0f172a",
                    fontSize: 15,
                    fontWeight: 850,
                    cursor: "pointer",
                  }}
                >
                  {day.getDate()}
                </button>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "62px repeat(7, minmax(112px, 1fr))",
            borderBottom: "1px solid #e2e8f0",
            minHeight: 54,
          }}
        >
          <div style={{ padding: "9px 7px", color: "#64748b", fontSize: 11 }}>
            All day
          </div>
          {days.map((day) => {
            const key = dateKey(day);
            const allDayTasks = (grouped[key] || []).filter(
              (task) => taskTimeMinutes(task) === null,
            );
            return (
              <div
                key={key}
                style={{
                  borderLeft: "1px solid #e2e8f0",
                  padding: 5,
                  display: "grid",
                  gap: 6,
                  alignContent: "start",
                }}
              >
                {allDayTasks.slice(0, 3).map((task) => renderTaskPill(task, true))}
                {allDayTasks.length > 3 && (
                  <span style={{ color: "#64748b", fontSize: 10, fontWeight: 700 }}>
                    +{allDayTasks.length - 3} more
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "62px repeat(7, minmax(112px, 1fr))",
            height: (TIME_GRID_END_HOUR - TIME_GRID_START_HOUR) * HOUR_HEIGHT,
            overflowY: "auto",
          }}
        >
          <div style={{ position: "relative", background: "#fff" }}>
            {hours.slice(0, -1).map((hour, index) => (
              <div
                key={hour}
                style={{
                  position: "absolute",
                  top: index * HOUR_HEIGHT - 6,
                  right: 8,
                  color: "#64748b",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {timeLabel(hour)}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const key = dateKey(day);
            const timedTasks = (grouped[key] || []).filter(
              (task) => taskTimeMinutes(task) !== null,
            );
            return (
              <div
                key={key}
                onDoubleClick={() => openCreateForDate(key)}
                style={{
                  position: "relative",
                  borderLeft: "1px solid #e2e8f0",
                  background:
                    key === getLocalDateKey()
                      ? "linear-gradient(180deg,#eff6ff 0%,#fff 16%)"
                      : "#fff",
                }}
              >
                {hours.slice(0, -1).map((hour, index) => (
                  <div
                    key={hour}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: index * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                      borderTop: "1px solid #eef2f7",
                    }}
                  />
                ))}
                {timedTasks
                  .sort(
                    (a, b) =>
                      (taskTimeMinutes(a) || 0) - (taskTimeMinutes(b) || 0),
                  )
                  .map((task, index) => renderTimedTask(task, index % 3))}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderYearCalendar = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
        gap: 18,
      }}
    >
      {Array.from({ length: 12 }, (_, month) => {
        const monthDate = new Date(cursorDate.getFullYear(), month, 1, 12);
        const monthTasks = tasks.filter((task) => {
          const scheduled = new Date(`${task.scheduledFor || task.date}T12:00:00`);
          return (
            scheduled.getFullYear() === cursorDate.getFullYear() &&
            scheduled.getMonth() === month
          );
        });
        return (
          <section
            key={month}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 22,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {monthDate.toLocaleDateString([], { month: "long" })}
              </h3>
              <span style={{ color: "#4f46e5", fontWeight: 900 }}>
                {monthTasks.length}
              </span>
            </div>
            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 5,
              }}
            >
              {monthGrid(monthDate).map((day) => {
                const key = dateKey(day);
                const count = (grouped[key] || []).length;
                const muted = day.getMonth() !== month;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setCursorDate(day);
                      setView("week");
                    }}
                    onDoubleClick={() => openCreateForDate(key)}
                    style={{
                      aspectRatio: "1",
                      border: count ? "1px solid #a78bfa" : "1px solid #f1f5f9",
                      borderRadius: 8,
                      background: count ? "#f5f3ff" : "#fff",
                      color: muted ? "#cbd5e1" : "#334155",
                      cursor: "pointer",
                      fontSize: 10,
                      fontWeight: count ? 850 : 650,
                      position: "relative",
                    }}
                  >
                    {day.getDate()}
                    {count > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          right: 3,
                          bottom: 2,
                          color: "#6d28d9",
                          fontSize: 9,
                        }}
                      >
                        •{count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 20, fontSize: 13 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <button
          onClick={() => (window.location.hash = "/")}
          style={{
            border: "1px solid #e2e8f0",
            background: "#fff",
            borderRadius: 999,
            padding: "7px 11px",
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            cursor: "pointer",
            fontWeight: 750,
            fontSize: 12,
            color: "#0f172a",
          }}
        >
          <ArrowLeft size={16} /> Back to dashboard
        </button>

        <div
          style={{
            marginTop: 14,
            borderRadius: 20,
            padding: 18,
            color: "#fff",
            background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
            boxShadow: "0 18px 40px rgba(79,70,229,.22)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div
              style={{
                height: 42,
                width: 42,
                borderRadius: 14,
                background: "rgba(255,255,255,.18)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <CalendarDays />
            </div>
            <div>
              <p style={{ margin: 0, opacity: 0.82, fontWeight: 700, fontSize: 11 }}>
                Schedule workspace
              </p>
              <h1 style={{ margin: "3px 0 0", fontSize: 22 }}>
                Tasks, reminders & deadlines
              </h1>
            </div>
            <button
              onClick={() => {
                openCreateForDate(addDays(getLocalDateKey(), 1));
              }}
              style={{
                marginLeft: "auto",
                border: "1px solid rgba(255,255,255,.3)",
                background: "rgba(255,255,255,.18)",
                color: "#fff",
                borderRadius: 11,
                padding: "8px 11px",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              + New scheduled task
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {(["agenda", "week", "month", "year"] as CalendarView[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              style={{
                border: view === mode ? "1px solid #4f46e5" : "1px solid #e2e8f0",
                background: view === mode ? "#4f46e5" : "#fff",
                color: view === mode ? "#fff" : "#334155",
                borderRadius: 999,
                padding: "7px 12px",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
                textTransform: "capitalize",
              }}
            >
              {mode}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
            <button onClick={() => movePeriod(-1)} style={iconBtn}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ minWidth: 190, textAlign: "center", fontWeight: 850, fontSize: 14 }}>
              {periodTitle(view, cursorDate)}
            </div>
            <button onClick={() => movePeriod(1)} style={iconBtn}>
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setCursorDate(new Date(`${getLocalDateKey()}T12:00:00`))}
              style={actionBtn("#eef2ff", "#4338ca")}
            >
              Today
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ marginTop: 20, color: "#64748b" }}>Loading schedule…</div>
        ) : tasks.length === 0 ? (
          <div
            style={{
              marginTop: 14,
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 22,
              padding: 28,
              color: "#64748b",
            }}
          >
            No scheduled tasks yet. Add one from the To-Do modal calendar icon.
          </div>
        ) : view === "month" ? (
          <div
            style={{
              marginTop: 20,
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 18,
              padding: 12,
              boxShadow: "0 10px 28px rgba(15,23,42,.06)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8 }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} style={{ color: "#64748b", fontWeight: 800, paddingLeft: 6, fontSize: 11 }}>
                  {day}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {monthGrid(cursorDate).map((day) => renderCalendarDay(day, cursorDate.getMonth()))}
            </div>
          </div>
        ) : view === "week" ? (
          renderWeekCalendar()
        ) : view === "year" ? (
          <div style={{ marginTop: 20 }}>{renderYearCalendar()}</div>
        ) : (
          <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
            {Object.entries(grouped).map(([date, dayTasks]) => (
              <section
                key={date}
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 24,
                  overflow: "hidden",
                  boxShadow: "0 10px 28px rgba(15,23,42,.06)",
                }}
              >
                <div
                  style={{
                    padding: "16px 20px",
                    background: "#eef2ff",
                    borderBottom: "1px solid #e0e7ff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 18, color: "#1e1b4b" }}>
                    {niceDate(date)}
                  </h2>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#4f46e5" }}>
                    {dayTasks.length} task{dayTasks.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div style={{ padding: 16, display: "grid", gap: 10 }}>
                  {dayTasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 18,
                        padding: 14,
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 14,
                        alignItems: "center",
                        background: task.done ? "#f8fafc" : "#fff",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            color: task.done ? "#64748b" : "#0f172a",
                            fontWeight: 900,
                            textDecoration: task.done ? "line-through" : "none",
                          }}
                        >
                          {task.done && <CheckCircle2 size={16} color="#10b981" />}
                          {task.text}
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            fontSize: 12,
                            color: "#64748b",
                          }}
                        >
                          <span>Reminder: {niceDateTime(task.reminderAt)}</span>
                          <span>Deadline: {niceDateTime(task.deadlineAt)}</span>
                          {task.deadlineReminderFrequency &&
                            task.deadlineReminderFrequency !== "OFF" && (
                              <span>Repeats: {task.deadlineReminderFrequency.replaceAll("_", " ")}</span>
                            )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => updateTask(task, { done: !task.done })} disabled={savingId === task.id} style={actionBtn("#ecfdf5", "#047857")}>
                          {task.done ? "Undo" : "Done"}
                        </button>
                        <button onClick={() => updateTask(task, { scheduledFor: addDays(task.scheduledFor || task.date, 1) })} disabled={savingId === task.id} style={actionBtn("#eff6ff", "#1d4ed8")}>
                          Next day
                        </button>
                        <button onClick={() => openEdit(task)} disabled={savingId === task.id} style={iconBtn}>
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => deleteTask(task)} disabled={savingId === task.id} style={dangerBtn}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {(editing || creating) && edit && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.42)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "#fff",
              borderRadius: 24,
              padding: 24,
              boxShadow: "0 24px 80px rgba(15,23,42,.28)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              {creating ? "New scheduled task" : "Edit scheduled task"}
            </h2>
            <label style={label}>Task</label>
            <input style={input} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Scheduled date</label>
                <input type="date" style={input} value={edit.scheduledFor} onChange={(e) => setEdit({ ...edit, scheduledFor: e.target.value })} />
              </div>
              <div>
                <label style={label}>Reminder time</label>
                <input type="time" style={input} value={edit.reminderTime} onChange={(e) => setEdit({ ...edit, reminderTime: e.target.value })} />
              </div>
              <div>
                <label style={label}>Deadline date</label>
                <input type="date" style={input} value={edit.deadlineDate} onChange={(e) => setEdit({ ...edit, deadlineDate: e.target.value })} />
              </div>
              <div>
                <label style={label}>Deadline time</label>
                <input type="time" style={input} value={edit.deadlineTime} onChange={(e) => setEdit({ ...edit, deadlineTime: e.target.value })} />
              </div>
            </div>
            <label style={label}>Deadline reminder repeat</label>
            <select style={input} value={edit.deadlineReminderFrequency} onChange={(e) => setEdit({ ...edit, deadlineReminderFrequency: e.target.value as EditState["deadlineReminderFrequency"] })}>
              <option value="OFF">No repeat</option>
              <option value="DAILY">Every day</option>
              <option value="EVERY_2_DAYS">Every 2 days</option>
              <option value="WEEKLY">Weekly</option>
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button style={actionBtn("#f8fafc", "#334155")} onClick={() => {
                setEditing(null);
                setCreating(false);
                setEdit(null);
              }}>Cancel</button>
              <button
                style={actionBtn("#4f46e5", "#fff")}
                onClick={creating ? createTask : saveEdit}
                disabled={savingId === (editing?.id || "new") || !edit.text.trim()}
              >
                {creating ? "Create task" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: "#475569",
  margin: "12px 0 6px",
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 14,
};

const iconBtn: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 12,
  padding: "9px 10px",
  cursor: "pointer",
  color: "#334155",
};

const dangerBtn: React.CSSProperties = {
  ...iconBtn,
  color: "#dc2626",
  borderColor: "#fecaca",
  background: "#fff5f5",
};

function miniIconBtn(color: string): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,.7)",
    background: "rgba(255,255,255,.72)",
    color,
    borderRadius: 7,
    width: 24,
    height: 24,
    display: "inline-grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
  };
}

function actionBtn(background: string, color: string): React.CSSProperties {
  return {
    border: "1px solid rgba(15,23,42,.08)",
    background,
    color,
    borderRadius: 12,
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 900,
  };
}
