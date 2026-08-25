"use client";
import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Clock,
  Plus,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Copy,
  Save,
} from "lucide-react";

const COUNT_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);
const readPositiveCount = (value: unknown) => {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : undefined;
};

const getLocalDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export function stripDuplicatedIntervalFromTask(
  task: string,
  interval: string,
): string {
  const cleanTask = String(task || "").trim();
  const cleanInterval = String(interval || "").trim();
  if (!cleanTask || !cleanInterval) return cleanTask;
  const suffix = `(${cleanInterval})`;
  return cleanTask.endsWith(suffix)
    ? cleanTask.slice(0, -suffix.length).trim()
    : cleanTask;
}

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

export function parseTimeStringToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2] || "0", 10);
  const ampm = match[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h * 60 + m;
}

export function parseIntervalRange(
  intervalStr: string,
): { startMin: number; endMin: number } | null {
  if (!intervalStr) return null;
  const parts = intervalStr.split(/–|-|to/i);
  if (parts.length < 2) return null;
  const startMin = parseTimeStringToMinutes(parts[0].trim());
  const endMin = parseTimeStringToMinutes(parts[1].trim());
  if (startMin !== null && endMin !== null) {
    return { startMin, endMin };
  }
  return null;
}

export function suggestNextInterval(rows: EodRow[], index: number, shiftInfo?: any): string {
  const prevRow = rows[index - 1];
  if (prevRow?.interval) {
    const range = parseIntervalRange(prevRow.interval);
    if (range) {
      return `${formatMinToAmPm(range.endMin)} – ${formatMinToAmPm(range.endMin + 60)}`;
    }
  }
  const start = shiftInfo?.shiftStartTime || "10:00 AM";
  return `${start} – ${formatMinToAmPm(parseTimeStringToMinutes(start)! + 60)}`;
}

export function areIntervalsMatching(
  intervalA: string,
  intervalB: string,
): boolean {
  if (!intervalA || !intervalB) return false;
  const cleanA = intervalA.toLowerCase().replace(/[^0-9apm]/g, "");
  const cleanB = intervalB.toLowerCase().replace(/[^0-9apm]/g, "");
  if (cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA))
    return true;

  const rangeA = parseIntervalRange(intervalA);
  const rangeB = parseIntervalRange(intervalB);
  if (rangeA && rangeB) {
    return Math.abs(rangeA.startMin - rangeB.startMin) <= 20;
  }
  return false;
}

