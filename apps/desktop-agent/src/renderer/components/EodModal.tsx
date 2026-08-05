import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { Clock, Plus, Trash2, X, AlertCircle, Copy } from "lucide-react";

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

export function formatMinToAmPm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function formatTimeAmPm(timeStr: string): string {
  const parts = timeStr.split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return formatMinToAmPm(h * 60 + m);
}

export function calculateDayIntervalSlots(shiftInfo?: {
  shiftStartTime?: string;
  shiftEndTime?: string;
  customCheckinTimes?: string[];
}): string[] {
  if (
    shiftInfo?.customCheckinTimes &&
    Array.isArray(shiftInfo.customCheckinTimes) &&
    shiftInfo.customCheckinTimes.length > 0
  ) {
    const sorted = [...shiftInfo.customCheckinTimes].sort();
    const slots: string[] = [];
    let prev = shiftInfo.shiftStartTime || "10:00";
    for (const cur of sorted) {
      slots.push(`${formatTimeAmPm(prev)} – ${formatTimeAmPm(cur)}`);
      prev = cur;
    }
    if (shiftInfo.shiftEndTime && prev !== shiftInfo.shiftEndTime) {
      slots.push(`${formatTimeAmPm(prev)} – ${formatTimeAmPm(shiftInfo.shiftEndTime)}`);
    }
    if (slots.length > 0) return slots;
  }

  let startTotalMin = 10 * 60; // 10:00 AM
  let endTotalMin = 20 * 60; // 08:00 PM

  if (shiftInfo?.shiftStartTime) {
    const parts = shiftInfo.shiftStartTime.split(":").map(Number);
    if (!isNaN(parts[0])) startTotalMin = parts[0] * 60 + (parts[1] || 0);
  }
  if (shiftInfo?.shiftEndTime) {
    const parts = shiftInfo.shiftEndTime.split(":").map(Number);
    if (!isNaN(parts[0])) endTotalMin = parts[0] * 60 + (parts[1] || 0);
  }

  const slots: string[] = [];
  let cur = startTotalMin;
  while (cur < endTotalMin) {
    const next = Math.min(cur + 120, endTotalMin);
    slots.push(`${formatMinToAmPm(cur)} – ${formatMinToAmPm(next)}`);
    cur = next;
    if (cur >= endTotalMin) break;
  }

  if (slots.length === 0) {
    return [
      "10:00 AM – 12:00 PM",
      "12:00 PM – 02:00 PM",
      "02:00 PM – 04:00 PM",
      "04:00 PM – 06:00 PM",
      "06:00 PM – 08:00 PM",
    ];
  }
  return slots;
}

export interface EodRow {
  id: string;
  task: string;
  interval: string;
  hours: string;
  isTopTask?: boolean;
  sourceTodoText?: string;
}

export interface EodModalProps {
  token: string;
  shiftInfo?: {
    shift?: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    loginTime?: string;
    customCheckinTimes?: string[];
  };
  onClose: () => void;
  onSubmitSuccess?: () => void;
  onSignOut: () => void;
}

