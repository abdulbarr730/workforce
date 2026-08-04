import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { CheckCircle2, Clock, Plus, Trash2, X, AlertCircle } from "lucide-react";

export const formatToHHMM = (val: string) => {
  if (!val) return val;
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (val.includes(":")) return val;
  if (val.toLowerCase().includes("h") || val.toLowerCase().includes("m"))
    return val;

  const totalMinutes = Math.round(num * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

interface TaskItem {
  id: string;
  text: string;
  timeTaken: string;
  isTopTask?: boolean;
  done: boolean;
}

interface CheckinModalProps {
  token: string;
  intervalLabel: string;
  onClose: () => void;
  onSnooze: () => void;
  onSubmitted?: () => void;
}

export const CheckinModal: React.FC<CheckinModalProps> = ({
  token,
  intervalLabel,
  onClose,
  onSnooze,
  onSubmitted,
}) => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 4000);
  };

  useEffect(() => {
    const fetchTodayTasks = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_BASE_URL}/me/todos/today`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const existing = res.data?.data?.items;
        if (Array.isArray(existing) && existing.length > 0) {
          setTasks(
            existing.map((t: any) => ({
              id: crypto.randomUUID(),
              text: t.text || "",
              timeTaken:
                t.timeTaken ||
                t.estimatedTime ||
                (existing.length === 1 ? intervalLabel || "2h" : ""),
              isTopTask: !!t.isTopTask,
              done: !!t.done,
            })),
          );
        } else {
          setTasks([
            {
              id: crypto.randomUUID(),
              text: "",
              timeTaken: intervalLabel || "2h",
              isTopTask: true,
              done: false,
            },
          ]);
        }
      } catch {
        setTasks([
          {
            id: crypto.randomUUID(),
            text: "",
            timeTaken: intervalLabel || "2h",
            isTopTask: true,
            done: false,
          },
        ]);
      }
    };
    fetchTodayTasks();
  }, [token, intervalLabel]);

  const handleToggleDone = (index: number) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], done: !next[index].done };
      return next;
    });
  };

  const handleUpdateText = (index: number, text: string) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text };
      return next;
    });
  };

  const handleUpdateTime = (index: number, timeTaken: string) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], timeTaken };
      return next;
    });
  };

  const handleAddRow = () => {
    setTasks((prev) => {
      const next = [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: "",
          timeTaken: "",
          isTopTask: false,
          done: false,
        },
      ];
      setTimeout(() => {
        if (inputRefs.current[next.length - 1]) {
          inputRefs.current[next.length - 1]?.focus();
        }
      }, 50);
      return next;
    });
  };

  const handleRemoveRow = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const valid = tasks.filter((t) => t.text.trim().length > 0);
    if (valid.length === 0) {
      return showError("Please list at least one task you worked on.");
    }

    // Check mandatory duration for ALL tasks
    const missingDuration = valid.some(
      (t) => !t.timeTaken || t.timeTaken.trim() === "",
    );
    if (missingDuration) {
      return showError(
        "Time duration is mandatory for all tasks! (e.g. 1h 30m, 45m, 2h)",
      );
    }

    const completedTaskTexts = valid
      .filter((t) => t.done)
      .map((t) => `${t.text} (${t.timeTaken.trim()})`);

    setLoading(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/me/todos/checkin`,
        {
          interval: intervalLabel,
          completedTasks: completedTaskTexts,
          notes,
          timeSpent: valid
            .map((t) => `${t.text}: ${t.timeTaken}`)
            .join(", "),
          items: valid.map((t) => ({
            text: t.text.trim(),
            timeTaken: t.timeTaken.trim(),
            isTopTask: !!t.isTopTask,
            done: t.done,
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // Automatically sync completed items into the EOD draft with timestamps
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const existingDraftStr = localStorage.getItem("eod_draft_v2");
        let draftRows: any[] = [];
        if (existingDraftStr) {
          const parsed = JSON.parse(existingDraftStr);
          if (parsed.date === todayStr && Array.isArray(parsed.rows)) {
            draftRows = parsed.rows.filter(
              (r: any) => r.task && r.task.trim() !== "",
            );
          }
        }
        valid.forEach((t) => {
          const stampedTask = intervalLabel
            ? `${t.text.trim()} (${intervalLabel})`
            : t.text.trim();
          const alreadyExists = draftRows.some(
            (r: any) =>
              r.task === stampedTask || r.task.startsWith(t.text.trim()),
          );
          if (!alreadyExists) {
            draftRows.push({
              id: crypto.randomUUID(),
              task: stampedTask,
              hours: formatToHHMM(t.timeTaken) || "02:00",
              isTopTask: !!t.isTopTask,
            });
          }
        });
        if (draftRows.length > 0) {
          localStorage.setItem(
            "eod_draft_v2",
            JSON.stringify({ date: todayStr, rows: draftRows }),
          );
        }
      } catch (e) {
        console.error("Failed to sync checkin to EOD draft", e);
      }

      if (onSubmitted) onSubmitted();
      onClose();
    } catch (err: any) {
      showError(
        err?.response?.data?.message ||
          "Failed to save check-in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          width: 780,
          maxWidth: "92vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                ⏱️ 2-Hour Work Check-in
              </h2>
              {intervalLabel && (
                <span
                  style={{
                    background: "#eff6ff",
                    color: "#2563eb",
                    border: "1px solid #bfdbfe",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "2px 10px",
                    borderRadius: 9999,
                  }}
                >
                  {intervalLabel}
                </span>
              )}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
              Please record your completed tasks and time taken for this 2-hour window.
            </p>
          </div>
          <button
            onClick={onSnooze}
            title="Remind in 10 mins"
            style={{
              border: "none",
              background: "transparent",
              color: "#94a3b8",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              margin: "12px 24px 0",
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              color: "#b91c1c",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div
          style={{
            padding: "16px 24px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                Tasks Completed in this Interval
                <span
                  style={{
                    color: "#dc2626",
                    marginLeft: 6,
                    fontWeight: 400,
                    fontSize: 12,
                  }}
                >
                  * Time duration is mandatory for all tasks
                </span>
              </span>
              <button
                type="button"
                onClick={handleAddRow}
                style={{
                  border: "none",
                  background: "#eff6ff",
                  color: "#2563eb",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Task
              </button>
            </div>

            {/* Table layout with 3 clear sections: Timestamp, Task Description, Time Taken */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                        width: 140,
                      }}
                    >
                      Time Stamp
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Task Description
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                        width: 130,
                      }}
                    >
                      Time Taken *
                    </th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task, idx) => (
                    <tr
                      key={task.id || idx}
                      style={{
                        borderBottom:
                          idx < tasks.length - 1 ? "1px solid #f1f5f9" : "none",
                        background: task.done ? "#f0fdf4" : "#ffffff",
                      }}
                    >
                      {/* Left: Time Stamp / Interval Tag */}
                      <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                        <span
                          style={{
                            background: "#f1f5f9",
                            color: "#475569",
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #e2e8f0",
                            display: "inline-block",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {intervalLabel || "Current Interval"}
                        </span>
                      </td>

                      {/* Middle: Checkbox + Task description */}
                      <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleToggleDone(idx)}
                            style={{
                              border: "none",
                              background: task.done ? "#10b981" : "#f1f5f9",
                              color: task.done ? "#ffffff" : "#94a3b8",
                              borderRadius: 6,
                              padding: 4,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title={
                              task.done ? "Mark as in-progress" : "Mark as completed"
                            }
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <input
                            ref={(el) => {
                              inputRefs.current[idx] = el;
                            }}
                            type="text"
                            value={task.text}
                            onChange={(e) => handleUpdateText(idx, e.target.value)}
                            placeholder="e.g. Finished CRM Webhook API"
                            style={{
                              width: "100%",
                              padding: "7px 10px",
                              borderRadius: 6,
                              border: "1px solid #cbd5e1",
                              fontSize: 13,
                              color: task.done ? "#94a3b8" : "#1e293b",
                              textDecoration: task.done ? "line-through" : "none",
                              boxSizing: "border-box",
                              outline: "none",
                              background: task.done ? "#f8fafc" : "#ffffff",
                            }}
                          />
                        </div>
                      </td>

                      {/* Right: Duration / Time Taken */}
                      <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: 6,
                            padding: "4px 8px",
                          }}
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <input
                            type="text"
                            value={task.timeTaken}
                            onChange={(e) => handleUpdateTime(idx, e.target.value)}
                            placeholder="e.g. 2h / 45m"
                            title="Enter duration taken (e.g. 2h, 45m, 1h 15m)"
                            style={{
                              width: "100%",
                              border: "none",
                              outline: "none",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#d97706",
                              textAlign: "right",
                              background: "transparent",
                            }}
                          />
                        </div>
                      </td>

                      {/* Delete */}
                      <td
                        style={{
                          padding: "8px 8px",
                          verticalAlign: "middle",
                          textAlign: "center",
                        }}
                      >
                        {tasks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#94a3b8",
                              cursor: "pointer",
                              padding: 4,
                              borderRadius: 4,
                            }}
                            title="Remove task"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Progress Notes */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "#475569",
                marginBottom: 6,
              }}
            >
              Quick Notes / Blockers / Next Focus{" "}
              <span style={{ fontWeight: 400, color: "#94a3b8" }}>(Optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any quick notes or what you are focusing on next..."
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontSize: 13,
                color: "#1e293b",
                boxSizing: "border-box",
                outline: "none",
                resize: "none",
                background: "#f8fafc",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <button
            type="button"
            onClick={onSnooze}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Remind in 10 mins
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: "9px 20px",
              borderRadius: 6,
              border: "none",
              background: "#2563eb",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              boxShadow: "0 2px 4px rgba(37,99,235,0.2)",
            }}
          >
            {loading ? "Saving..." : "Save Progress & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
};
