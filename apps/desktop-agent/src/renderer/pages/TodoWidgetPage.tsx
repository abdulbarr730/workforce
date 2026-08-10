import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";
import { getLocalDateKey } from "../../shared/daily-flow";

const API =
  import.meta.env.VITE_API_BASE_URL || "https://api.prosyncedu.com/api";
type WidgetTask = { text: string; done: boolean; timeTaken?: string };

const elapsedDuration = (startedAt: number) => {
  const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
};

export function TodoWidgetPage() {
  const { token } = useAuth();
  const date = getLocalDateKey();
  const [tasks, setTasks] = useState<WidgetTask[]>([]);
  const [runningTask, setRunningTask] = useState("");
  const [status, setStatus] = useState("Loading...");

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

  const startTask = (text: string) => {
    setRunningTask(text);
    localStorage.setItem(
      `todo-widget-start:${date}:${text}`,
      String(Date.now()),
    );
  };

  const completeTask = async (index: number) => {
    if (!token) return;
    const task = tasks[index];
    const startedAt = Number(
      localStorage.getItem(`todo-widget-start:${date}:${task.text}`),
    );
    const timeTaken = startedAt
      ? elapsedDuration(startedAt)
      : task.timeTaken || "";
    const next = tasks.map((item, itemIndex) =>
      itemIndex === index ? { ...item, done: true, timeTaken } : item,
    );
    setTasks(next);
    setRunningTask((current) => (current === task.text ? "" : current));
    const storageKey = `todo-widget-completed:${date}`;
    const completed = JSON.parse(
      localStorage.getItem(storageKey) || "[]",
    ) as WidgetTask[];
    localStorage.setItem(
      storageKey,
      JSON.stringify([
        ...completed.filter((item) => item.text !== task.text),
        { text: task.text, done: true, timeTaken },
      ]),
    );
    await axios.post(
      `${API}/me/todos`,
      { date, items: next },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: 14,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>
            Pinned Todo
          </h1>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "#64748b" }}>
            Stays above other applications
          </p>
        </div>
        <button
          onClick={() => (window as any).electronAPI?.closeTodoWidget?.()}
          style={{
            border: 0,
            background: "transparent",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </header>
      {status ? (
        <p style={{ color: "#64748b", fontSize: 12 }}>{status}</p>
      ) : null}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {tasks.map((task, index) => (
          <div
            key={`${task.text}-${index}`}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 12,
                color: "#1e293b",
              }}
            >
              <input
                type="checkbox"
                checked={task.done}
                disabled={task.done}
                onChange={() => void completeTask(index)}
              />
              <span
                style={{
                  textDecoration: task.done ? "line-through" : "none",
                  flex: 1,
                }}
              >
                {task.text}
              </span>
            </label>
            {!task.done ? (
              <button
                onClick={() => startTask(task.text)}
                style={{
                  marginTop: 8,
                  border: "1px solid #bfdbfe",
                  background: runningTask === task.text ? "#dbeafe" : "#eff6ff",
                  color: "#1d4ed8",
                  borderRadius: 7,
                  padding: "5px 9px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {runningTask === task.text ? "Timer running" : "Start timer"}
              </button>
            ) : task.timeTaken ? (
              <p
                style={{
                  margin: "6px 0 0 24px",
                  fontSize: 10,
                  color: "#059669",
                }}
              >
                Completed in {task.timeTaken}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