export const EodModal = React.memo(
  ({ token, shiftInfo, onClose, onSubmitSuccess }: EodModalProps) => {
    const getTodayStr = () => new Date().toISOString().split("T")[0];

    const [rows, setRows] = useState<EodRow[]>(() => {
      const saved = localStorage.getItem("eod_draft_v2");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.date === getTodayStr() && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
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
      const initialSlots = calculateDayIntervalSlots(shiftInfo);
      return initialSlots.map((slot) => ({
        id: crypto.randomUUID(),
        task: "",
        interval: slot,
        hours: "02:00",
        isTopTask: false,
      }));
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

          const defaultSlots = calculateDayIntervalSlots(shiftInfo);

          const doesSlotMatch = (slot: string, intervalStr?: string) => {
            if (!intervalStr) return false;
            const s = slot.toLowerCase().replace(/[^0-9apm]/g, "");
            const i = intervalStr.toLowerCase().replace(/[^0-9apm]/g, "");
            return s === i || i.includes(s) || s.includes(i);
          };

          // If there are recorded check-in tasks from today
          if (Array.isArray(payload?.recordedCheckins) && payload.recordedCheckins.length > 0) {
            const newRows: EodRow[] = [];
            const processedCheckinIds = new Set<string>();

            defaultSlots.forEach((slot) => {
              const matching = payload.recordedCheckins.filter(
                (c: any, idx: number) => !processedCheckinIds.has(`${idx}`) && doesSlotMatch(slot, c.interval)
              );

              if (matching.length > 0) {
                matching.forEach((c: any) => {
                  processedCheckinIds.add(`${payload.recordedCheckins.indexOf(c)}`);
                  newRows.push({
                    id: crypto.randomUUID(),
                    task: c.text,
                    interval: slot,
                    hours: formatToHHMM(c.timeTaken) || "02:00",
                    isTopTask: !!c.isTopTask,
                  });
                });
              } else {
                // Blank row for missed interval
                newRows.push({
                  id: crypto.randomUUID(),
                  task: "",
                  interval: slot,
                  hours: "02:00",
                  isTopTask: false,
                });
              }
            });

            // Extra recorded checkins that didn't match slot
            payload.recordedCheckins.forEach((c: any, idx: number) => {
              if (!processedCheckinIds.has(`${idx}`)) {
                newRows.push({
                  id: crypto.randomUUID(),
                  task: c.text,
                  interval: c.interval || "",
                  hours: formatToHHMM(c.timeTaken) || "02:00",
                  isTopTask: !!c.isTopTask,
                });
              }
            });

            setRows(newRows);
          } else if (payload?.completedItems && Array.isArray(payload.completedItems) && payload.completedItems.length > 0) {
            // Already submitted EOD
            const top3 = payload.top3Tasks || [];
            const timings = payload.tasksWithTimings || [];
            if (timings.length > 0) {
              setRows(
                timings.map((t: any) => ({
                  id: crypto.randomUUID(),
                  task: t.text || t.task || "",
                  interval: t.interval || "",
                  hours: formatToHHMM(t.timeTaken || t.hours || "") || "02:00",
                  isTopTask: top3.includes(t.text || t.task) || !!t.isTopTask,
                })),
              );
            }
          }
        } catch {
          // Silently ignore
        }
      };
      fetchExistingData();
    }, [token, shiftInfo]);

    // Button on right: Add a row for the SAME timestamp as this row
    const handleAddSameTimestampRow = (index: number) => {
      setRows((prev) => {
        const currentInterval = prev[index]?.interval || "";
        const next = [
          ...prev.slice(0, index + 1),
          {
            id: crypto.randomUUID(),
            task: "",
            interval: currentInterval, // SAME TIMESTAMP AS ABOVE
            hours: "01:00",
            isTopTask: false,
          },
          ...prev.slice(index + 1),
        ];
        setTimeout(() => {
          taskRefs.current[index + 1]?.focus();
        }, 20);
        return next;
      });
    };

    // Enter key: Add a row with BLANK timestamp
    const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setRows((prev) => {
          const next = [
            ...prev.slice(0, index + 1),
            {
              id: crypto.randomUUID(),
              task: "",
              interval: "", // BLANK TIMESTAMP AS REQUESTED
              hours: "",
              isTopTask: false,
            },
            ...prev.slice(index + 1),
          ];
          setTimeout(() => {
            taskRefs.current[index + 1]?.focus();
          }, 20);
          return next;
        });
      }
    };

    const handleHoursKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setRows((prev) => {
          const next = [
            ...prev.slice(0, index + 1),
            {
              id: crypto.randomUUID(),
              task: "",
              interval: "", // BLANK TIMESTAMP AS REQUESTED
              hours: "",
              isTopTask: false,
            },
            ...prev.slice(index + 1),
          ];
          setTimeout(() => {
            taskRefs.current[index + 1]?.focus();
          }, 20);
          return next;
        });
      }
    };

    const handleAddRow = () => {
      setRows((prev) => {
        const next = [
          ...prev,
          {
            id: crypto.randomUUID(),
            task: "",
            interval: "", // BLANK TIMESTAMP
            hours: "",
            isTopTask: false,
          },
        ];
        setTimeout(() => {
          taskRefs.current[next.length - 1]?.focus();
        }, 20);
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
              interval: "",
              hours: "",
              isTopTask: false,
            },
          ];
        }
        return next;
      });
    };

    const handleReset = () => {
      if (!resetConfirm) {
        setResetConfirm(true);
        setTimeout(() => setResetConfirm(false), 3000);
        return;
      }
      const initialSlots = calculateDayIntervalSlots(shiftInfo);
      setRows(
        initialSlots.map((slot) => ({
          id: crypto.randomUUID(),
          task: "",
          interval: slot,
          hours: "02:00",
          isTopTask: false,
        }))
      );
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

    // Table parsing for paste and file upload
    const combineTasks = (prevRows: EodRow[], newRows: Partial<EodRow>[]) => {
      const validPrev = prevRows.filter((p) => p.task.trim() !== "");
      return [
        ...validPrev,
        ...newRows.map((r) => ({
          id: crypto.randomUUID(),
          interval: r.interval || "",
          task: r.task || "",
          hours: formatToHHMM(r.hours || "") || r.hours || "02:00",
          isTopTask: false,
        })),
      ];
    };

    const processTableData = (text: string) => {
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 1) return;

      const parsedRows = lines
        .map((line) => {
          let cols = line.split("\t");
          if (cols.length < 2) {
            cols = line.split(/ {2,}/);
          }
          if (cols.length >= 3) {
            const intervalPart = cols[0].trim();
            const taskPart = cols.slice(1, cols.length - 1).join(" ").trim();
            const hoursPart = formatToHHMM(cols[cols.length - 1].trim());
            return { interval: intervalPart, task: taskPart, hours: hoursPart };
          } else if (cols.length === 2) {
            const hoursPart = formatToHHMM(cols[cols.length - 1].trim());
            const taskPart = cols[0].trim();
            return { interval: "", task: taskPart, hours: hoursPart };
          } else if (cols.length === 1) {
            return { interval: "", task: cols[0].trim(), hours: "" };
          }
          return null;
        })
        .filter((r) => r && r.task) as { interval: string; task: string; hours: string }[];

      if (parsedRows.length > 0) {
        if (
          parsedRows[0].task.toLowerCase() === "task" ||
          parsedRows[0].task.toLowerCase() === "description"
        ) {
          parsedRows.shift();
        }
        setRows((prev) => combineTasks(prev, parsedRows));
      }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("Text");
      if (text && text.includes("\t")) {
        e.preventDefault();
        processTableData(text);
      }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: "binary" });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

          const newRows: Partial<EodRow>[] = [];
          data.forEach((row) => {
            if (row && row.length >= 2) {
              const taskText = String(row[0] || "").trim();
              const hoursText = String(row[1] || "").trim();
              if (
                taskText &&
                taskText.toLowerCase() !== "task" &&
                taskText.toLowerCase() !== "task description"
              ) {
                newRows.push({
                  interval: row.length >= 3 ? String(row[2]).trim() : "",
                  task: taskText,
                  hours: formatToHHMM(hoursText) || hoursText || "02:00",
                });
              }
            }
          });

          if (newRows.length > 0) {
            setRows((prev) => combineTasks(prev, newRows));
          } else {
            showError("No valid rows found in file.");
          }
        } catch {
          showError("Failed to parse file. Make sure it's valid Excel/CSV.");
        }
      };
      reader.readAsBinaryString(file);
      e.target.value = "";
    };

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
          onPaste={handlePaste}
          style={{
            background: "#ffffff",
            borderRadius: 12,
            width: 1020,
            maxWidth: "95vw",
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
              padding: "16px 24px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#f8fafc",
            }}
          >
            <div>
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
                🌙 End of Day (EOD) Submission
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                Verify and complete your 2-hour interval work logs. Press <b>Enter</b> to add a row, or click <b>+ Same Slot</b> for multiple tasks in the same interval.
              </p>
            </div>
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

          {/* Body */}
          <div
            style={{
              padding: 20,
              display: "flex",
              gap: 20,
              flex: 1,
              overflow: "hidden",
            }}
          >
            {/* Left Table Section */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                gap: 12,
              }}
            >
              {/* Import / Actions bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                  WORK TIMELINE & 2-HOUR INTERVALS:
                </span>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#2563eb",
                    cursor: "pointer",
                    fontWeight: 600,
                    background: "#eff6ff",
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #bfdbfe",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Import Excel / CSV
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              {/* Table Container */}
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
                          textAlign: "center",
                          padding: "8px 4px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#64748b",
                          width: 40,
                          textTransform: "uppercase",
                        }}
                        title="Top 3 Priority Task for Manager/Client Summary"
                      >
                        Top
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#64748b",
                          width: 175,
                          textTransform: "uppercase",
                        }}
                      >
                        Time Stamp
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
                          width: 115,
                          textTransform: "uppercase",
                        }}
                      >
                        Duration *
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
                        Actions
                      </th>
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

                        {/* Time Stamp / Interval Input on Left */}
                        <td style={{ padding: "6px 6px", verticalAlign: "middle" }}>
                          <input
                            ref={(el) => {
                              intervalRefs.current[i] = el;
                            }}
                            type="text"
                            value={row.interval || ""}
                            onChange={(e) => handleUpdate(i, "interval", e.target.value)}
                            placeholder="e.g. 10:00 AM – 12:00 PM"
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid #cbd5e1",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#334155",
                              background: row.interval ? "#f8fafc" : "#ffffff",
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
                            onKeyDown={(e) => handleTaskKeyDown(e, i)}
                            placeholder={row.interval ? `Task for ${row.interval}...` : "e.g. Implemented API endpoints"}
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

                        {/* Duration / Time Taken on Right */}
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
                            <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            <input
                              ref={(el) => {
                                hoursRefs.current[i] = el;
                              }}
                              type="text"
                              value={row.hours || ""}
                              onChange={(e) => handleUpdate(i, "hours", e.target.value)}
                              onBlur={() => handleUpdate(i, "hours", formatToHHMM(row.hours) || row.hours)}
                              onKeyDown={(e) => handleHoursKeyDown(e, i)}
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

                        {/* Action Buttons: + Same Slot & Delete */}
                        <td style={{ padding: "6px 6px", textAlign: "right", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => handleAddSameTimestampRow(i)}
                              style={{
                                border: "1px solid #bfdbfe",
                                background: "#eff6ff",
                                color: "#2563eb",
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "4px 8px",
                                borderRadius: 5,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                              title="Add another task for this exact same interval"
                            >
                              <Plus className="w-3 h-3" /> Same Slot
                            </button>
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
                              <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                            </button>
                          </div>
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
                width: 300,
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