export function generateDaySlots(
  startMin: number,
  shiftEndTimeStr?: string,
  totalShiftHours = 9,
  onlyElapsed = false,
  now = new Date(),
): string[] {
  let endMin = startMin + totalShiftHours * 60;
  if (shiftEndTimeStr) {
    const parsedEnd = parseTimeStringToMinutes(shiftEndTimeStr);
    if (parsedEnd !== null && parsedEnd > startMin) {
      endMin = parsedEnd;
    }
  }

  const slots: string[] = [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let cur = startMin;
  while (cur < endMin) {
    const next = Math.min(cur + 120, endMin);
    if (onlyElapsed && next > nowMin) break;
    slots.push(`${formatMinToAmPm(cur)} – ${formatMinToAmPm(next)}`);
    cur = next;
    if (cur >= endMin) break;
  }
  return slots;
}

interface EodRow {
  id: string;
  interval?: string;
  task: string;
  hours: string;
  count?: number;
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
  const getTodayStr = getLocalDateKey;

  const [rows, setRows] = useState<EodRow[]>(() => {
    const today = getTodayStr();
    if ((!date || date === today) && !initialData) {
      const saved = localStorage.getItem("eod_draft_web_v2");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.date === today && Array.isArray(parsed.rows)) {
            const savedRows = parsed.rows
              .filter((row: any) => String(row.task || "").trim())
              .map((row: any) => ({
                ...row,
                id: row.id || crypto.randomUUID(),
                task: stripDuplicatedIntervalFromTask(
                  row.task || "",
                  row.interval || "",
                ),
                interval: row.interval || "",
                hours: formatToHHMM(row.hours || "") || row.hours || "",
                count: readPositiveCount(row.count ?? row.callCount),
                isTopTask: Boolean(row.isTopTask),
              }));
            if (savedRows.length > 0) return savedRows;
          }
        } catch {}
      }
    }

    if (!date && !initialData) return [];

    return [
      {
        id: crypto.randomUUID(),
        task: "",
        interval: "10:00 AM – 12:00 PM",
        hours: "",
        isTopTask: false,
      },
    ];
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
      const enteredRows = rows.filter((row) => row.task.trim());
      if (enteredRows.length > 0) {
        localStorage.setItem(
          "eod_draft_web_v2",
          JSON.stringify({ date: getTodayStr(), rows: enteredRows }),
        );
      } else {
        localStorage.removeItem("eod_draft_web_v2");
      }
    }
  }, [rows, date]);

  useEffect(() => {
    const fetchExisting = async () => {
      if (initialData) {
        const structuredItems = Array.isArray(initialData.tasksWithTimings)
          ? initialData.tasksWithTimings
          : [];
        const items = (initialData.completedItems as string[]) || [];
        const top3 = initialData.top3Tasks || [];
        const newRows =
          structuredItems.length > 0
            ? structuredItems.map((item: any) => ({
                id: crypto.randomUUID(),
                task: String(item.text || item.task || "").trim(),
                interval: String(item.interval || "").trim(),
                hours:
                  formatToHHMM(String(item.timeTaken || "")) ||
                  String(item.timeTaken || ""),
                count: readPositiveCount(item.count ?? item.callCount),
                isTopTask:
                  Boolean(item.isTopTask) ||
                  top3.includes(String(item.text || item.task || "").trim()),
              }))
            : items.map((rawItem) => {
                const countMatch = rawItem.match(
                  /\[\s*(?:count\s*:\s*)?(\d+)\s*(?:calls?)?\s*\]/i,
                );
                const item = rawItem
                  .replace(/\[\s*(?:count\s*:\s*)?\d+\s*(?:calls?)?\s*\]/i, " ")
                  .trim();
                let taskObj: any = {
                  task: item,
                  hours: "",
                  count: readPositiveCount(countMatch?.[1]),
                  isTopTask: false,
                  interval: "",
                };
                const stampMatch = item.match(
                  /^(.*?)\s*\(([^)]*(?:\d{1,2}:\d{2}|AM|PM|–|-)[^)]*)\)\s*-\s*(.*?)$/i,
                );
                if (stampMatch) {
                  taskObj.task = stampMatch[1].trim();
                  taskObj.interval = stampMatch[2].trim();
                  taskObj.hours =
                    formatToHHMM(stampMatch[3].trim()) || stampMatch[3].trim();
                  taskObj.isTopTask = top3.includes(taskObj.task);
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

          const recordedCheckins = 
            Array.isArray(payload?.tasksWithTimings) && payload.tasksWithTimings.length > 0
              ? payload.tasksWithTimings
              : Array.isArray(payload?.recordedCheckins)
              ? payload.recordedCheckins
              : [];

          const allExistingTasks: EodRow[] = [];

          const mergeExistingTask = (incoming: EodRow) => {
            const normalizedIncoming = {
              ...incoming,
              task: stripDuplicatedIntervalFromTask(
                incoming.task,
                incoming.interval || "",
              ),
            };
            const existingIndex = allExistingTasks.findIndex(
              (task) =>
                task.task.trim().toLowerCase() ===
                  normalizedIncoming.task.trim().toLowerCase() &&
                areIntervalsMatching(
                  task.interval || "",
                  normalizedIncoming.interval || "",
                ),
            );

            if (existingIndex < 0) {
              allExistingTasks.push(normalizedIncoming);
              return;
            }

            const existing = allExistingTasks[existingIndex];
            allExistingTasks[existingIndex] = {
              ...existing,
              ...normalizedIncoming,
              id: existing.id,
              hours: normalizedIncoming.hours?.trim() || existing.hours || "",
              count: normalizedIncoming.count ?? existing.count,
              isTopTask:
                normalizedIncoming.isTopTask || Boolean(existing.isTopTask),
              sourceTodoText:
                normalizedIncoming.sourceTodoText || existing.sourceTodoText,
            };
          };

          recordedCheckins.forEach((c: any) => {
            mergeExistingTask({
              id: crypto.randomUUID(),
              task: stripDuplicatedIntervalFromTask(c.text, c.interval || ""),
              interval: c.interval || "",
              hours: formatToHHMM(c.timeTaken) || c.timeTaken || "",
              count: readPositiveCount(c.count ?? c.callCount),
              isTopTask: !!c.isTopTask,
            });
          });

          const savedDraft = localStorage.getItem("eod_draft_web_v2");
          if (savedDraft) {
            try {
              const parsed = JSON.parse(savedDraft);
              if (parsed.date === getTodayStr() && Array.isArray(parsed.rows)) {
                parsed.rows
                  .filter((row: any) => String(row.task || "").trim())
                  .forEach((row: any) => {
                    mergeExistingTask({
                      id: row.id || crypto.randomUUID(),
                      task: stripDuplicatedIntervalFromTask(
                        row.task || "",
                        row.interval || "",
                      ),
                      interval: row.interval || "",
                      hours: formatToHHMM(row.hours || "") || row.hours || "",
                      count: readPositiveCount(row.count ?? row.callCount),
                      isTopTask: Boolean(row.isTopTask),
                      sourceTodoText: row.sourceTodoText,
                    });
                  });
              }
            } catch {}
          }

          // Determine start time for the day slots
          let startMin = 10 * 60; // 10:00 AM default
          if (allExistingTasks.length > 0 && allExistingTasks[0].interval) {
            const range = parseIntervalRange(allExistingTasks[0].interval);
            if (range) startMin = range.startMin;
          } else if (shiftInfo?.loginTime) {
            const parsed = parseTimeStringToMinutes(shiftInfo.loginTime);
            if (parsed !== null) startMin = parsed;
          } else if (shiftInfo?.shiftStartTime) {
            const parsed = parseTimeStringToMinutes(shiftInfo.shiftStartTime);
            if (parsed !== null) startMin = parsed;
          }

          const daySlots = generateDaySlots(
            startMin,
            shiftInfo?.shiftEndTime,
            9,
            true,
          );

          const newRows: EodRow[] = [];
          const processedTaskIds = new Set<string>();

          daySlots.forEach((slot) => {
            const matchingTasks = allExistingTasks.filter(
              (t) =>
                !processedTaskIds.has(t.id) &&
                areIntervalsMatching(slot, t.interval || ""),
            );

            if (matchingTasks.length > 0) {
              matchingTasks.forEach((t) => {
                processedTaskIds.add(t.id);
                newRows.push({
                  ...t,
                  interval: t.interval || slot,
                });
              });
            } else {
              // Missed interval
              newRows.push({
                id: crypto.randomUUID(),
                task: "",
                interval: slot,
                hours: "",
                isTopTask: false,
              });
            }
          });

          allExistingTasks.forEach((t) => {
            if (!processedTaskIds.has(t.id)) {
              newRows.push(t);
            }
          });

          if (newRows.length > 0) {
            setRows(newRows);
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
          hours: "",
          isTopTask: false,
        },
        ...prev.slice(index + 1),
      ];
      setTimeout(() => {
        taskRefs.current[index + 1]?.focus();
      }, 30);
      return next;
    });
  };

  // Enter key: Add a row with BLANK timestamp
  const handleTaskKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
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
        }, 30);
        return next;
      });
    }
  };

  const handleHoursKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
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
        }, 30);
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
      }, 30);
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
            interval: "",
            task: "",
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
    const daySlots = generateDaySlots(
      10 * 60,
      shiftInfo?.shiftEndTime,
      9,
      !date || date === getTodayStr(),
    );
    setRows(
      daySlots.map((slot) => ({
        id: crypto.randomUUID(),
        interval: slot,
        task: "",
        hours: "",
        isTopTask: false,
      })),
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
        hours: formatToHHMM(r.hours || "") || r.hours || "",
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
          const taskPart = cols
            .slice(1, cols.length - 1)
            .join(" ")
            .trim();
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
      .filter((r) => r && r.task) as {
      interval: string;
      task: string;
      hours: string;
    }[];

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

  const submit = useMutation({
    mutationFn:
      customSubmitFn ||
      ((data: any) => api.post("/api/daily-flow/me/eod", data)),
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
      return showError(
        "Time duration is mandatory for all tasks! (e.g. 02:00, 1h 30m, 45m)",
      );
    }

    const invalidCount = valid.some(
      (row) =>
        row.count !== undefined &&
        (!Number.isInteger(row.count) || Number(row.count) < 1),
    );
    if (invalidCount) {
      return showError("Count must be a positive whole number when provided.");
    }

    if (!submitConfirm) {
      setSubmitConfirm(true);
      setTimeout(() => setSubmitConfirm(false), 3000);
      return;
    }

    const completedItems = valid.map((r) => {
      const formattedHours = formatToHHMM(r.hours.trim()) || r.hours.trim();
      const stamp =
        r.interval && r.interval.trim() !== "" ? `(${r.interval.trim()}) ` : "";
      const hrs = formattedHours ? ` - ${formattedHours}` : "";
      const count = r.count ? ` [Count: ${r.count}]` : "";
      return `${stamp}${r.task}${count}${hrs}`.trim();
    });

    const tasksWithTimings = valid.map((r) => ({
      text: r.task.trim(),
      interval: r.interval?.trim() || "",
      timeTaken: formatToHHMM(r.hours.trim()) || r.hours.trim(),
      count: r.count,
      callCount: /\bcalls?\b/i.test(r.task) ? r.count : undefined,
      isTopTask: !!r.isTopTask,
    }));

    const computedTopTasks = valid
      .filter((r) => r.isTopTask)
      .map((r) => r.task.trim());

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
        text += `${i + 1}. ${t.task}${t.count ? ` [Count: ${t.count}]` : ""}\n`;
      });
      text += "\n";
    }

    text += "Completed Today (Chronological Work Timeline):\n";
    completedTasks.forEach((t) => {
      const stamp =
        t.interval && t.interval.trim() !== "" ? `[${t.interval.trim()}] ` : "";
      const hrs =
        t.hours && t.hours.trim()
          ? ` - ${formatToHHMM(t.hours) || t.hours}`
          : "";
      text += `- ${stamp}${t.task}${t.count ? ` [Count: ${t.count}]` : ""}${hrs}\n`;
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

  const handleSaveDraft = () => {
    localStorage.setItem(
      "eod_draft_web_v2",
      JSON.stringify({ date: getTodayStr(), rows }),
    );
    setSubmitConfirm(false);
    onClose();
  };

  const totalMinutes = rows.reduce(
    (acc, r) => acc + (r.task.trim() ? parseTimeToMinutes(r.hours) : 0),
    0,
  );
  const totalHoursFormatted = (() => {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  })();

  return (
    <Backdrop>
      <datalist id="web-eod-count-options">
        {COUNT_OPTIONS.map((count) => (
          <option key={count} value={count} />
        ))}
      </datalist>
      <div
        onPaste={handlePaste}
        className="bg-white rounded-xl w-full max-w-5xl shadow-2xl h-[88vh] max-h-[88vh] flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
          <div>
            <h2 className="m-0 text-lg font-bold text-slate-900 flex items-center gap-2">
              🌙 {title || "End of Day Submission"}
            </h2>
            <p className="m-0 mt-0.5 text-xs text-slate-500">
              {subtitle || (
                <>
                  Verify and complete your 2-hour interval work logs. Press{" "}
                  <b>Enter</b> to add a row, or click <b>+ Same Slot</b> for
                  multiple tasks in the same interval.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-3 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Main Area */}
        <div className="p-4 px-6 flex gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Left Column (Table) */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2.5">
            <div className="flex-1 min-h-0 border border-slate-200 rounded-lg flex flex-col overflow-hidden bg-white">
              {/* Scrollable table container */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="text-center font-bold text-slate-500 text-[11px] uppercase py-2 w-10">
                        Top
                      </th>
                      <th className="text-left font-bold text-slate-500 text-[11px] uppercase py-2 w-44 pl-2">
                        Time Stamp
                      </th>
                      <th className="text-left font-bold text-slate-500 text-[11px] uppercase py-2 pl-2">
                        Task Description *
                      </th>
                      <th className="text-center font-bold text-slate-500 text-[11px] uppercase py-2 w-20 px-1">
                        Count
                        <span className="block text-[9px] font-medium normal-case">
                          Optional
                        </span>
                      </th>
                      <th className="text-right font-bold text-slate-500 text-[11px] uppercase py-2 w-28 pr-2">
                        Duration *
                      </th>
                      <th className="text-right font-bold text-slate-500 text-[11px] uppercase py-2 w-28 pr-2">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const previousInterval =
                        rows[i - 1]?.interval?.trim() || "";
                      const currentInterval = row.interval?.trim() || "";
                      const startsNewInterval =
                        i > 0 &&
                        !!previousInterval &&
                        !!currentInterval &&
                        !areIntervalsMatching(
                          previousInterval,
                          currentInterval,
                        );

                      return (
                        <React.Fragment key={row.id || i}>
                          {startsNewInterval && (
                            <tr
                              aria-label={`Start of ${currentInterval} time slot`}
                            >
                              <td
                                colSpan={6}
                                className="border-y border-slate-200 border-t-2 bg-slate-50 px-3 py-2"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="h-px flex-1 bg-slate-300" />
                                  <span className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-widest text-slate-600">
                                    {currentInterval} · Time Slot
                                  </span>
                                  <span className="h-px flex-1 bg-slate-300" />
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr
                            className={`border-b border-slate-100 last:border-0 transition-colors ${
                              row.isTopTask ? "bg-blue-50/50" : "bg-white"
                            }`}
                          >
                            <td className="py-1.5 text-center align-middle">
                              <input
                                type="checkbox"
                                checked={row.isTopTask || false}
                                onChange={(e) =>
                                  handleUpdate(i, "isTopTask", e.target.checked)
                                }
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
                                onChange={(e) =>
                                  handleUpdate(i, "interval", e.target.value)
                                }
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
                                onChange={(e) =>
                                  handleUpdate(i, "task", e.target.value)
                                }
                                onKeyDown={(e) => handleTaskKeyDown(e, i)}
                                placeholder={
                                  row.interval
                                    ? `Task for ${row.interval}...`
                                    : "e.g. Built Analytics dashboard"
                                }
                                className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900"
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                list="web-eod-count-options"
                                value={row.count ?? ""}
                                onChange={(e) =>
                                  handleUpdate(
                                    i,
                                    "count",
                                    e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  )
                                }
                                placeholder="Count"
                                aria-label={`Quantity completed for ${row.task || "this task"}`}
                                title="Optional quantity: calls, reach-outs, reels, edits, listings, or any countable output"
                                className="w-full rounded border border-blue-300 bg-blue-50 px-1.5 py-1.5 text-center text-xs font-bold text-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                                  onChange={(e) =>
                                    handleUpdate(i, "hours", e.target.value)
                                  }
                                  onBlur={() =>
                                    handleUpdate(
                                      i,
                                      "hours",
                                      formatToHHMM(row.hours),
                                    )
                                  }
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
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="flex justify-between items-center bg-slate-50 px-4 py-2 border-t border-slate-200 flex-shrink-0">
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

            {/* Action Buttons */}
            <div className="flex items-center justify-between flex-shrink-0 pt-1">
              <button
                type="button"
                onClick={handleReset}
                className={`text-xs transition-colors ${
                  resetConfirm
                    ? "text-red-600 font-bold"
                    : "text-slate-400 hover:text-red-500"
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
                {(!date || date === getTodayStr()) && (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={submit.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                    title="Save locally without submitting the EOD"
                  >
                    <Save className="h-3.5 w-3.5" /> Save Draft & Close
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submit.isPending}
                  className={`px-5 py-2 rounded-lg font-semibold text-xs transition-colors text-white disabled:opacity-50 ${
                    submitConfirm
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {submit.isPending
                    ? "Submitting..."
                    : submitConfirm
                      ? "Click to Confirm"
                      : "Submit Final EOD"}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="w-[280px] shrink-0 bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col min-h-0">
            {todoItems.length > 0 && (
              <div className="mb-3 bg-white p-2.5 rounded-lg border border-slate-200 flex-shrink-0">
                <h3 className="m-0 mb-1.5 text-xs text-slate-700 font-bold flex items-center gap-1.5">
                  📝 Today&apos;s Planned Tasks:
                </h3>
                <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[22vh]">
                  {todoItems.map((todo, idx) => {
                    const isLogged = rows.some(
                      (r) =>
                        r.sourceTodoText === todo.text ||
                        (r.task &&
                          r.task.toLowerCase().trim() ===
                            todo.text.toLowerCase().trim()),
                    );
                    return (
                      <label
                        key={idx}
                        className="text-xs flex items-start gap-2 py-0.5 cursor-pointer select-none text-slate-700 hover:text-slate-900"
                      >
                        <input
                          type="checkbox"
                          checked={isLogged}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRows((prev) => {
                                const alreadyPresent = prev.some(
                                  (r) =>
                                    r.sourceTodoText === todo.text ||
                                    (r.task &&
                                      r.task.toLowerCase().trim() ===
                                        todo.text.toLowerCase().trim()),
                                );
                                if (alreadyPresent) return prev;

                                const emptyIdx = prev.findIndex(
                                  (r) => !r.task || r.task.trim() === "",
                                );
                                if (emptyIdx >= 0) {
                                  const updated = [...prev];
                                  updated[emptyIdx] = {
                                    ...updated[emptyIdx],
                                    task: todo.text,
                                    sourceTodoText: todo.text,
                                    hours: updated[emptyIdx].hours || "",
                                  };
                                  return updated;
                                }

                                return [
                                  ...prev,
                                  {
                                    id: crypto.randomUUID(),
                                    task: todo.text,
                                    interval: "",
                                    hours: "",
                                    isTopTask: false,
                                    sourceTodoText: todo.text,
                                  },
                                ];
                              });
                            } else {
                              setRows((prev) =>
                                prev.filter(
                                  (r) =>
                                    !(
                                      r.sourceTodoText === todo.text ||
                                      (r.task &&
                                        r.task.toLowerCase().trim() ===
                                          todo.text.toLowerCase().trim())
                                    ),
                                ),
                              );
                            }
                          }}
                          className="mt-0.5 w-3.5 h-3.5 accent-blue-600 cursor-pointer flex-shrink-0"
                        />
                        <span
                          className={`truncate leading-tight ${isLogged ? "text-emerald-600 line-through" : ""}`}
                        >
                          {todo.text}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
              <h3 className="m-0 text-xs text-slate-700 font-bold">
                Live Preview
              </h3>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!previewText}
                className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-blue-600 border border-slate-300 hover:bg-slate-50"
                } ${!previewText ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {copied ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto bg-white p-2.5 rounded-md border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-mono">
              {previewText || (
                <span className="text-slate-400 italic">
                  No tasks entered yet...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
