import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { getLocalDateKey } from "../../shared/daily-flow";

export const TodoModal = React.memo(
  ({ token, onClose }: { token: string; onClose: () => void }) => {
    const [tasks, setTasks] = useState<
      {
        id: string;
        text: string;
        done: boolean;
        scheduledFor: string;
        deadlineDate: string;
        deadlineTime: string;
        reminderTime: string;
        remindDailyUntilDeadline: boolean;
        deadlineReminderFrequency: "OFF" | "DAILY" | "EVERY_2_DAYS" | "WEEKLY";
        showSchedule: boolean;
      }[]
    >([
      {
        id: crypto.randomUUID(),
        text: "",
        done: false,
        scheduledFor: getLocalDateKey(),
        deadlineDate: "",
        deadlineTime: "",
        reminderTime: "",
        remindDailyUntilDeadline: false,
        deadlineReminderFrequency: "OFF",
        showSchedule: false,
      },
    ]);
    const [loading, setLoading] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);
    const [fetching, setFetching] = useState(true);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const showError = (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 3000);
    };

    useEffect(() => {
      setFetching(true);
      axios
        .get(
          `${import.meta.env.VITE_API_BASE_URL}/me/todos/today?date=${getLocalDateKey()}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        )
        .then((r) => {
          const existing = r.data?.data?.items;
          if (Array.isArray(existing) && existing.length > 0) {
            setTasks(
              existing.map((t: any) => ({
                ...t,
                id: t.id || crypto.randomUUID(),
                text: t.text || "",
                done: !!t.done,
                scheduledFor: t.scheduledFor || getLocalDateKey(),
                deadlineDate: t.deadlineAt
                  ? new Date(t.deadlineAt).toISOString().slice(0, 10)
                  : "",
                deadlineTime: t.deadlineAt
                  ? new Date(t.deadlineAt).toTimeString().slice(0, 5)
                  : "",
                reminderTime: t.reminderAt
                  ? new Date(t.reminderAt).toTimeString().slice(0, 5)
                  : "",
                remindDailyUntilDeadline: !!t.remindDailyUntilDeadline,
                deadlineReminderFrequency: t.remindDailyUntilDeadline
                  ? "DAILY"
                  : t.deadlineReminderFrequency || "OFF",
                showSchedule: false,
              })),
            );
          }
        })
        .catch(() => {})
        .finally(() => {
          setFetching(false);
        });
    }, [token]);

    const handleAddRow = () => {
      setTasks((prev) => {
        const next = [
          ...prev,
          {
            id: crypto.randomUUID(),
            text: "",
            done: false,
            scheduledFor: getLocalDateKey(),
            deadlineDate: "",
            deadlineTime: "",
            reminderTime: "",
            remindDailyUntilDeadline: false,
            deadlineReminderFrequency: "OFF",
            showSchedule: false,
          },
        ];
        setTimeout(() => {
          if (inputRefs.current[next.length - 1]) {
            inputRefs.current[next.length - 1]?.focus();
          }
        }, 10);
        return next;
      });
    };

    const handleReset = () => {
      if (!resetConfirm) {
        setResetConfirm(true);
        setTimeout(() => setResetConfirm(false), 3000);
        return;
      }
      setTasks([
        {
          id: crypto.randomUUID(),
          text: "",
          done: false,
          scheduledFor: getLocalDateKey(),
          deadlineDate: "",
          deadlineTime: "",
          reminderTime: "",
          remindDailyUntilDeadline: false,
          deadlineReminderFrequency: "OFF",
          showSchedule: false,
        },
      ]);
      setResetConfirm(false);
    };

    const processTableData = (text: string) => {
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 1) return;

      const parsedRows = lines
        .map((line) => {
          const cols = line.split(/\t|,/);
          return {
            id: crypto.randomUUID(),
            text: cols[0].trim(),
            done: false,
            scheduledFor: getLocalDateKey(),
            deadlineDate: "",
            deadlineTime: "",
            reminderTime: "",
            remindDailyUntilDeadline: false,
            deadlineReminderFrequency: "OFF",
            showSchedule: false,
          };
        })
        .filter((r) => r.text);

      if (parsedRows.length > 0) {
        if (
          parsedRows[0].text.toLowerCase() === "task" ||
          parsedRows[0].text.toLowerCase() === "description"
        ) {
          parsedRows.shift();
        }
        setTasks((prev) => {
          const keep = prev.filter((p) => p.text.trim() !== "");
          return [...keep, ...parsedRows];
        });
      }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("Text");
      if (text) {
        e.preventDefault();
        processTableData(text);
      }
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const text = e.dataTransfer.getData("Text");
      if (text) processTableData(text);
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
    };

    const handleUpdate = (index: number, text: string) => {
      const newTasks = [...tasks];
      newTasks[index] = { ...newTasks[index], text };
      setTasks(newTasks);
    };

    const handleDoneUpdate = (index: number, done: boolean) => {
      const newTasks = [...tasks];
      newTasks[index] = { ...newTasks[index], done };
      setTasks(newTasks);
    };

    const handleScheduleUpdate = (
      index: number,
      patch: Partial<(typeof tasks)[number]>,
    ) => {
      const newTasks = [...tasks];
      newTasks[index] = { ...newTasks[index], ...patch };
      setTasks(newTasks);
    };

    const toLocalDateTime = (date: string, time: string) =>
      date && time ? new Date(`${date}T${time}:00`).toISOString() : null;
    const tomorrowKey = () => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      return next.toLocaleDateString("en-CA");
    };

    const handleKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      index: number,
    ) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (index === tasks.length - 1) {
          handleAddRow();
        } else {
          inputRefs.current[index + 1]?.focus();
        }
      }
    };

    const handleSubmit = async (options?: {
      afterSave?: () => void;
      silent?: boolean;
    }) => {
      const valid = tasks.filter((t) => t.text.trim().length > 0);
      if (valid.length === 0)
        return showError("Please enter at least one task");

      setLoading(true);
      try {
        await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/me/todos`,
          {
            items: valid.map((t) => ({
              text: t.text.trim(),
              done: t.done,
              scheduledFor: t.scheduledFor || getLocalDateKey(),
              deadlineAt: toLocalDateTime(t.deadlineDate, t.deadlineTime),
              reminderAt: toLocalDateTime(t.scheduledFor, t.reminderTime),
              remindDailyUntilDeadline:
                t.deadlineReminderFrequency === "DAILY",
              deadlineReminderFrequency: t.deadlineReminderFrequency,
            })),
            date: getLocalDateKey(),
            silent: options?.silent === true,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        options?.afterSave?.();
        onClose();
      } catch (err) {
        showError("Failed to submit Todo list");
      } finally {
        setLoading(false);
      }
    };

    const previewText = tasks
      .filter((t) => t.text.trim().length > 0)
      .map((t) => {
        const when =
          t.scheduledFor && t.scheduledFor !== getLocalDateKey()
            ? ` → ${t.scheduledFor}`
            : "";
        const deadline = t.deadlineTime ? ` deadline ${t.deadlineTime}` : "";
        return `[ ] ${t.text.trim()}${when}${deadline}`;
      })
      .join("\n");

    const handleCopy = () => {
      if (!previewText) return;
      navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          zIndex: 9999,
        }}
      >
        <div
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 12,
            width: 800,
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            display: "flex",
            gap: 32,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#0f172a" }}>
              📝 Start of Day: To-Do List
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
              Please list your tasks for today. You can <b>Paste</b> or{" "}
              <b>Drop</b> a list here. Press <b>Enter</b> to add a new task.
            </p>

            {errorMsg && (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#ef4444",
                  padding: "8px 12px",
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                {errorMsg}
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 16,
                maxHeight: "50vh",
                overflowY: "auto",
                paddingRight: 8,
              }}
            >
              {fetching ? (
                <div style={{ padding: 20, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                  Loading your tasks...
                </div>
              ) : (
                <>
                  {tasks.map((task, i) => (
                    <div
                      key={task.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "20px 1fr auto auto",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={(e) => handleDoneUpdate(i, e.target.checked)}
                    style={{ cursor: "pointer", width: 16, height: 16 }}
                  />
                  <input
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    value={task.text}
                    onChange={(e) => handleUpdate(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    placeholder={`Task ${i + 1} description`}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() =>
                      handleScheduleUpdate(i, {
                        scheduledFor:
                          !task.showSchedule &&
                          (task.scheduledFor || getLocalDateKey()) ===
                            getLocalDateKey()
                            ? tomorrowKey()
                            : task.scheduledFor,
                        showSchedule: !task.showSchedule,
                      })
                    }
                    title="Schedule task"
                    style={{
                      border: "1px solid #cbd5e1",
                      background:
                        task.scheduledFor !== getLocalDateKey() ||
                        task.deadlineTime ||
                        task.reminderTime
                          ? "#eef2ff"
                          : "#fff",
                      color: "#4f46e5",
                      borderRadius: 8,
                      width: 34,
                      height: 34,
                      cursor: "pointer",
                    }}
                  >
                    📅
                  </button>
                  <button
                    onClick={() => {
                      setTasks((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    title="Delete Task"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                  {task.showSchedule && (
                    <div
                      style={{
                        gridColumn: "2 / 5",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 8,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        padding: 10,
                      }}
                    >
                      <label style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>
                        Schedule for
                        <input
                          type="date"
                          value={task.scheduledFor || getLocalDateKey()}
                          min={getLocalDateKey()}
                          onChange={(e) =>
                            handleScheduleUpdate(i, {
                              scheduledFor: e.target.value || getLocalDateKey(),
                            })
                          }
                          style={{
                            display: "block",
                            width: "100%",
                            marginTop: 4,
                            padding: "8px 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                          }}
                        />
                      </label>
                      <label style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>
                        Deadline date
                        <input
                          type="date"
                          value={task.deadlineDate}
                          min={getLocalDateKey()}
                          onChange={(e) =>
                            handleScheduleUpdate(i, {
                              deadlineDate: e.target.value,
                              deadlineTime:
                                e.target.value && !task.deadlineTime
                                  ? "18:00"
                                  : task.deadlineTime,
                            })
                          }
                          style={{
                            display: "block",
                            width: "100%",
                            marginTop: 4,
                            padding: "8px 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                          }}
                        />
                      </label>
                      <label style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>
                        Reminder time
                        <input
                          type="time"
                          value={task.reminderTime}
                          onChange={(e) =>
                            handleScheduleUpdate(i, {
                              reminderTime: e.target.value,
                            })
                          }
                          style={{
                            display: "block",
                            width: "100%",
                            marginTop: 4,
                            padding: "8px 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                          }}
                        />
                      </label>
                      <label style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>
                        Deadline time
                        <input
                          type="time"
                          value={task.deadlineTime}
                          onChange={(e) =>
                            handleScheduleUpdate(i, {
                              deadlineTime: e.target.value,
                            })
                          }
                          style={{
                            display: "block",
                            width: "100%",
                            marginTop: 4,
                            padding: "8px 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                          }}
                        />
                      </label>
                      <label
                        style={{
                          gridColumn: "1 / 4",
                          fontSize: 12,
                          color: "#334155",
                          fontWeight: 700,
                        }}
                      >
                        Deadline reminder repeat
                        <select
                          value={task.deadlineReminderFrequency}
                          disabled={!task.deadlineTime}
                          onChange={(e) =>
                            handleScheduleUpdate(i, {
                              deadlineReminderFrequency: e.target.value as
                                | "OFF"
                                | "DAILY"
                                | "EVERY_2_DAYS"
                                | "WEEKLY",
                            })
                          }
                          style={{
                            display: "block",
                            width: "100%",
                            marginTop: 4,
                            padding: "8px 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                            background: !task.deadlineTime ? "#f1f5f9" : "#fff",
                          }}
                        >
                          <option value="OFF">No repeat reminder</option>
                          <option value="DAILY">Every day</option>
                          <option value="EVERY_2_DAYS">Every 2 days</option>
                          <option value="WEEKLY">Weekly</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          handleScheduleUpdate(i, {
                            scheduledFor: tomorrowKey(),
                            showSchedule: true,
                          })
                        }
                        style={{
                          gridColumn: "1 / 4",
                          border: "1px dashed #93c5fd",
                          borderRadius: 10,
                          padding: "8px 10px",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Schedule this task for tomorrow
                      </button>
                    </div>
                  )}
                </div>
              ))}
              </>
            )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  onClick={handleAddRow}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#3b82f6",
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  + Add another task
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    background: "none",
                    border: "none",
                    color: resetConfirm ? "red" : "#ef4444",
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: resetConfirm ? "bold" : "normal",
                  }}
                >
                  {resetConfirm ? "Click to confirm reset" : "Reset list"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: "auto" }}>
              <button
                type="button"
                onClick={() =>
                  void handleSubmit({
                    silent: true,
                    afterSave: () =>
                      (window as any).electronAPI?.openTodoWidget?.(),
                  })
                }
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 8,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  border: "1px solid #bfdbfe",
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 8,
                }}
              >
                Pin Todo as floating widget
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 8,
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {loading ? "Saving..." : "Save To-Do List"}
              </button>
              <button
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#64748b",
                  border: "none",
                  cursor: "pointer",
                  marginTop: 8,
                }}
              >
                Close
              </button>
            </div>
          </div>

          {/* Live Preview Column */}
          <div
            style={{
              width: 300,
              background: "#f8fafc",
              padding: 20,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: "#334155",
                  fontWeight: 600,
                }}
              >
                Live Preview
              </h3>
              <button
                onClick={handleCopy}
                disabled={!previewText}
                style={{
                  background: copied ? "#10b981" : "#fff",
                  color: copied ? "#fff" : "#3b82f6",
                  border: `1px solid ${copied ? "#10b981" : "#cbd5e1"}`,
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: previewText ? "pointer" : "not-allowed",
                  opacity: previewText ? 1 : 0.5,
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
              >
                {copied ? "✓ Copied" : "Copy List"}
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                background: "#fff",
                padding: 12,
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontSize: 13,
                color: "#475569",
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
              }}
            >
              {previewText || (
                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                  No tasks entered yet...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
