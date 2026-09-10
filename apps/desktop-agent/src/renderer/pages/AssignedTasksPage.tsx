import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock3,
  Loader2,
  PlayCircle,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getLocalDateKey } from "../../shared/daily-flow";

const API =
  import.meta.env.VITE_API_BASE_URL || "https://api.prosyncedu.com/api";

type AssignedTaskStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type AssignedTask = {
  id: string;
  taskId: string;
  title: string;
  description?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: AssignedTaskStatus;
  assignedByName?: string;
  scheduledFor?: string;
  deadlineAt?: string | null;
  reminderAt?: string | null;
  estimatedTime?: string;
  actualTime?: string;
  completionNote?: string;
  addToTodo?: boolean;
  autoAddToEodOnComplete?: boolean;
  todoItemTaskId?: string;
  eodAddedAt?: string | null;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
};

const statusLabels: Record<AssignedTaskStatus | "ALL", string> = {
  ALL: "All",
  REQUESTED: "Requests",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const statusColors: Record<AssignedTaskStatus, string> = {
  REQUESTED: "#f59e0b",
  ACCEPTED: "#2563eb",
  IN_PROGRESS: "#7c3aed",
  COMPLETED: "#059669",
  CANCELLED: "#64748b",
};

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: value.includes("T") ? "2-digit" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined,
  });
}

