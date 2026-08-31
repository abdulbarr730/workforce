import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getLocalDateKey } from "../../shared/daily-flow";

const API =
  import.meta.env.VITE_API_BASE_URL || "https://api.prosyncedu.com/api";

type ScheduledTask = {
  id: string;
  taskId?: string;
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

function taskPathKey(task: ScheduledTask) {
  return encodeURIComponent(task.taskId || String(task.itemIndex));
}

type EditState = {
  text: string;
  scheduledFor: string;
  deadlineDate: string;
  deadlineTime: string;
  reminderTime: string;
  estimatedTime: string;
  deadlineReminderFrequency: "OFF" | "DAILY" | "EVERY_2_DAYS" | "WEEKLY";
};

type CalendarView = "agenda" | "day" | "four-day" | "week" | "month" | "year";

const blankEdit = (task: ScheduledTask): EditState => {
  const deadline = task.deadlineAt ? new Date(task.deadlineAt) : null;
  const reminder = task.reminderAt ? new Date(task.reminderAt) : null;
  return {
    text: task.text || "",
    scheduledFor: task.scheduledFor || task.date || getLocalDateKey(),
    deadlineDate: deadline ? dateKey(deadline) : "",
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
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(12, 0, 0, 0);
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
  if (view === "day") {
    return cursor.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "four-day") {
    const end = new Date(cursor);
    end.setDate(end.getDate() + 3);
    return `${cursor.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  }
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
const TIME_GRID_TOP_PADDING = 16;
const TIME_SNAP_MINUTES = 15;

function formatTimeInput(totalMinutes: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function nextRoundedTime() {
  const now = new Date();
  const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
  return formatTimeInput(rounded >= 24 * 60 ? 23 * 60 + 30 : rounded);
}

function taskTimeMinutes(task: ScheduledTask) {
  const timedValue = task.reminderAt;
  if (!timedValue) return null;
  const date = new Date(timedValue);
  return date.getHours() * 60 + date.getMinutes();
}

function taskDurationMinutes(value?: string) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return 45;

  const clock = text.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return Math.max(15, Number(clock[1]) * 60 + Number(clock[2]));

  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const minutes = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  const total =
    (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  if (total > 0) return Math.max(15, total);

  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? Math.max(15, numeric) : 45;
}

function timeLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric" });
}

function eventTimeLabel(task: ScheduledTask) {
  const value = task.reminderAt;
  if (!value) return "All day";
  const start = new Date(value);
  const end = new Date(
    start.getTime() + taskDurationMinutes(task.estimatedTime) * 60_000,
  );
  const format = (date: Date) =>
    date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${format(start)} – ${format(end)}`;
}

export const ScheduledTasksPage = () => {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<CalendarView>(() => {
    const saved = localStorage.getItem("scheduled-calendar-view");
    return ["agenda", "day", "four-day", "week", "month", "year"].includes(
      saved || "",
    )
      ? (saved as CalendarView)
      : "month";
  });
  const [cursorDate, setCursorDate] = useState(
    new Date(`${getLocalDateKey()}T12:00:00`),
  );
  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const [draggingTask, setDraggingTask] = useState<ScheduledTask | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement | null>(null);
  const mutationLockRef = useRef(false);

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

  useEffect(() => {
    localStorage.setItem("scheduled-calendar-view", view);
  }, [view]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!showCompleted && task.done) return false;
      if (!needle) return true;
      return [
        task.text,
        task.scheduledFor || task.date,
        task.deadlineAt ? niceDateTime(task.deadlineAt) : "",
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [query, showCompleted, tasks]);

  const grouped = visibleTasks.reduce<Record<string, ScheduledTask[]>>(
    (acc, task) => {
      const key = task.scheduledFor || task.date;
      acc[key] = acc[key] || [];
      acc[key].push(task);
      return acc;
    },
    {},
  );

  const movePeriod = (direction: -1 | 1) => {
    setCursorDate((current) => {
      const next = new Date(current);
      if (view === "day") next.setDate(next.getDate() + direction);
      else if (view === "four-day")
        next.setDate(next.getDate() + direction * 4);
      else if (view === "week") next.setDate(next.getDate() + direction * 7);
      else if (view === "year")
        next.setFullYear(next.getFullYear() + direction);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  const closeEditor = () => {
    setEditing(null);
    setCreating(false);
    setEdit(null);
  };

  const openCreateForDate = (targetDate: string, reminderTime = "") => {
    setEditing(null);
    setCreating(true);
    setEdit({
      text: "",
      scheduledFor: targetDate,
      deadlineDate: "",
      deadlineTime: "",
      reminderTime,
      estimatedTime: "",
      deadlineReminderFrequency: "OFF",
    });
  };

  const updateTask = async (
    task: ScheduledTask,
    patch: Partial<EditState> & { done?: boolean },
  ) => {
    if (!headers || mutationLockRef.current) return false;
    mutationLockRef.current = true;
    const current = { ...blankEdit(task), ...patch };
    setSavingId(task.id);
    try {
      await axios.put(
        `${API}/me/todos/${task.todoId}/items/${taskPathKey(task)}`,
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
      showNotice("Task updated");
      return true;
    } catch (error) {
      showNotice(
        axios.isAxiosError(error)
          ? error.response?.data?.message || "Could not update the task"
          : "Could not update the task",
      );
      return false;
    } finally {
      mutationLockRef.current = false;
      setSavingId(null);
    }
  };

  const deleteTask = async (task: ScheduledTask) => {
    if (!headers || mutationLockRef.current) return;
    if (!confirm(`Delete "${task.text}"?`)) return;
    mutationLockRef.current = true;
    setSavingId(task.id);
    try {
      await axios.delete(
        `${API}/me/todos/${task.todoId}/items/${taskPathKey(task)}`,
        {
          headers,
        },
      );
      await loadTasks();
      showNotice("Task deleted");
    } catch (error) {
      showNotice(
        axios.isAxiosError(error)
          ? error.response?.data?.message || "Could not delete the task"
          : "Could not delete the task",
      );
    } finally {
      mutationLockRef.current = false;
      setSavingId(null);
    }
  };

  const openEdit = (task: ScheduledTask) => {
    setCreating(false);
    setEditing(task);
    setEdit(blankEdit(task));
  };

  const saveEdit = async () => {
    if (!editing || !edit) return;
    const saved = await updateTask(editing, edit);
    if (saved) closeEditor();
  };

  const createTask = async () => {
    if (!headers || !edit || mutationLockRef.current) return;
    mutationLockRef.current = true;
    setSavingId("new");
    try {
      await axios.post(
        `${API}/me/todos/scheduled`,
        {
          text: edit.text,
          estimatedTime: edit.estimatedTime,
          scheduledFor: edit.scheduledFor,
          deadlineAt: toLocalIso(edit.deadlineDate, edit.deadlineTime),
          reminderAt: toLocalIso(edit.scheduledFor, edit.reminderTime),
          deadlineReminderFrequency: edit.deadlineReminderFrequency,
        },
        { headers },
      );
      closeEditor();
      await loadTasks();
      showNotice("Task added to your calendar");
    } catch (error) {
      showNotice(
        axios.isAxiosError(error)
          ? error.response?.data?.message || "Could not create the task"
          : "Could not create the task",
      );
    } finally {
      mutationLockRef.current = false;
      setSavingId(null);
    }
  };

  const rescheduleTask = async (
    task: ScheduledTask,
    scheduledFor: string,
    reminderTime: string,
  ) => {
    const saved = await updateTask(task, { scheduledFor, reminderTime });
    if (saved) setDraggingTask(null);
  };

  const startDraggingTask = (event: React.DragEvent, task: ScheduledTask) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    setDraggingTask(task);
  };

  const renderTaskPill = (task: ScheduledTask, compact = false) => (
    <div
      key={task.id}
      data-calendar-event="true"
      draggable
      onDragStart={(event) => startDraggingTask(event, task)}
      onDragEnd={() => setDraggingTask(null)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
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
        gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
        alignItems: "center",
        gap: 4,
      }}
    >
      <button
        onClick={(event) => {
          event.stopPropagation();
          void updateTask(task, { done: !task.done });
        }}
        disabled={Boolean(savingId)}
        aria-label={
          task.done
            ? `Mark ${task.text} incomplete`
            : `Mark ${task.text} complete`
        }
        title={task.done ? "Mark incomplete" : "Mark complete"}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          color: task.done ? "#059669" : "#7c3aed",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
        }}
      >
        {task.done ? (
          <CheckCircle2 size={compact ? 12 : 14} />
        ) : (
          <Circle size={compact ? 12 : 14} />
        )}
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          openEdit(task);
        }}
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
        onClick={(event) => {
          event.stopPropagation();
          openEdit(task);
        }}
        disabled={Boolean(savingId)}
        aria-label={`Edit ${task.text}`}
        title="Edit task"
        style={miniIconBtn("#4f46e5")}
      >
        <Pencil size={compact ? 12 : 13} />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          void deleteTask(task);
        }}
        disabled={Boolean(savingId)}
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
        onClick={() => openCreateForDate(key)}
        onDragOver={(event) => {
          if (!draggingTask) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingTask) {
            void rescheduleTask(
              draggingTask,
              key,
              blankEdit(draggingTask).reminderTime,
            );
          }
        }}
        style={{
          minHeight: 118,
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
            onClick={(event) => {
              event.stopPropagation();
              openCreateForDate(key);
            }}
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
          {dayTasks
            .slice(0, view === "week" ? 8 : 4)
            .map((task) => renderTaskPill(task, view !== "week"))}
          {dayTasks.length > (view === "week" ? 8 : 4) && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setCursorDate(day);
                setView("day");
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                textAlign: "left",
                cursor: "pointer",
                fontSize: 10,
                color: "#4f46e5",
                fontWeight: 800,
              }}
            >
              +{dayTasks.length - (view === "week" ? 8 : 4)} more
            </button>
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
      TIME_GRID_TOP_PADDING +
      ((clamped - TIME_GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max(
      34,
      Math.min(
        6 * HOUR_HEIGHT,
        (taskDurationMinutes(task.estimatedTime) / 60) * HOUR_HEIGHT - 4,
      ),
    );
    return (
      <div
        key={task.id}
        data-calendar-event="true"
        draggable
        onDragStart={(event) => startDraggingTask(event, task)}
        onDragEnd={() => setDraggingTask(null)}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
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
          gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
          gap: 5,
          alignItems: "start",
          zIndex: 2 + overlapIndex,
        }}
      >
        <button
          onClick={(event) => {
            event.stopPropagation();
            void updateTask(task, { done: !task.done });
          }}
          disabled={Boolean(savingId)}
          title={task.done ? "Mark incomplete" : "Mark complete"}
          style={{
            border: "none",
            background: "transparent",
            color: task.done ? "#059669" : "#2563eb",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {task.done ? <CheckCircle2 size={12} /> : <Circle size={12} />}
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            openEdit(task);
          }}
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
          onClick={(event) => {
            event.stopPropagation();
            openEdit(task);
          }}
          disabled={Boolean(savingId)}
          title="Edit task"
          style={miniIconBtn("#2563eb")}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            void deleteTask(task);
          }}
          disabled={Boolean(savingId)}
          title="Delete task"
          style={miniIconBtn("#dc2626")}
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  };

  const renderWeekCalendar = () => {
    const days =
      view === "day"
        ? [new Date(cursorDate)]
        : view === "four-day"
          ? Array.from({ length: 4 }, (_, index) => {
              const day = new Date(cursorDate);
              day.setDate(day.getDate() + index);
              return day;
            })
          : weekGrid(cursorDate);
    const hours = Array.from(
      { length: TIME_GRID_END_HOUR - TIME_GRID_START_HOUR + 1 },
      (_, index) => TIME_GRID_START_HOUR + index,
    );
    const gridColumns = `62px repeat(${days.length}, minmax(${days.length === 1 ? 420 : 112}px, 1fr))`;
    const minCalendarWidth =
      days.length === 7 ? 920 : days.length === 4 ? 620 : 520;
    return (
      <section
        style={{
          marginTop: 20,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 24,
          overflowX: "auto",
          overflowY: "hidden",
          boxShadow: "0 12px 30px rgba(15,23,42,.07)",
        }}
      >
        <div style={{ minWidth: minCalendarWidth }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
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
                  <div
                    style={{ color: "#64748b", fontWeight: 800, fontSize: 11 }}
                  >
                    {day
                      .toLocaleDateString([], { weekday: "short" })
                      .toUpperCase()}
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
              gridTemplateColumns: gridColumns,
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
                  onClick={() => openCreateForDate(key)}
                  onDragOver={(event) => {
                    if (!draggingTask) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingTask)
                      void rescheduleTask(draggingTask, key, "");
                  }}
                  style={{
                    borderLeft: "1px solid #e2e8f0",
                    padding: 5,
                    display: "grid",
                    gap: 6,
                    alignContent: "start",
                  }}
                >
                  {allDayTasks
                    .slice(0, 3)
                    .map((task) => renderTaskPill(task, true))}
                  {allDayTasks.length > 3 && (
                    <span
                      style={{
                        color: "#64748b",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      +{allDayTasks.length - 3} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              maxHeight: "min(640px, calc(100vh - 285px))",
              minHeight: 430,
              overflowY: "auto",
              scrollbarGutter: "stable",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridColumns,
                height:
                  TIME_GRID_TOP_PADDING * 2 +
                  (TIME_GRID_END_HOUR - TIME_GRID_START_HOUR) * HOUR_HEIGHT,
              }}
            >
              <div style={{ position: "relative", background: "#fff" }}>
                {hours.slice(0, -1).map((hour, index) => (
                  <div
                    key={hour}
                    style={{
                      position: "absolute",
                      top: TIME_GRID_TOP_PADDING + index * HOUR_HEIGHT + 5,
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
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const rawMinutes =
                        ((event.clientY - rect.top - TIME_GRID_TOP_PADDING) /
                          HOUR_HEIGHT) *
                        60;
                      const snapped =
                        Math.round(rawMinutes / TIME_SNAP_MINUTES) *
                        TIME_SNAP_MINUTES;
                      openCreateForDate(key, formatTimeInput(snapped));
                    }}
                    onDragOver={(event) => {
                      if (!draggingTask) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggingTask) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const rawMinutes =
                        ((event.clientY - rect.top - TIME_GRID_TOP_PADDING) /
                          HOUR_HEIGHT) *
                        60;
                      const snapped =
                        Math.round(rawMinutes / TIME_SNAP_MINUTES) *
                        TIME_SNAP_MINUTES;
                      void rescheduleTask(
                        draggingTask,
                        key,
                        formatTimeInput(snapped),
                      );
                    }}
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
                          top: TIME_GRID_TOP_PADDING + index * HOUR_HEIGHT,
                          height: HOUR_HEIGHT,
                          borderTop: "1px solid #eef2f7",
                          pointerEvents: "none",
                        }}
                      />
                    ))}
                    {key === getLocalDateKey() && (
                      <div
                        aria-label="Current time"
                        style={{
                          position: "absolute",
                          zIndex: 8,
                          left: 0,
                          right: 0,
                          top:
                            TIME_GRID_TOP_PADDING +
                            ((now.getHours() * 60 + now.getMinutes()) / 60) *
                              HOUR_HEIGHT,
                          borderTop: "2px solid #ef4444",
                          pointerEvents: "none",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: -5,
                            top: -5,
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#ef4444",
                          }}
                        />
                      </div>
                    )}
                    {(() => {
                      const overlaps = new Map<number, number>();
                      return timedTasks
                        .sort(
                          (a, b) =>
                            (taskTimeMinutes(a) || 0) -
                            (taskTimeMinutes(b) || 0),
                        )
                        .map((task) => {
                          const minute = taskTimeMinutes(task) || 0;
                          const overlapIndex = overlaps.get(minute) || 0;
                          overlaps.set(minute, overlapIndex + 1);
                          return renderTimedTask(task, overlapIndex);
                        });
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
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
        const monthTasks = visibleTasks.filter((task) => {
          const scheduled = new Date(
            `${task.scheduledFor || task.date}T12:00:00`,
          );
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
                      setView("day");
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target?.closest("input, textarea, select, [contenteditable='true']"),
      );

      if (event.key === "Escape" && (editing || creating)) {
        event.preventDefault();
        closeEditor();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        edit
      ) {
        event.preventDefault();
        if (creating) void createTask();
        else if (editing) void saveEdit();
        return;
      }
      if (isTyping || editing || creating) return;

      const key = event.key.toLowerCase();
      if (key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (key === "c") {
        event.preventDefault();
        openCreateForDate(getLocalDateKey(), nextRoundedTime());
      } else if (key === "t") {
        setCursorDate(new Date(`${getLocalDateKey()}T12:00:00`));
      } else if (key === "d" || key === "1") {
        setView("day");
      } else if (key === "w" || key === "2") {
        setView("week");
      } else if (key === "m" || key === "3") {
        setView("month");
      } else if (key === "a" || key === "5") {
        setView("agenda");
      } else if (key === "y" || key === "6") {
        setView("year");
      } else if (key === "4") {
        setView("four-day");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [creating, edit, editing]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: 20,
        fontSize: 13,
      }}
    >
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
              <p
                style={{
                  margin: 0,
                  opacity: 0.82,
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                Schedule workspace
              </p>
              <h1 style={{ margin: "3px 0 0", fontSize: 22 }}>
                Tasks, reminders & deadlines
              </h1>
            </div>
            <button
              onClick={() => {
                openCreateForDate(getLocalDateKey(), nextRoundedTime());
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
          {(
            [
              "day",
              "four-day",
              "week",
              "month",
              "year",
              "agenda",
            ] as CalendarView[]
          ).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              style={{
                border:
                  view === mode ? "1px solid #4f46e5" : "1px solid #e2e8f0",
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
              {mode === "four-day"
                ? "4 days"
                : mode === "agenda"
                  ? "Schedule"
                  : mode}
            </button>
          ))}
          <label
            style={{
              marginLeft: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#475569",
              fontSize: 11,
              fontWeight: 750,
            }}
          >
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(event) => setShowCompleted(event.target.checked)}
            />
            Completed
          </label>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <button onClick={() => movePeriod(-1)} style={iconBtn}>
              <ChevronLeft size={18} />
            </button>
            <div
              style={{
                minWidth: 190,
                textAlign: "center",
                fontWeight: 850,
                fontSize: 14,
              }}
            >
              {periodTitle(view, cursorDate)}
            </div>
            <button onClick={() => movePeriod(1)} style={iconBtn}>
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() =>
                setCursorDate(new Date(`${getLocalDateKey()}T12:00:00`))
              }
              style={actionBtn("#eef2ff", "#4338ca")}
            >
              Today
            </button>
            <input
              type="date"
              aria-label="Go to date"
              title="Go to date"
              value={dateKey(cursorDate)}
              onChange={(event) => {
                if (event.target.value) {
                  setCursorDate(new Date(`${event.target.value}T12:00:00`));
                }
              }}
              style={{ ...input, width: 128, padding: "7px 8px", fontSize: 11 }}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "7px 10px",
          }}
        >
          <Search size={15} color="#64748b" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks, dates, or deadlines  ( / )"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 12,
              color: "#0f172a",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              style={{ ...miniIconBtn("#64748b"), borderColor: "#e2e8f0" }}
            >
              <X size={13} />
            </button>
          )}
          <span style={{ color: "#64748b", fontSize: 10, fontWeight: 700 }}>
            {visibleTasks.length} task{visibleTasks.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div style={{ marginTop: 20, color: "#64748b" }}>
            Loading schedule…
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 8,
                marginBottom: 8,
              }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  style={{
                    color: "#64748b",
                    fontWeight: 800,
                    paddingLeft: 6,
                    fontSize: 11,
                  }}
                >
                  {day}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 8,
              }}
            >
              {monthGrid(cursorDate).map((day) =>
                renderCalendarDay(day, cursorDate.getMonth()),
              )}
            </div>
          </div>
        ) : view === "week" || view === "day" || view === "four-day" ? (
          renderWeekCalendar()
        ) : view === "year" ? (
          <div style={{ marginTop: 20 }}>{renderYearCalendar()}</div>
        ) : (
          <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
            {Object.entries(grouped).length === 0 ? (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 24,
                  color: "#64748b",
                }}
              >
                No matching scheduled tasks. Click New scheduled task or press
                C.
              </div>
            ) : (
              Object.entries(grouped).map(([date, dayTasks]) => (
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
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "#4f46e5",
                      }}
                    >
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
                              textDecoration: task.done
                                ? "line-through"
                                : "none",
                            }}
                          >
                            {task.done && (
                              <CheckCircle2 size={16} color="#10b981" />
                            )}
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
                            <span>
                              Reminder: {niceDateTime(task.reminderAt)}
                            </span>
                            <span>
                              Deadline: {niceDateTime(task.deadlineAt)}
                            </span>
                            {task.deadlineReminderFrequency &&
                              task.deadlineReminderFrequency !== "OFF" && (
                                <span>
                                  Repeats:{" "}
                                  {task.deadlineReminderFrequency.replaceAll(
                                    "_",
                                    " ",
                                  )}
                                </span>
                              )}
                          </div>
                        </div>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <button
                            onClick={() =>
                              updateTask(task, { done: !task.done })
                            }
                            disabled={Boolean(savingId)}
                            style={actionBtn("#ecfdf5", "#047857")}
                          >
                            {task.done ? "Undo" : "Done"}
                          </button>
                          <button
                            onClick={() =>
                              updateTask(task, {
                                scheduledFor: addDays(
                                  task.scheduledFor || task.date,
                                  1,
                                ),
                              })
                            }
                            disabled={Boolean(savingId)}
                            style={actionBtn("#eff6ff", "#1d4ed8")}
                          >
                            Next day
                          </button>
                          <button
                            onClick={() => openEdit(task)}
                            disabled={Boolean(savingId)}
                            style={iconBtn}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => deleteTask(task)}
                            disabled={Boolean(savingId)}
                            style={dangerBtn}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>

      {(editing || creating) &&
        edit &&
        createPortal(
          <div
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeEditor();
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              background: "rgba(15,23,42,.48)",
              display: "grid",
              placeItems: "center",
              padding: 20,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={
                creating ? "Create scheduled task" : "Edit scheduled task"
              }
              onMouseDown={(event) => event.stopPropagation()}
              style={{
                width: "min(560px, 100%)",
                maxHeight: "calc(100vh - 40px)",
                overflowY: "auto",
                background: "#fff",
                borderRadius: 22,
                padding: 22,
                boxShadow: "0 24px 80px rgba(15,23,42,.34)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Clock3 size={19} color="#4f46e5" />
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  {creating ? "New scheduled task" : "Edit scheduled task"}
                </h2>
                <button
                  onClick={closeEditor}
                  aria-label="Close task editor"
                  style={{
                    ...miniIconBtn("#64748b"),
                    marginLeft: "auto",
                    borderColor: "#e2e8f0",
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <label style={label}>Task</label>
              <input
                autoFocus
                style={input}
                value={edit.text}
                placeholder="Add task title"
                onChange={(event) =>
                  setEdit({ ...edit, text: event.target.value })
                }
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Scheduled date</label>
                  <input
                    type="date"
                    style={input}
                    value={edit.scheduledFor}
                    onChange={(event) =>
                      setEdit({ ...edit, scheduledFor: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={label}>Start / reminder time</label>
                  <input
                    type="time"
                    style={{
                      ...input,
                      background: edit.reminderTime ? "#fff" : "#f1f5f9",
                    }}
                    value={edit.reminderTime}
                    disabled={!edit.reminderTime}
                    onChange={(event) =>
                      setEdit({ ...edit, reminderTime: event.target.value })
                    }
                  />
                </div>
              </div>

              <label
                style={{
                  marginTop: 9,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  color: "#475569",
                  fontSize: 12,
                  fontWeight: 750,
                }}
              >
                <input
                  type="checkbox"
                  checked={!edit.reminderTime}
                  onChange={(event) =>
                    setEdit({
                      ...edit,
                      reminderTime: event.target.checked
                        ? ""
                        : nextRoundedTime(),
                    })
                  }
                />
                All-day task
              </label>

              <label style={label}>Estimated duration</label>
              <input
                style={input}
                value={edit.estimatedTime}
                placeholder="For example: 30m, 1h, 1h 30m"
                onChange={(event) =>
                  setEdit({ ...edit, estimatedTime: event.target.value })
                }
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Deadline date</label>
                  <input
                    type="date"
                    style={input}
                    value={edit.deadlineDate}
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        deadlineDate: event.target.value,
                        deadlineTime: event.target.value
                          ? edit.deadlineTime || "18:00"
                          : "",
                        deadlineReminderFrequency: event.target.value
                          ? edit.deadlineReminderFrequency
                          : "OFF",
                      })
                    }
                  />
                </div>
                <div>
                  <label style={label}>Deadline time</label>
                  <input
                    type="time"
                    style={{
                      ...input,
                      background: edit.deadlineDate ? "#fff" : "#f1f5f9",
                    }}
                    value={edit.deadlineTime}
                    disabled={!edit.deadlineDate}
                    onChange={(event) =>
                      setEdit({ ...edit, deadlineTime: event.target.value })
                    }
                  />
                </div>
              </div>

              <label style={label}>Deadline reminder repeat</label>
              <select
                style={{
                  ...input,
                  background: edit.deadlineDate ? "#fff" : "#f1f5f9",
                }}
                value={edit.deadlineReminderFrequency}
                disabled={!edit.deadlineDate}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    deadlineReminderFrequency: event.target
                      .value as EditState["deadlineReminderFrequency"],
                  })
                }
              >
                <option value="OFF">No repeat reminder</option>
                <option value="DAILY">Every day</option>
                <option value="EVERY_2_DAYS">Every 2 days</option>
                <option value="WEEKLY">Weekly</option>
              </select>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 18,
                }}
              >
                <button
                  style={actionBtn("#f8fafc", "#334155")}
                  onClick={closeEditor}
                >
                  Cancel
                </button>
                <button
                  style={actionBtn("#4f46e5", "#fff")}
                  onClick={creating ? createTask : saveEdit}
                  disabled={Boolean(savingId) || !edit.text.trim()}
                >
                  {savingId
                    ? "Saving…"
                    : creating
                      ? "Create task"
                      : "Save changes"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {notice && (
        <div
          role="status"
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            zIndex: 11000,
            borderRadius: 12,
            background: "#0f172a",
            color: "#fff",
            padding: "10px 14px",
            boxShadow: "0 12px 30px rgba(15,23,42,.28)",
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          {notice}
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
