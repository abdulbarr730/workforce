"use client";
import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, CheckCircle, Copy, Clock, Plus, Trash2, AlertCircle } from "lucide-react";

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      {children}
    </div>
  );
}

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

interface EodRow {
  id: string;
  interval?: string;
  task: string;
  hours: string;
  isTopTask?: boolean;
  sourceTodoText?: string;
}

type Props = {
  forceSubmit?: boolean;
  date?: string;
  title?: string;
  subtitle?: string;
  shiftInfo?: {
    shift?: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    loginTime?: string;
    customCheckinTimes?: string[];
  };
  onClose: () => void;
  onSubmitted: () => void;
  customSubmitFn?: (data: any) => Promise<any>;
  initialData?: any;
};

export function EodModal({
  forceSubmit,
  date,
  title,
  subtitle,
  shiftInfo,
  onClose,
  onSubmitted,
  customSubmitFn,
  initialData,
}: Props) {
  const qc = useQueryClient();
  const getTodayStr = () => new Date().toISOString().split("T")[0];

  const [rows, setRows] = useState<EodRow[]>(() => {
    const defaultSlots = calculateDayIntervalSlots(shiftInfo);
    return defaultSlots.map((slot) => ({
      id: crypto.randomUUID(),
      interval: slot,
      task: "",
      hours: "02:00",
      isTopTask: false,
    }));
  });

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
    if (!date || date === getTodayStr()) {
      const saved = localStorage.getItem("eod_draft_web_v2");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.date === getTodayStr() && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
            setRows(
              parsed.rows.map((r: any) => ({
                ...r,
                id: r.id || crypto.randomUUID(),
                interval: r.interval || "",
                hours: formatToHHMM(r.hours || "") || r.hours || "02:00",
                isTopTask: !!r.isTopTask,
                sourceTodoText: r.sourceTodoText,
              }))
            );
          }
        } catch {}
      }
    }
  }, [date]);

  useEffect(() => {
    if (!date || date === getTodayStr()) {
      localStorage.setItem("eod_draft_web_v2", JSON.stringify({ date: getTodayStr(), rows }));
    }
  }, [rows, date]);

  useEffect(() => {
    const fetchExisting = async () => {
      const defaultSlots = calculateDayIntervalSlots(shiftInfo);

      const doesSlotMatch = (slot: string, intervalStr?: string) => {
        if (!intervalStr) return false;
        const s = slot.toLowerCase().replace(/[^0-9apm]/g, "");
        const i = intervalStr.toLowerCase().replace(/[^0-9apm]/g, "");
        return s === i || i.includes(s) || s.includes(i);
      };

      if (initialData) {
        const items = (initialData.completedItems as string[]) || [];
        const top3 = initialData.top3Tasks || [];
        const newRows = items.map((item) => {
          let taskObj: any = { task: item, hours: "02:00", isTopTask: false, interval: "" };
          const stampMatch = item.match(/^(.*?)\s*\(([^)]*(?:\d{1,2}:\d{2}|AM|PM|–|-)[^)]*)\)\s*-\s*(.*?)$/i);
          if (stampMatch) {
            taskObj.task = stampMatch[1].trim();
            taskObj.interval = stampMatch[2].trim();
            taskObj.hours = formatToHHMM(stampMatch[3].trim()) || stampMatch[3].trim();
            taskObj.isTopTask = top3.includes(taskObj.task);
          } else {
            const oldMatch = item.match(/^(.*) \(([\d.]+)h\)$/);
            if (oldMatch) {
              taskObj = { task: oldMatch[1], hours: oldMatch[2], isTopTask: top3.includes(oldMatch[1]), interval: "" };
            } else {
              const newMatch = item.match(/^(.*) - (.*)$/);
              if (newMatch) {
                taskObj = { task: newMatch[1], hours: newMatch[2], isTopTask: top3.includes(newMatch[1]), interval: "" };
              } else {
                taskObj.isTopTask = top3.includes(item);
              }
            }
          }
          return { ...taskObj, id: crypto.randomUUID() };
        });
        if (newRows.length > 0) {
          setRows(newRows);
        }
        return;
      }

      if (!date) {
        try {
          const res = await api.get("/api/daily-flow/me/eod/today");
          const payload = res.data?.data;

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
            const items = payload.completedItems as string[];
            const top3 = payload.top3Tasks || [];
            const newRows = items.map((item) => {
              let taskObj: any = { task: item, hours: "02:00", isTopTask: false, interval: "" };
              const stampMatch = item.match(/^(.*?)\s*\(([^)]*(?:\d{1,2}:\d{2}|AM|PM|–|-)[^)]*)\)\s*-\s*(.*?)$/i);
              if (stampMatch) {
                taskObj.task = stampMatch[1].trim();
                taskObj.interval = stampMatch[2].trim();
                taskObj.hours = formatToHHMM(stampMatch[3].trim()) || stampMatch[3].trim();
                taskObj.isTopTask = top3.includes(taskObj.task);
              }
              return { ...taskObj, id: crypto.randomUUID() };
            });
            if (newRows.length > 0) setRows(newRows);
          }
        } catch {}
      }

      try {
        const todoRes = await api.get("/api/daily-flow/me/todo/today");
        if (todoRes.data?.data?.items) {
          setTodoItems(todoRes.data.data.items);
        }
      } catch {}
    };
    fetchExisting();
  }, [date, initialData, shiftInfo]);

  // Button on right: Add another task for the SAME interval
  const handleAddSameTimestampRow = (index: number) => {
    setRows((prev) => {
      const currentInterval = prev[index]?.interval || "";
      const next = [
        ...prev.slice(0, index + 1),
        {
          id: crypto.randomUUID(),
          interval: currentInterval, // SAME TIMESTAMP
          task: "",
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
            interval: "", // BLANK TIMESTAMP
            task: "",
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
            interval: "", // BLANK TIMESTAMP
            task: "",
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
          interval: "",
          task: "",
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
        return [{ id: crypto.randomUUID(), interval: "", task: "", hours: "", isTopTask: false }];
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
    const defaultSlots = calculateDayIntervalSlots(shiftInfo);
    setRows(
      defaultSlots.map((slot) => ({
        id: crypto.randomUUID(),
        interval: slot,
        task: "",
        hours: "02:00",
        isTopTask: false,
      }))
    );
    if (!date || date === getTodayStr()) {
      localStorage.removeItem("eod_draft_web_v2");
    }
    setResetConfirm(false);
  };

  const handleUpdate = (index: number, field: keyof EodRow, value: any) => {
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

  const combineTasks = (prevRows: any[], newRows: any[]) => {
    const validPrev = prevRows.filter((p) => p.task.trim() !== "");
    return [
      ...validPrev,
      ...newRows.map((r) => ({
        ...r,
        id: crypto.randomUUID(),
        hours: formatToHHMM(r.hours || "") || r.hours || "02:00",
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

  const submit = useMutation({
    mutationFn: customSubmitFn || ((data: any) => api.post("/api/daily-flow/me/eod", data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-today-eod"] });
      qc.invalidateQueries({ queryKey: ["my-today-todo"] });
      qc.invalidateQueries({ queryKey: ["missed-tasks"] });
      qc.invalidateQueries({ queryKey: ["team-missed-tasks"] });

      if (!date || date === getTodayStr()) {
        localStorage.removeItem("eod_draft_web_v2");
      }
      setSubmitConfirm(false);
      onSubmitted();
    },
    onError: () => showError("Failed to submit EOD"),
  });

  const handleSubmit = () => {
    const valid = rows.filter((r) => r.task.trim().length > 0);
    if (valid.length === 0) return showError("Please enter at least one task");

    const missingHours = valid.some((r) => !r.hours || r.hours.trim() === "");
    if (missingHours) {
      return showError("Time duration is mandatory for all tasks! (e.g. 02:00, 1h 30m, 45m)");
    }

    if (!submitConfirm) {
      setSubmitConfirm(true);
      setTimeout(() => setSubmitConfirm(false), 3000);
      return;
    }

    const completedItems = valid.map((r) => {
      const formattedHours = formatToHHMM(r.hours.trim()) || r.hours.trim();
      const stamp = r.interval && r.interval.trim() !== "" ? `(${r.interval.trim()}) ` : "";
      const hrs = formattedHours ? ` - ${formattedHours}` : "";
      return `${stamp}${r.task}${hrs}`.trim();
    });

    const tasksWithTimings = valid.map((r) => ({
      task: r.task.trim(),
      interval: r.interval?.trim() || "",
      timeTaken: formatToHHMM(r.hours.trim()) || r.hours.trim(),
      isTopTask: !!r.isTopTask,
    }));

    const computedTopTasks = valid.filter((r) => r.isTopTask).map((r) => r.task.trim());

    submit.mutate({
      summary: "End of Day submission",
      completedItems,
      tasksWithTimings,
      top3Tasks: computedTopTasks,
      date,
    });
  };

  const generatePreview = () => {
    const validRows = rows.filter((r) => r.task.trim().length > 0);
    if (validRows.length === 0) return "";

    const topTasks = validRows.filter((r) => r.isTopTask);
    const completedTasks = validRows;

    let text = "";
    if (topTasks.length > 0) {
      text += "Top Tasks:\n";
      topTasks.forEach((t, i) => {
        text += `${i + 1}. ${t.task}\n`;
      });
      text += "\n";
    }

    text += "Completed Today (Chronological Work Timeline):\n";
    completedTasks.forEach((t) => {
      const stamp = t.interval && t.interval.trim() !== "" ? `[${t.interval.trim()}] ` : "";
      const hrs = t.hours && t.hours.trim() ? ` - ${formatToHHMM(t.hours) || t.hours}` : "";
      text += `- ${stamp}${t.task}${hrs}\n`;
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

  const totalMinutes = rows.reduce(
    (acc, r) => acc + (r.task.trim() ? parseTimeToMinutes(r.hours) : 0),
    0
  );
  const totalHoursFormatted = (() => {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  })();

  return (
    <Backdrop>
      <div
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="bg-white p-6 rounded-xl w-full max-w-5xl shadow-2xl max-h-[95vh] flex gap-8 animate-in zoom-in-95 duration-200 overflow-hidden"
      >
        {/* Left Column */}
        <div className="flex-[1.6] flex flex-col min-w-0">
          <h2 className="m-0 mb-1 text-lg font-bold text-slate-900 flex items-center gap-2">
            🌙 {title || "End of Day Submission"}
          </h2>
          <p className="m-0 mb-3 text-xs text-slate-500">
            {subtitle || (
              <>
                Verify and complete your 2-hour interval work logs. Press <b>Enter</b> to add a row, or click <b>+ Same Slot</b> for multiple tasks in the same interval.
              </>
            )}
          </p>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md mb-3 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-2 min-h-[300px] border border-slate-200 rounded-lg">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-center font-bold text-slate-500 text-[11px] uppercase py-2 w-10">Top</th>
                  <th className="text-left font-bold text-slate-500 text-[11px] uppercase py-2 w-44 pl-2">Time Stamp</th>
                  <th className="text-left font-bold text-slate-500 text-[11px] uppercase py-2 pl-2">Task Description *</th>
                  <th className="text-right font-bold text-slate-500 text-[11px] uppercase py-2 w-28 pr-2">Duration *</th>
                  <th className="text-right font-bold text-slate-500 text-[11px] uppercase py-2 w-28 pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id || i}
                    className={`border-b border-slate-100 last:border-0 transition-colors ${
                      row.isTopTask ? "bg-blue-50/50" : "bg-white"
                    }`}
                  >
                    <td className="py-1.5 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={row.isTopTask || false}
                        onChange={(e) => handleUpdate(i, "isTopTask", e.target.checked)}
                        className="w-4 h-4 cursor-pointer accent-blue-600"
                        title="Mark as Top 3 Task"
                      />
                    </td>
                    <td className="py-1.5 pl-2">
                      <input
                        ref={(el) => {
                          intervalRefs.current[i] = el;
                        }}
                        type="text"
                        value={row.interval || ""}
                        onChange={(e) => handleUpdate(i, "interval", e.target.value)}
                        placeholder="10:00 AM – 12:00 PM"
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 bg-slate-50"
                      />
                    </td>
                    <td className="py-1.5 pl-2">
                      <input
                        ref={(el) => {
                          taskRefs.current[i] = el;
                        }}
                        type="text"
                        value={row.task}
                        onChange={(e) => handleUpdate(i, "task", e.target.value)}
                        onKeyDown={(e) => handleTaskKeyDown(e, i)}
                        placeholder={row.interval ? `Task for ${row.interval}...` : "e.g. Built Analytics dashboard"}
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900"
                      />
                    </td>
                    <td className="py-1.5 pl-2 pr-2">
                      <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2 py-1">
                        <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                        <input
                          ref={(el) => {
                            hoursRefs.current[i] = el;
                          }}
                          type="text"
                          value={row.hours || ""}
                          onChange={(e) => handleUpdate(i, "hours", e.target.value)}
                          onBlur={() => handleUpdate(i, "hours", formatToHHMM(row.hours))}
                          onKeyDown={(e) => handleHoursKeyDown(e, i)}
                          placeholder="02:00"
                          className="w-full border-none outline-none text-xs font-bold text-amber-700 text-right bg-transparent"
                        />
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right align-middle whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAddSameTimestampRow(i)}
                          className="border border-blue-200 bg-blue-50 text-blue-600 text-[11px] font-semibold px-2 py-1 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
                          title="Add another task for this exact same interval"
                        >
                          <Plus className="w-3 h-3" /> Same Slot
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(i)}
                          className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                          title="Remove row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between items-center bg-slate-50 px-4 py-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={handleAddRow}
                className="text-blue-600 text-xs font-semibold hover:text-blue-700 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Task / Missed Interval
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Total Tracked Time:
                </span>
                <span className="text-sm text-emerald-700 font-extrabold font-mono bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  {totalHoursFormatted} hrs
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className={`text-xs transition-colors ${
                resetConfirm ? "text-red-600 font-bold" : "text-slate-400 hover:text-red-500"
              }`}
            >
              {resetConfirm ? "Click to confirm reset" : "Reset all rows"}
            </button>
            <div className="flex gap-2.5">
              {!forceSubmit && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submit.isPending}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submit.isPending}
                className={`px-5 py-2 rounded-lg font-semibold text-xs transition-colors text-white disabled:opacity-50 ${
                  submitConfirm ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {submit.isPending ? "Submitting..." : submitConfirm ? "Click to Confirm" : "Submit Final EOD"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="w-[300px] shrink-0 bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col min-h-0">
          {todoItems.length > 0 && (
            <div className="mb-4 bg-white p-3 rounded-lg border border-slate-200">
              <h3 className="m-0 mb-2 text-xs text-slate-700 font-bold flex items-center gap-1.5">
                📝 Today&apos;s Morning Planned Tasks:
              </h3>
              <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[22vh]">
                {todoItems.map((todo, idx) => {
                  const isLogged = rows.some(
                    (r) => r.task.toLowerCase().includes(todo.text.toLowerCase())
                  );
                  return (
                    <div
                      key={idx}
                      className={`text-xs flex items-center gap-2 py-0.5 ${
                        isLogged ? "text-emerald-600 line-through" : "text-slate-600"
                      }`}
                    >
                      <span className="text-[10px]">{isLogged ? "✅" : "⚪"}</span>
                      <span className="truncate">{todo.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-2">
            <h3 className="m-0 text-xs text-slate-700 font-bold">Live Preview</h3>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!previewText}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-blue-600 border border-slate-300 hover:bg-slate-50"
              } ${!previewText ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white p-3 rounded-md border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-mono min-h-[150px]">
            {previewText || (
              <span className="text-slate-400 italic">No tasks entered yet...</span>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