function taskSortValue(task: AssignedTask) {
  const source = task.deadlineAt || task.scheduledFor || task.createdAt || "";
  const date = new Date(source.includes("T") ? source : `${source}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export const AssignedTasksPage = () => {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [status, setStatus] = useState<AssignedTaskStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token],
  );

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const loadTasks = useCallback(async () => {
    if (!headers) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/assigned-tasks/mine`, {
        headers,
      });
      setTasks(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      console.error("Failed to load assigned tasks", error);
      showNotice("Could not load assigned tasks. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void loadTasks();
    const timer = window.setInterval(() => void loadTasks(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadTasks]);

  const counts = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        acc.ALL += 1;
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      },
      {
        ALL: 0,
        REQUESTED: 0,
        ACCEPTED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        CANCELLED: 0,
      } as Record<AssignedTaskStatus | "ALL", number>,
    );
  }, [tasks]);

  const orderedTasks = useMemo(
    () =>
      tasks
        .filter((task) => status === "ALL" || task.status === status)
        .sort((a, b) => {
        if (a.status === "COMPLETED" && b.status !== "COMPLETED") return 1;
        if (a.status !== "COMPLETED" && b.status === "COMPLETED") return -1;
        return taskSortValue(a) - taskSortValue(b);
      }),
    [status, tasks],
  );

  const updateTask = async (id: string, patch: Record<string, unknown>) => {
    if (!headers) return;
    setSavingId(id);
    try {
      const response = await axios.patch(`${API}/assigned-tasks/${id}`, patch, {
        headers,
      });
      const updated = response.data?.data as AssignedTask;
      setTasks((current) =>
        current.map((task) => (task.id === id ? updated : task)),
      );
      showNotice("Assigned task updated.");
    } catch (error) {
      console.error("Failed to update assigned task", error);
      showNotice("Could not update this task.");
    } finally {
      setSavingId(null);
    }
  };

  const completeTask = async (task: AssignedTask) => {
    const actualTime =
      window.prompt(
        "Actual time spent? This will be used in Todo/EOD. Example: 45m or 1h 20m",
        task.actualTime || task.estimatedTime || "",
      ) || "";
    const completionNote =
      window.prompt("Completion note for manager/EOD (optional)", "") || "";
    await updateTask(task.id, {
      status: "COMPLETED",
      actualTime,
      completionNote,
      addToTodoNow: true,
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#f8fafc,#eef2ff)",
        color: "#0f172a",
        padding: 24,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={() => (window.location.hash = "/")}
            style={ghostButton}
          >
            <ArrowLeft size={17} /> Back to dashboard
          </button>
          <button onClick={loadTasks} style={ghostButton} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <section
          style={{
            borderRadius: 24,
            padding: 24,
            background: "linear-gradient(135deg,#312e81,#7c3aed)",
            color: "#fff",
            boxShadow: "0 24px 70px rgba(79,70,229,.22)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={heroIcon}>
              <ClipboardList size={28} />
            </div>
            <div>
              <p style={{ margin: 0, opacity: 0.76, fontWeight: 800 }}>
                Manager assigned work
              </p>
              <h1 style={{ margin: "3px 0 0", fontSize: 30 }}>
                Assigned Tasks
              </h1>
              <p style={{ margin: "8px 0 0", opacity: 0.78, maxWidth: 760 }}>
                Accept tasks from managers, start them when you begin, add them
                to your Todo, and complete them so EOD can pick up the real work.
              </p>
            </div>
          </div>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10,
          }}
        >
          {(Object.keys(statusLabels) as (AssignedTaskStatus | "ALL")[]).map(
            (key) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                style={{
                  border: key === status ? "2px solid #4f46e5" : "1px solid #e2e8f0",
                  borderRadius: 16,
                  background: "#fff",
                  padding: "13px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                  boxShadow:
                    key === status ? "0 12px 30px rgba(79,70,229,.14)" : "none",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 950 }}>
                  {counts[key] || 0}
                </div>
                <div style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
                  {statusLabels[key]}
                </div>
              </button>
            ),
          )}
        </div>

        <section style={card}>
          {loading ? (
            <div style={emptyState}>
              <Loader2 className="spin" size={28} />
              Loading assigned tasks…
            </div>
          ) : orderedTasks.length === 0 ? (
            <div style={emptyState}>
              <ClipboardList size={32} color="#94a3b8" />
              No assigned tasks in this view.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {orderedTasks.map((task) => (
                <article key={task.id} style={taskCard}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        flexWrap: "wrap",
                      }}
                    >
                      {task.status === "COMPLETED" ? (
                        <CheckCircle2 size={18} color="#059669" />
                      ) : (
                        <Circle size={18} color={statusColors[task.status]} />
                      )}
                      <h2 style={{ margin: 0, fontSize: 18 }}>{task.title}</h2>
                      <span
                        style={{
                          ...pill,
                          color: statusColors[task.status],
                          background: `${statusColors[task.status]}16`,
                        }}
                      >
                        {statusLabels[task.status]}
                      </span>
                      <span style={pill}>{task.priority || "NORMAL"}</span>
                    </div>

                    {task.description && (
                      <p
                        style={{
                          margin: 0,
                          color: "#475569",
                          lineHeight: 1.55,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {task.description}
                      </p>
                    )}

                    <div style={metaGrid}>
                      <span>
                        <CalendarClock size={14} /> Scheduled:{" "}
                        {formatDate(task.scheduledFor)}
                      </span>
                      <span>
                        <Clock3 size={14} /> Deadline:{" "}
                        {formatDate(task.deadlineAt)}
                      </span>
                      <span>From: {task.assignedByName || "Manager"}</span>
                      <span>
                        Time: {task.actualTime || task.estimatedTime || "Not set"}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {task.todoItemTaskId && (
                        <span style={{ ...pill, color: "#2563eb" }}>
                          Added to Todo
                        </span>
                      )}
                      {task.eodAddedAt && (
                        <span style={{ ...pill, color: "#059669" }}>
                          Added to EOD
                        </span>
                      )}
                      {task.autoAddToEodOnComplete && (
                        <span style={pill}>EOD auto-link on completion</span>
                      )}
                    </div>
                  </div>

                  <div style={actions}>
                    {task.status === "REQUESTED" && (
                      <button
                        onClick={() =>
                          updateTask(task.id, { status: "ACCEPTED" })
                        }
                        disabled={savingId === task.id}
                        style={primaryButton}
                      >
                        <CheckCircle2 size={16} /> Accept
                      </button>
                    )}
                    {["REQUESTED", "ACCEPTED"].includes(task.status) && (
                      <button
                        onClick={() =>
                          updateTask(task.id, {
                            status: "IN_PROGRESS",
                            addToTodoNow: true,
                          })
                        }
                        disabled={savingId === task.id}
                        style={secondaryButton}
                      >
                        <PlayCircle size={16} /> Start
                      </button>
                    )}
                    {!task.todoItemTaskId && task.status !== "CANCELLED" && (
                      <button
                        onClick={() => updateTask(task.id, { addToTodoNow: true })}
                        disabled={savingId === task.id}
                        style={secondaryButton}
                      >
                        <PlusCircle size={16} /> Add to Todo
                      </button>
                    )}
                    {task.status !== "COMPLETED" &&
                      task.status !== "CANCELLED" && (
                      <button
                        onClick={() => completeTask(task)}
                        disabled={savingId === task.id}
                        style={doneButton}
                      >
                        <CheckCircle2 size={16} /> Complete
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {notice && <div style={toast}>{notice}</div>}
    </div>
  );
};

const heroIcon: React.CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: 18,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.14)",
  border: "1px solid rgba(255,255,255,.18)",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 16px 45px rgba(15,23,42,.07)",
};

const taskCard: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  gap: 16,
  background: "#fff",
};

const metaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 8,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 750,
};

const pill: React.CSSProperties = {
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#475569",
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 900,
};

const actions: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 8,
  minWidth: 140,
};

const baseButton: React.CSSProperties = {
  border: "1px solid rgba(15,23,42,.08)",
  borderRadius: 12,
  padding: "10px 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  cursor: "pointer",
  fontWeight: 900,
};

const primaryButton: React.CSSProperties = {
  ...baseButton,
  background: "#4f46e5",
  color: "#fff",
};

const secondaryButton: React.CSSProperties = {
  ...baseButton,
  background: "#eef2ff",
  color: "#3730a3",
};

const doneButton: React.CSSProperties = {
  ...baseButton,
  background: "#ecfdf5",
  color: "#047857",
};

const ghostButton: React.CSSProperties = {
  ...baseButton,
  background: "#fff",
  color: "#334155",
};

const emptyState: React.CSSProperties = {
  minHeight: 220,
  display: "grid",
  placeItems: "center",
  gap: 10,
  color: "#64748b",
  fontWeight: 800,
};

const toast: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  zIndex: 10000,
  borderRadius: 12,
  background: "#0f172a",
  color: "#fff",
  padding: "10px 14px",
  boxShadow: "0 12px 30px rgba(15,23,42,.28)",
  fontSize: 12,
  fontWeight: 750,
};
