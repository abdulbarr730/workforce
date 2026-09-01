import { useEffect, useState } from "react";
import axios from "axios";
import { CalendarDays, Check, ChevronRight, GripVertical, ListTodo, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getLocalDateKey } from "../../shared/daily-flow";

const API =
  import.meta.env.VITE_API_BASE_URL || "https://api.prosyncedu.com/api";
type WidgetTask = {
  id?: string;
  taskId?: string | null;
  todoId?: string;
  itemIndex?: number;
  text: string;
  done: boolean;
  timeTaken?: string;
  estimatedTime?: string;
  completedAt?: string | null;
  scheduledFor?: string;
  deadlineAt?: string | null;
  reminderAt?: string | null;
  deadlineReminderFrequency?: string;
};

const completionTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const nextDayKey = () => {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return next.toLocaleDateString("en-CA");
};

const formatDate = (value?: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString([], {
        month: "short",
        day: "numeric",
      })
    : "";

const formatDeadline = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export function TodoWidgetPage() {
  const { token } = useAuth();
  const date = getLocalDateKey();
  const [tasks, setTasks] = useState<WidgetTask[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<WidgetTask[]>([]);
  const [status, setStatus] = useState("Loading today's tasks...");
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const saveTasksToBackend = async (newTasks: WidgetTask[], targetDate = date) => {
    if (!token) return;
    try {
      await axios.post(
        `${API}/me/todos`,
        { date: targetDate, items: newTasks, silent: true },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      // silent
    }
  };

  const taskPathKey = (task: WidgetTask) =>
    task.taskId || String(task.itemIndex ?? task.id ?? "");

  const updateSingleTask = async (
    task: WidgetTask,
    patch: Partial<WidgetTask>,
  ) => {
    if (!token || !task.todoId || !taskPathKey(task)) return false;
    await axios.put(
      `${API}/me/todos/${task.todoId}/items/${taskPathKey(task)}`,
      {
        text: patch.text ?? task.text,
        estimatedTime:
          patch.estimatedTime ?? task.estimatedTime ?? task.timeTaken ?? "",
        scheduledFor: patch.scheduledFor ?? task.scheduledFor ?? date,
        deadlineAt:
          patch.deadlineAt !== undefined ? patch.deadlineAt : task.deadlineAt,
        reminderAt:
          patch.reminderAt !== undefined ? patch.reminderAt : task.reminderAt,
        deadlineReminderFrequency:
          patch.deadlineReminderFrequency ??
          task.deadlineReminderFrequency ??
          "OFF",
        done: patch.done ?? task.done,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return true;
  };

  const addTask = () => {
    const newTask = { text: "", done: false };
    const next = [...tasks, newTask];
    setTasks(next);
    setEditingIndex(next.length - 1);
    setEditText("");
  };

  const saveEdit = (index: number) => {
    if (editingIndex === null) return;
    const next = [...tasks];
    if (editText.trim()) {
      next[index].text = editText.trim();
    } else if (!next[index]?.text.trim()) {
      const withoutEmpty = next.filter((_, itemIndex) => itemIndex !== index);
      setTasks(withoutEmpty);
      setEditingIndex(null);
      return;
    }
    setTasks(next);
    setEditingIndex(null);
    saveTasksToBackend(next);
  };

  const deleteTask = (index: number) => {
    const next = tasks.filter((_, i) => i !== index);
    setTasks(next);
    saveTasksToBackend(next);
  };

  useEffect(() => {
    const elements = [document.documentElement, document.body];
    const root = document.getElementById("root");
    if (root) elements.push(root);
    const previous = elements.map((element) => ({
      element,
      background: element.style.background,
      overflow: element.style.overflow,
    }));
    elements.forEach((element) => {
      element.style.background = "transparent";
      element.style.overflow = "hidden";
    });
    return () => {
      previous.forEach(({ element, background, overflow }) => {
        element.style.background = background;
        element.style.overflow = overflow;
      });
    };
  }, []);

  const setWidgetExpanded = (next: boolean) => {
    setExpanded(next);
    void (window as any).electronAPI?.setTodoWidgetExpanded?.(next);
  };

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get(`${API}/me/todos/today?date=${date}`, { headers }),
      axios.get(`${API}/me/todos/upcoming`, { headers }),
    ])
      .then(([response, upcomingResponse]) => {
        setTasks(
          Array.isArray(response.data?.data?.items)
            ? response.data.data.items
            : [],
        );
        setUpcomingTasks(
          Array.isArray(upcomingResponse.data?.data)
            ? upcomingResponse.data.data
            : [],
        );
        setStatus("");
      })
      .catch(() => setStatus("Could not load today's Todo list."));
  }, [date, token]);

  const toggleTask = async (index: number) => {
    if (!token || !tasks[index]) return;
    const task = tasks[index];
    const nextDone = !task.done;
    const completedAt = nextDone ? new Date().toISOString() : null;
    const next = tasks.map((item, itemIndex) =>
      itemIndex === index
        ? { ...item, done: nextDone, completedAt, timeTaken: "" }
        : item,
    );
    setTasks(next);

    const storageKey = `todo-widget-completed:${date}`;
    let completed: WidgetTask[] = [];
    try {
      completed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      completed = [];
    }
    localStorage.setItem(
      storageKey,
      JSON.stringify(
        nextDone
          ? [
              ...completed.filter((item) => item.text !== task.text),
              { text: task.text, done: true, completedAt, timeTaken: "" },
            ]
          : completed.filter((item) => item.text !== task.text),
      ),
    );
    try {
      const updatedExactly = await updateSingleTask(task, {
        done: nextDone,
        completedAt,
        timeTaken: "",
      });
      if (!updatedExactly) {
        await axios.post(
          `${API}/me/todos`,
          { date, items: next, silent: true },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }
    } catch {
      setTasks(tasks);
      setStatus("Could not update this task.");
    }
  };

  const scheduleForTomorrow = async (index: number) => {
    if (!token || !tasks[index]) return;
    const task = tasks[index];
    if (task.done) return;
    const tomorrow = nextDayKey();
    const remainingToday = tasks.filter((_, itemIndex) => itemIndex !== index);
    const movedTask = {
      ...task,
      done: false,
      completedAt: null,
      scheduledFor: tomorrow,
    };
    setTasks(remainingToday);
    setUpcomingTasks((prev) => [
      ...prev,
      { ...movedTask, date: tomorrow } as any,
    ]);
    await saveTasksToBackend(remainingToday, date);
    await saveTasksToBackend([movedTask], tomorrow);
  };

  const remaining = tasks.filter((task) => !task.done).length;

  if (!expanded) {
    return (
      <div
        style={
          {
            WebkitAppRegion: "drag",
            width: "100vw",
            height: "100vh",
            padding: 5,
            position: "relative",
            boxSizing: "border-box",
            background: "transparent",
            overflow: "hidden",
          } as React.CSSProperties
        }
      >
        <div
          title="Drag this Todo widget"
          style={
            {
              WebkitAppRegion: "drag",
              width: "100%",
              height: "100%",
              border: "1px solid rgba(255,255,255,.42)",
              borderRadius: 22,
              color: "#fff",
              cursor: "grab",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 5px 9px",
              boxSizing: "border-box",
              background: hovered
                ? "linear-gradient(180deg, rgba(79,70,229,.96), rgba(37,99,235,.94))"
                : "linear-gradient(180deg, rgba(37,99,235,.86), rgba(67,56,202,.84))",
              backdropFilter: "blur(12px)",
              boxShadow: "0 8px 24px rgba(37,99,235,.26)",
              transition: "filter .18s ease, background .18s ease",
            } as React.CSSProperties
          }
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <GripVertical size={14} style={{ opacity: 0.78 }} />
          <button
            type="button"
            aria-label="Open pinned Todo list"
            title="Open Todo list"
            onClick={() => setWidgetExpanded(true)}
            style={
              {
                WebkitAppRegion: "no-drag",
                width: 34,
                height: 34,
                border: "1px solid rgba(255,255,255,.35)",
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                background: "rgba(255,255,255,.14)",
                cursor: "pointer",
              } as React.CSSProperties
            }
          >
            <ListTodo size={19} />
          </button>
          <span
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.1,
            }}
          >
            TODO
          </span>
          <span
            style={{
              minWidth: 21,
              height: 21,
              padding: "0 4px",
              borderRadius: 11,
              display: "grid",
              placeItems: "center",
              fontSize: 10,
              fontWeight: 800,
              color: "#1d4ed8",
              background: "rgba(255,255,255,.94)",
            }}
          >
            {remaining}
          </span>
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        height: "100vh",
        background:
          "linear-gradient(145deg, rgba(239,246,255,.9) 0%, rgba(248,250,252,.86) 48%, rgba(238,242,255,.9) 100%)",
        backdropFilter: "blur(18px)",
        padding: 11,
        fontFamily: "Inter, system-ui, sans-serif",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={
          {
            WebkitAppRegion: "drag",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderRadius: 12,
            padding: "9px 10px",
            color: "#fff",
            background: "linear-gradient(135deg, #2563eb, #4f46e5)",
            boxShadow: "0 8px 20px rgba(37,99,235,.22)",
          } as React.CSSProperties
        }
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Today</h1>
          <p style={{ margin: "2px 0 0", fontSize: 10, opacity: 0.82 }}>
            {remaining} remaining · completion time is captured
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWidgetExpanded(false)}
          style={
            {
              WebkitAppRegion: "no-drag",
              border: 0,
              borderRadius: 7,
              width: 26,
              height: 26,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              background: "rgba(255,255,255,.16)",
              cursor: "pointer",
            } as React.CSSProperties
          }
          aria-label="Collapse pinned Todo"
        >
          <ChevronRight size={15} />
        </button>
        <button
          onClick={() => (window as any).electronAPI?.closeTodoWidget?.()}
          style={
            {
              WebkitAppRegion: "no-drag",
              border: 0,
              borderRadius: 7,
              width: 26,
              height: 26,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              background: "rgba(255,255,255,.16)",
              cursor: "pointer",
            } as React.CSSProperties
          }
          aria-label="Close pinned Todo"
        >
          <X size={14} />
        </button>
      </header>

      <div
        style={{
          marginTop: 9,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflowY: "auto",
          overflowX: "hidden",
          paddingRight: 3,
          paddingBottom: 4,
          scrollbarGutter: "stable",
        }}
      >
        {status ? (
          <p style={{ color: "#64748b", fontSize: 11, padding: "8px 3px", textAlign: "center" }}>
            {status}
          </p>
        ) : (
          <>
            {tasks.map((task, index) => {
          const isEditing = editingIndex === index;
          return (
            <div
              key={`${task.text}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                width: "100%",
                padding: "9px 10px",
                border: task.done ? "1px solid #bbf7d0" : "1px solid #dbe4f0",
                borderRadius: 10,
                background: task.done
                  ? "rgba(240,253,244,.9)"
                  : "rgba(255,255,255,.94)",
                color: task.done ? "#64748b" : "#1e293b",
                textAlign: "left",
                boxShadow: "0 2px 7px rgba(15,23,42,.05)",
              }}
            >
              <button
                type="button"
                onClick={() => void toggleTask(index)}
                style={{
                  width: 20,
                  height: 20,
                  flex: "0 0 auto",
                  borderRadius: 7,
                  display: "grid",
                  placeItems: "center",
                  border: task.done ? "1px solid #22c55e" : "1px solid #94a3b8",
                  background: task.done ? "#22c55e" : "#fff",
                  color: "#fff",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {task.done ? <Check size={13} strokeWidth={3} /> : null}
              </button>
              
              {isEditing ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(index);
                    else if (e.key === "Escape") setEditingIndex(null);
                  }}
                  onBlur={() => saveEdit(index)}
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    padding: "2px 4px",
                    border: "1px solid #2563eb",
                    borderRadius: 4,
                    outline: "none",
                  }}
                  placeholder="Type task..."
                />
              ) : (
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      fontWeight: 650,
                      textDecoration: task.done ? "line-through" : "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setEditingIndex(index);
                      setEditText(task.text);
                    }}
                  >
                    {task.text}
                  </span>
                  {task.done && task.completedAt ? (
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        fontSize: 9.5,
                        color: "#16a34a",
                      }}
                    >
                      Completed at {completionTime(task.completedAt)}
                    </span>
                  ) : null}
                </span>
              )}

              <div style={{ display: "flex", gap: 4 }}>
                {!task.done && (
                  <button
                    type="button"
                    onClick={() => void scheduleForTomorrow(index)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#2563eb" }}
                    title="Schedule for tomorrow"
                  >
                    ↷
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingIndex(index);
                    setEditText(task.text);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#64748b" }}
                  title="Edit"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => deleteTask(index)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#ef4444" }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        
        <button
          onClick={addTask}
          style={{
            marginTop: 4,
            padding: "8px",
            background: "rgba(255,255,255,0.7)",
            border: "1px dashed #cbd5e1",
            borderRadius: 8,
            color: "#3b82f6",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Task
        </button>
        {upcomingTasks.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "#475569",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 0.7,
                textTransform: "uppercase",
                margin: "4px 2px 6px",
              }}
            >
              <CalendarDays size={12} /> Upcoming tasks
            </div>
            {upcomingTasks.slice(0, 8).map((task, index) => (
              <div
                key={`${task.scheduledFor || (task as any).date}-${task.text}-${index}`}
                style={{
                  padding: "8px 10px",
                  border: "1px solid #e0e7ff",
                  borderRadius: 10,
                  background: "rgba(238,242,255,.9)",
                  color: "#334155",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.text}
                </div>
                <div style={{ marginTop: 3, fontSize: 9.5, color: "#6366f1", fontWeight: 800 }}>
                  {formatDate(task.scheduledFor || (task as any).date)}
                  {task.deadlineAt ? ` · deadline ${formatDeadline(task.deadlineAt)}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </main>
  );
}
