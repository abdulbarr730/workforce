import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { Clock, Plus, Trash2, X, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";

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

export const parseTimeToMinutes = (val: string): number => {
  if (!val) return 0;
  let str = val.toLowerCase().trim();
  let totalMins = 0;

  if (str.includes("h") || str.includes("m")) {
    const hMatch = str.match(/([\d.]+)\s*h/);
    const mMatch = str.match(/([\d.]+)\s*m/);
    if (hMatch) totalMins += parseFloat(hMatch[1]) * 60;
    if (mMatch) totalMins += parseFloat(mMatch[1]);
    return Math.round(totalMins);
  }

  if (str.includes(":")) {
    const parts = str.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return Math.round(h * 60 + m);
  }

  const num = parseFloat(str);
  if (!isNaN(num)) {
    return Math.round(num * 60);
  }
  return 0;
};

export interface EodRow {
  id: string;
  task: string;
  interval: string;
  hours: string;
  isTopTask?: boolean;
  sourceTodoText?: string;
}

export const EodModal = React.memo(
  ({
    token,
    onClose,
    onSubmitSuccess,
    onSignOut,
  }: {
    token: string;
    onClose: () => void;
    onSubmitSuccess?: () => void;
    onSignOut: () => void;
  }) => {
    const getTodayStr = () => new Date().toISOString().split("T")[0];

    const [rows, setRows] = useState<EodRow[]>(() => {
      const saved = localStorage.getItem("eod_draft_v2");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.date === getTodayStr() && Array.isArray(parsed.rows)) {
            return parsed.rows.map((r: any) => ({
              id: r.id || crypto.randomUUID(),
              task: r.task || "",
              interval: r.interval || "",
              hours: formatToHHMM(r.hours || "") || r.hours || "02:00",
              isTopTask: !!r.isTopTask,
              sourceTodoText: r.sourceTodoText,
            }));
          }
        } catch (e) {}
      }
      return [
        {
          id: crypto.randomUUID(),
          task: "",
          interval: "10:00 AM – 12:00 PM",
          hours: "02:00",
          isTopTask: false,
        },
      ];
    });

    const [loading, setLoading] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [submitConfirm, setSubmitConfirm] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);
    const [todoItems, setTodoItems] = useState<{ text: string }[]>([]);

    const taskRefs = useRef<(HTMLInputElement | null)[]>([]);
    const hoursRefs = useRef<(HTMLInputElement | null)[]>([]);
    const intervalRefs = useRef<(HTMLInputElement | null)[]>([]);

    const showError = (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 3500);
    };

    useEffect(() => {
      localStorage.setItem(
        "eod_draft_v2",
        JSON.stringify({ date: getTodayStr(), rows }),
      );
    }, [rows]);

    useEffect(() => {
      const fetchExistingData = async () => {
        try {
          const res = await axios.get(
            `${import.meta.env.VITE_API_BASE_URL}/me/eod/today`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          const payload = res.data?.data;
          if (payload?.todayTodo?.items) {
            setTodoItems(payload.todayTodo.items);
          }

          // If there are recorded check-in tasks from today and local draft is empty or single empty row
          if (Array.isArray(payload?.recordedCheckins) && payload.recordedCheckins.length > 0) {
            setRows((prev) => {
              const hasActualRows = prev.some((r) => r.task && r.task.trim().length > 0);
              if (!hasActualRows) {
                return payload.recordedCheckins.map((c: any) => ({
                  id: crypto.randomUUID(),
                  task: c.text,
                  interval: c.interval || "2-Hour Interval",
                  hours: formatToHHMM(c.timeTaken) || "02:00",
                  isTopTask: !!c.isTopTask,
                }));
              }
              // Merge missing checkins into current rows
              const merged = [...prev];
              payload.recordedCheckins.forEach((c: any) => {
                const exists = merged.some(
                  (m) =>
                    m.task.toLowerCase() === c.text.toLowerCase() ||
                    (m.interval === c.interval && m.task.includes(c.text)),
                );
                if (!exists) {
                  merged.push({
                    id: crypto.randomUUID(),
                    task: c.text,
                    interval: c.interval || "2-Hour Interval",
                    hours: formatToHHMM(c.timeTaken) || "02:00",
                    isTopTask: !!c.isTopTask,
                  });
                }
              });
              return merged;
            });
          } else if (payload?.completedItems && Array.isArray(payload.completedItems)) {
            // Already submitted EOD
            const top3 = payload.top3Tasks || [];
            const timings = payload.tasksWithTimings || [];
            if (timings.length > 0) {
              setRows(
                timings.map((t: any) => ({
                  id: crypto.randomUUID(),
                  task: t.text,
                  interval: t.interval || "",
                  hours: formatToHHMM(t.timeTaken) || "02:00",
                  isTopTask: top3.includes(t.text) || !!t.isTopTask,
                })),
              );
            }
          }
        } catch (err) {
          // Silently ignore if no EOD exists
        }
      };
      fetchExistingData();
    }, [token]);

    const handleAddRow = () => {
      // Suggest next interval based on previous row
      const lastRow = rows[rows.length - 1];
      let nextInterval = "02:00 PM – 04:00 PM";
      if (lastRow && lastRow.interval) {
        const match = lastRow.interval.match(/–|-|to\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (match) {
          nextInterval = `Next Interval`;
        }
      }

      setRows((prev) => {
        const next = [
          ...prev,
          {
            id: crypto.randomUUID(),
            task: "",
            interval: nextInterval,
            hours: "02:00",
            isTopTask: false,
          },
        ];
        setTimeout(() => {
          if (taskRefs.current[next.length - 1]) {
            taskRefs.current[next.length - 1]?.focus();
          }
        }, 10);
        return next;
      });
    };

    const handleRemoveRow = (index: number) => {
      setRows((prev) => {
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          return [
            {
              id: crypto.randomUUID(),
              task: "",
              interval: "10:00 AM – 12:00 PM",
              hours: "02:00",
              isTopTask: false,
            },
          ];
        }
        return next;
      });
    };

    const autoCalculateTimestamps = () => {
      const todayStr = getTodayStr();
      const loginKey = `workforce_login_time_${todayStr}`;
      const loginTs = localStorage.getItem(loginKey);
      const loginTime = loginTs
        ? parseInt(loginTs, 10)
        : Date.now() - rows.length * 2 * 3600 * 1000;
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

      const updated = rows.map((r, idx) => {
        const startMs = loginTime + idx * TWO_HOURS_MS;
        const endMs = startMs + TWO_HOURS_MS;
        const startStr = new Date(startMs).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const endStr = new Date(endMs).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const calculatedInterval = `${startStr} – ${endStr}`;

        return {
          ...r,
          interval: r.interval && r.interval.includes("–") ? r.interval : calculatedInterval,
          hours: r.hours && r.hours.trim() !== "" ? r.hours : "02:00",
        };
      });

      setRows(updated);
    };

    const handleReset = () => {
      if (!resetConfirm) {
        setResetConfirm(true);
        setTimeout(() => setResetConfirm(false), 3000);
        return;
      }
      setRows([
        {
          id: crypto.randomUUID(),
          task: "",
          interval: "10:00 AM – 12:00 PM",
          hours: "02:00",
          isTopTask: false,
        },
      ]);
      localStorage.removeItem("eod_draft_v2");
      setResetConfirm(false);
    };

    const handleUpdate = (
      index: number,
      field: keyof EodRow,
      value: string | boolean,
    ) => {
      const newRows = [...rows];
      if (field === "isTopTask" && value === true) {
        const topCount = newRows.filter((r) => r.isTopTask).length;
        if (topCount >= 3) {
          showError("You can only select up to 3 top tasks.");
          return;
        }
      }
      newRows[index] = { ...newRows[index], [field]: value };
      setRows(newRows);
    };

    // Live Total Minutes & Total Hours Calculation
    const totalMinutes = rows.reduce(
      (acc, r) => acc + (r.task.trim() ? parseTimeToMinutes(r.hours) : 0),
      0,
    );
    const totalHoursStr = (() => {
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    })();

    const handleSubmit = async () => {
      const valid = rows.filter((r) => r.task.trim().length > 0);
      if (valid.length < 1) {
        return showError("Please enter at least one completed task.");
      }

      const missingHours = valid.some(
        (r) => !r.hours || r.hours.trim() === "",
      );
      if (missingHours) {
        return showError(
          "Time duration is mandatory for all tasks! (e.g. 02:00, 1h 30m, 45m)",
        );
      }

      if (!submitConfirm) {
        setSubmitConfirm(true);
        setTimeout(() => setSubmitConfirm(false), 3000);
        return;
      }

      const completedItems = valid.map((r) => {
        const formattedHours = formatToHHMM(r.hours.trim()) || r.hours.trim();
        if (r.interval && r.interval.trim()) {
          return `${r.task.trim()} (${r.interval.trim()}) - ${formattedHours}`;
        }
        return `${r.task.trim()} - ${formattedHours}`;
      });

      const tasksWithTimings = valid.map((r) => ({
        text: r.task.trim(),
        interval: r.interval.trim() || "2-Hour Interval",
        timeTaken: formatToHHMM(r.hours.trim()) || r.hours.trim(),
        isTopTask: !!r.isTopTask,
      }));

      let computedTopTasks = valid
        .filter((r) => r.isTopTask)
        .map((r) => r.task.trim());

      if (computedTopTasks.length === 0) {
        computedTopTasks = valid.slice(0, 3).map((r) => r.task.trim());
      }

      const totalHoursWorkedNum = +(totalMinutes / 60).toFixed(2);

      setLoading(true);
      try {
        await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/me/eod`,
          {
            summary: `Daily End of Day Submission (${totalHoursStr} hrs tracked)`,
            completedItems,
            tasksWithTimings,
            top3Tasks: computedTopTasks,
            hoursWorked: totalHoursWorkedNum,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        localStorage.removeItem("eod_draft_v2");
        setSubmitConfirm(false);

        if (onSubmitSuccess) onSubmitSuccess();
        onClose();
      } catch (err: any) {
        showError(err?.response?.data?.message || "Failed to submit EOD");
      } finally {
        setLoading(false);
      }
    };

    const generatePreview = () => {
      const validRows = rows.filter((r) => r.task.trim().length > 0);
      if (validRows.length === 0) return "";

      const topTasks = validRows.filter((r) => r.isTopTask);
      let text = `🌙 DAILY EOD REPORT [Total: ${totalHoursStr} hrs]\n\n`;

      if (topTasks.length > 0) {
        text += "⭐ TOP 3 TASKS:\n";
        topTasks.forEach((t, i) => {
          text += `${i + 1}. ${t.task} (${t.interval || 'Interval'}) - ${formatToHHMM(t.hours) || t.hours}\n`;
        });
        text += "\n";
      }

      text += "⏱️ COMPLETED WORK TIMELINE:\n";
      validRows.forEach((t) => {
        const hrs = t.hours.trim() ? ` [${formatToHHMM(t.hours) || t.hours}]` : "";
        const stamp = t.interval.trim() ? ` (${t.interval.trim()})` : "";
        text += `• ${t.task}${stamp}${hrs}\n`;
      });

      return text.trim();
    };

    const previewText = generatePreview();

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
          background: "rgba(0,0,0,0.65)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            width: 960,
            maxWidth: "94vw",
            maxHeight: "92vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "18px 24px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
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
                  🌙 End of Day Submission & Work Log
                </h2>
                <span
                  style={{
                    background: "#f0fdf4",
                    color: "#16a34a",
                    border: "1px solid #bbf7d0",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "2px 10px",
                    borderRadius: 9999,
                  }}
                >
                  Total Logged: {totalHoursStr} hrs
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                Review and finalize all timestamped 2-hour check-ins and tasks for today.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={autoCalculateTimestamps}
                style={{
                  padding: "6px 12px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#2563eb",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                title="Auto-fills timestamps in 2-hour blocks from login"
              >
                <Sparkles className="w-3.5 h-3.5" /> Auto-Fill Timestamps
              </button>
              <button
                onClick={onClose}
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
          </div>

          {/* Error Message */}
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

          {/* Body Columns */}
          <div
            style={{
              padding: "16px 24px",
              display: "flex",
              gap: 20,
              flex: 1,
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            {/* Left Main Table Column */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  overflow: "hidden",
                  marginBottom: 12,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th
                        style={{
                          textAlign: "center",
                          padding: "8px 6px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#64748b",
                          width: 44,
                          textTransform: "uppercase",
                        }}
                        title="Mark as Top 3 Priority Task"
                      >
                        Top 3
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#64748b",
                          width: 170,
                          textTransform: "uppercase",
                        }}
                      >
                        Time Stamp / Interval
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Task Description *
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#64748b",
                          width: 120,
                          textTransform: "uppercase",
                        }}
                      >
                        Duration *
                      </th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row.id || i}
                        style={{
                          borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none",
                          background: row.isTopTask ? "#eff6ff" : "#ffffff",
                        }}
                      >
                        {/* Top 3 Checkbox */}
                        <td style={{ padding: "6px 4px", textAlign: "center", verticalAlign: "middle" }}>
                          <input
                            type="checkbox"
                            checked={!!row.isTopTask}
                            onChange={(e) => handleUpdate(i, "isTopTask", e.target.checked)}
                            title="Mark as Top 3 Task"
                            style={{
                              cursor: "pointer",
                              width: 16,
                              height: 16,
                              accentColor: "#2563eb",
                            }}
                          />
                        </td>

                        {/* Timestamp / Interval Input */}
                        <td style={{ padding: "6px 6px", verticalAlign: "middle" }}>
                          <input
                            ref={(el) => {
                              intervalRefs.current[i] = el;
                            }}
                            type="text"
                            value={row.interval || ""}
                            onChange={(e) => handleUpdate(i, "interval", e.target.value)}
                            placeholder="e.g. 10:30 AM – 12:30 PM"
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid #cbd5e1",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#334155",
                              background: "#f8fafc",
                              boxSizing: "border-box",
                            }}
                          />
                        </td>

                        {/* Task Description */}
                        <td style={{ padding: "6px 6px", verticalAlign: "middle" }}>
                          <input
                            ref={(el) => {
                              taskRefs.current[i] = el;
                            }}
                            type="text"
                            value={row.task || ""}
                            onChange={(e) => handleUpdate(i, "task", e.target.value)}
                            placeholder="e.g. Implemented checkin timeline & EOD engine"
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid #cbd5e1",
                              fontSize: 13,
                              color: "#0f172a",
                              boxSizing: "border-box",
                            }}
                          />
                        </td>

                        {/* Duration / Time Taken */}
                        <td style={{ padding: "6px 6px", verticalAlign: "middle" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              borderRadius: 6,
                              padding: "3px 6px",
                            }}
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <input
                              ref={(el) => {
                                hoursRefs.current[i] = el;
                              }}
                              type="text"
                              value={row.hours || ""}
                              onChange={(e) => handleUpdate(i, "hours", e.target.value)}
                              onBlur={() => handleUpdate(i, "hours", formatToHHMM(row.hours) || row.hours)}
                              placeholder="02:00"
                              style={{
                                width: "100%",
                                border: "none",
                                outline: "none",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#d97706",
                                textAlign: "right",
                                background: "transparent",
                              }}
                            />
                          </div>
                        </td>

                        {/* Delete Row */}
                        <td style={{ padding: "6px 4px", textAlign: "center", verticalAlign: "middle" }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(i)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#94a3b8",
                              cursor: "pointer",
                              padding: 4,
                              borderRadius: 4,
                            }}
                            title="Remove row"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Total Time footer inside Table */}
                <div
                  style={{
                    background: "#f8fafc",
                    padding: "10px 16px",
                    borderTop: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
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
                    <Plus className="w-3.5 h-3.5" /> Add Task / Missed Interval
                  </button>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                      Total Tracked Work Time:
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#16a34a",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        padding: "2px 10px",
                        borderRadius: 6,
                      }}
                    >
                      {totalHoursStr} hrs
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons below Table */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: resetConfirm ? "#dc2626" : "#94a3b8",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: resetConfirm ? 700 : 400,
                  }}
                >
                  {resetConfirm ? "Click again to confirm reset" : "Reset all rows"}
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={onClose}
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
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 6,
                      border: "none",
                      background: submitConfirm ? "#16a34a" : "#2563eb",
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.7 : 1,
                      boxShadow: "0 2px 4px rgba(37,99,235,0.2)",
                    }}
                  >
                    {loading ? "Submitting..." : submitConfirm ? "Click to Confirm EOD" : "Submit Final EOD"}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Helper Column */}
            <div
              style={{
                width: 310,
                background: "#f8fafc",
                padding: 16,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                overflowY: "auto",
              }}
            >
              {/* Morning To-Do reference */}
              {todoItems.length > 0 && (
                <div
                  style={{
                    background: "#ffffff",
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#334155",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    📋 Today's Morning Planned Tasks:
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {todoItems.map((todo, idx) => {
                      const isLogged = rows.some((r) => r.task.toLowerCase().includes(todo.text.toLowerCase()));
                      return (
                        <div
                          key={idx}
                          style={{
                            fontSize: 12,
                            color: isLogged ? "#16a34a" : "#64748b",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 10 }}>{isLogged ? "✅" : "⚪"}</span>
                          <span style={{ textDecoration: isLogged ? "line-through" : "none" }}>
                            {todo.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Live Preview Box */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
                    Live EOD Preview
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    style={{
                      border: "1px solid #cbd5e1",
                      background: copied ? "#16a34a" : "#ffffff",
                      color: copied ? "#ffffff" : "#2563eb",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 11,
                    color: "#334155",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    flex: 1,
                    overflowY: "auto",
                  }}
                >
                  {previewText}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
