import { useEffect, useState } from "react";
import axios from "axios";
import { Check, ChevronRight, ListTodo, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getLocalDateKey } from "../../shared/daily-flow";

const API =
  import.meta.env.VITE_API_BASE_URL || "https://api.prosyncedu.com/api";
type WidgetTask = {
  text: string;
  done: boolean;
  timeTaken?: string;
  completedAt?: string | null;
};

const completionTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export function TodoWidgetPage() {
  const { token } = useAuth();
  const date = getLocalDateKey();
  const [tasks, setTasks] = useState<WidgetTask[]>([]);
  const [status, setStatus] = useState("Loading today's tasks...");
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const setWidgetExpanded = (next: boolean) => {
    setExpanded(next);
    void (window as any).electronAPI?.setTodoWidgetExpanded?.(next);
  };

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API}/me/todos/today?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        setTasks(
          Array.isArray(response.data?.data?.items)
            ? response.data.data.items
            : [],
        );
        setStatus("");
      })
      .catch(() => setStatus("Could not load today's Todo list."));
  }, [date, token]);

  const completeTask = async (index: number) => {
    if (!token || tasks[index].done) return;
    const completedAt = new Date().toISOString();
    const task = tasks[index];
    const next = tasks.map((item, itemIndex) =>
      itemIndex === index
        ? { ...item, done: true, completedAt, timeTaken: "" }
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
      JSON.stringify([
        ...completed.filter((item) => item.text !== task.text),
        { text: task.text, done: true, completedAt, timeTaken: "" },
      ]),
    );
    await axios.post(
      `${API}/me/todos`,
      { date, items: next, silent: true },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  };

  const remaining = tasks.filter((task) => !task.done).length;

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label="Open pinned Todo list"
        onMouseEnter={() => {
          setHovered(true);
          setWidgetExpanded(true);
        }}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setWidgetExpanded(true)}
        style={{
          width: "100vw",
          height: "100vh",
          border: 0,
          borderRadius: "18px 0 0 18px",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          background: hovered
            ? "linear-gradient(180deg, #4f46e5, #2563eb)"
            : "linear-gradient(180deg, #2563eb, #4338ca)",
          boxShadow: "-7px 8px 24px rgba(37,99,235,.3)",
          transition: "transform .18s ease, filter .18s ease",
        }}
      >
        <ListTodo size={21} />
        <span
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.2,
          }}
        >
          TODO
        </span>
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: "0 4px",
            borderRadius: 11,
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            fontWeight: 800,
            color: "#1d4ed8",
            background: "#fff",
          }}
        >
          {remaining}
        </span>
      </button>
    );
  }

  return (
    <main
      onMouseLeave={() => setWidgetExpanded(false)}
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg, #eff6ff 0%, #f8fafc 48%, #eef2ff 100%)",
        padding: 11,
        fontFamily: "Inter, system-ui, sans-serif",
        boxSizing: "border-box",
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

      {status ? (
        <p style={{ color: "#64748b", fontSize: 11, padding: "8px 3px" }}>
          {status}
        </p>
      ) : null}
      <div
        style={{
          marginTop: 9,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {tasks.map((task, index) => (
          <button
            key={`${task.text}-${index}`}
            type="button"
            disabled={task.done}
            onClick={() => void completeTask(index)}
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
              cursor: task.done ? "default" : "pointer",
              boxShadow: "0 2px 7px rgba(15,23,42,.05)",
            }}
          >
            <span
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
              }}
            >
              {task.done ? <Check size={13} strokeWidth={3} /> : null}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 11.5,
                  fontWeight: 650,
                  textDecoration: task.done ? "line-through" : "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
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
          </button>
        ))}
      </div>
    </main>
  );
}
