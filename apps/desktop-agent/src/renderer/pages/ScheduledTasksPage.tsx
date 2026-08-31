import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowLeft, CalendarDays, CheckCircle2, Pencil, Trash2 } from "lucide-react";
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

export const ScheduledTasksPage = () => {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 24 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <button
          onClick={() => (window.location.hash = "/")}
          style={{
            border: "1px solid #e2e8f0",
            background: "#fff",
            borderRadius: 999,
            padding: "9px 14px",
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            cursor: "pointer",
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          <ArrowLeft size={16} /> Back to dashboard
        </button>

        <div
          style={{
            marginTop: 18,
            borderRadius: 28,
            padding: 24,
            color: "#fff",
            background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
            boxShadow: "0 18px 40px rgba(79,70,229,.22)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                height: 52,
                width: 52,
                borderRadius: 18,
                background: "rgba(255,255,255,.18)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <CalendarDays />
            </div>
            <div>
              <p style={{ margin: 0, opacity: 0.82, fontWeight: 700 }}>
                Schedule workspace
              </p>
              <h1 style={{ margin: "4px 0 0", fontSize: 30 }}>
                Tasks, reminders & deadlines
              </h1>
            </div>
            <button
              onClick={() => {
                const tomorrow = addDays(getLocalDateKey(), 1);
                setCreating(true);
                setEdit({
                  text: "",
                  scheduledFor: tomorrow,
                  deadlineDate: "",
                  deadlineTime: "",
                  reminderTime: "09:30",
                  estimatedTime: "",
                  deadlineReminderFrequency: "OFF",
                });
              }}
              style={{
                marginLeft: "auto",
                border: "1px solid rgba(255,255,255,.3)",
                background: "rgba(255,255,255,.18)",
                color: "#fff",
                borderRadius: 14,
                padding: "11px 14px",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              + New scheduled task
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ marginTop: 20, color: "#64748b" }}>Loading schedule…</div>
        ) : tasks.length === 0 ? (
          <div
            style={{
              marginTop: 20,
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 22,
              padding: 28,
              color: "#64748b",
            }}
          >
            No scheduled tasks yet. Add one from the To-Do modal calendar icon.
          </div>
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
