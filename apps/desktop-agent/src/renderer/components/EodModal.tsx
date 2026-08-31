import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Clock,
  GripVertical,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Save,
} from "lucide-react";
import { getLocalDateKey } from "../../shared/daily-flow";

const COUNT_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);

export function isCallTask(task: string): boolean {
  return /\bcalls?\b/i.test(task);
}

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
    // A slot is only missed after its end time has actually passed.
    if (next > nowMin) break;
    slots.push(`${formatMinToAmPm(cur)} – ${formatMinToAmPm(next)}`);
    cur = next;
    if (cur >= endMin) break;
  }
  return slots;
}

export interface EodRow {
  id: string;
  task: string;
  interval: string;
  hours: string;
  count?: number;
  isTopTask?: boolean;
  sourceTodoText?: string;
}

const normalizeDraftRow = (row: any): EodRow => ({
  id: row.id || crypto.randomUUID(),
  task: stripDuplicatedIntervalFromTask(row.task || "", row.interval || ""),
  interval: row.interval || "",
  hours: formatToHHMM(row.hours || "") || row.hours || "",
  count:
    Number.isInteger(Number(row.count ?? row.callCount)) &&
    Number(row.count ?? row.callCount) > 0
      ? Number(row.count ?? row.callCount)
      : undefined,
  isTopTask: !!row.isTopTask,
  sourceTodoText: row.sourceTodoText,
});

const normalizeTaskKey = (task: string) =>
  task.trim().toLowerCase().replace(/\s+/g, " ");

const rowOccurrenceKey = (row: Pick<EodRow, "id">, index: number) =>
  `${row.id || "row"}:${index}`;

const buildRepeatedTaskOccurrences = (rows: EodRow[]) => {
  const grouped = new Map<
    string,
    Array<{ key: string; occurrence: number; total: number }>
  >();

  rows.forEach((row, index) => {
    const taskKey = normalizeTaskKey(row.task);
    if (!taskKey) return;
    const group = grouped.get(taskKey) || [];
    group.push({
      key: rowOccurrenceKey(row, index),
      occurrence: group.length + 1,
      total: 0,
    });
    grouped.set(taskKey, group);
  });

  const occurrences = new Map<string, { occurrence: number; total: number }>();
  grouped.forEach((group) => {
    if (group.length < 2) return;
    group.forEach((item) =>
      occurrences.set(item.key, {
        occurrence: item.occurrence,
        total: group.length,
      }),
    );
  });

  return occurrences;
};

const readEodDraftRows = (date: string): EodRow[] | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem("eod_draft_v2") || "null");
    if (parsed?.date === date && Array.isArray(parsed.rows)) {
      return parsed.rows.map(normalizeDraftRow);
    }
  } catch {}
  return null;
};

const currentTwoHourInterval = () => {
  const start = new Date();
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const format = (date: Date) =>
    date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  return `${format(start)} – ${format(end)}`;
};

const suggestNextInterval = (rows: EodRow[], index: number, shiftInfo?: any): string => {
  const intervalMins = shiftInfo?.checkinIntervalMinutes || 120;
  for (let i = index - 1; i >= 0; i--) {
    const prevInterval = rows[i]?.interval;
    if (prevInterval) {
      const parsed = parseIntervalRange(prevInterval);
      if (parsed) {
        const nextStart = parsed.endMin;
        const nextEnd = nextStart + intervalMins;
        return `${formatMinToAmPm(nextStart)} – ${formatMinToAmPm(nextEnd)}`;
      }
    }
  }
  // No previous row, use login time
  if (shiftInfo?.loginTime) {
    const parsedStart = parseTimeStringToMinutes(shiftInfo.loginTime);
    if (parsedStart !== null) {
      return `${formatMinToAmPm(parsedStart)} – ${formatMinToAmPm(parsedStart + intervalMins)}`;
    }
  }
  return currentTwoHourInterval();
};

const eodDeletedRowsStorageKey = (date: string) =>
  `eod_deleted_rows_v1:${date}`;

const eodRowDeletionKey = (row: Pick<EodRow, "task" | "interval">) =>
  `${row.interval.trim().toLowerCase().replace(/\s+/g, " ")}|${row.task
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;

const readDeletedEodRows = (date: string): string[] => {
  try {
    const value = JSON.parse(
      localStorage.getItem(eodDeletedRowsStorageKey(date)) || "[]",
    );
    return Array.isArray(value)
      ? value.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

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
    const getTodayStr = () => getLocalDateKey();

    const initialDraftRef = useRef<EodRow[] | null>(
      readEodDraftRows(getTodayStr()),
    );
    const shiftInfoAtOpenRef = useRef(shiftInfo);
    const rowsDirtyRef = useRef(false);
    const [rows, setRows] = useState<EodRow[]>(initialDraftRef.current || []);
    const [draftHydrated, setDraftHydrated] = useState(false);

    const [loading, setLoading] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [submitConfirm, setSubmitConfirm] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);
    const [todoItems, setTodoItems] = useState<{ text: string }[]>([]);
    const [deletedRowKeys, setDeletedRowKeys] = useState<string[]>(() =>
      readDeletedEodRows(getTodayStr()),
    );

    const taskRefs = useRef<(HTMLInputElement | null)[]>([]);
    const hoursRefs = useRef<(HTMLInputElement | null)[]>([]);
    const intervalRefs = useRef<(HTMLInputElement | null)[]>([]);
    const draggedRowIndex = useRef<number | null>(null);
    const [intervalSuggestion, setIntervalSuggestion] = useState<{
      index: number;
      value: string;
    } | null>(null);

    const showError = (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 3500);
    };

    const mutateRows = (updater: React.SetStateAction<EodRow[]>) => {
      rowsDirtyRef.current = true;
      setDraftHydrated(true);
      setRows(updater);
    };

    useEffect(() => {
      if (!draftHydrated) return;
      localStorage.setItem(
        "eod_draft_v2",
        JSON.stringify({ date: getTodayStr(), rows }),
      );
    }, [draftHydrated, rows]);

    useEffect(() => {
      const key = eodDeletedRowsStorageKey(getTodayStr());
      if (deletedRowKeys.length === 0) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(deletedRowKeys));
    }, [deletedRowKeys]);

    useEffect(() => {
      const fetchExistingData = async () => {
        try {
          const res = await axios.get(
            `${import.meta.env.VITE_API_BASE_URL}/me/eod/today?date=${getTodayStr()}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          const payload = res.data?.data;
          if (payload?.todayTodo?.items) {
            setTodoItems(payload.todayTodo.items);
          }

          // Once a draft exists it is the exact source of truth for row
          // contents, deletions and ordering. Check-ins are merged only when
          // opening EOD without an existing draft.
          if (initialDraftRef.current !== null) {
            if (!rowsDirtyRef.current) setRows(initialDraftRef.current);
            setDraftHydrated(true);
            return;
          }

          const recordedCheckins = 
            Array.isArray(payload?.tasksWithTimings) && payload.tasksWithTimings.length > 0
              ? payload.tasksWithTimings
              : Array.isArray(payload?.recordedCheckins)
              ? payload.recordedCheckins
              : [];

          const todayStr = getTodayStr();
          // Combine recorded check-ins without re-adding the
          // same task/interval pair. This also cleans duplicate check-ins from
          // older agent versions.
          const allExistingTasks: EodRow[] = [];

          const mergeExistingTask = (incoming: EodRow) => {
            const normalizedIncoming = {
              ...incoming,
              task: stripDuplicatedIntervalFromTask(
                incoming.task,
                incoming.interval,
              ),
            };
            const existingIndex = allExistingTasks.findIndex(
              (task) =>
                task.task.trim().toLowerCase() ===
                  normalizedIncoming.task.trim().toLowerCase() &&
                areIntervalsMatching(
                  task.interval,
                  normalizedIncoming.interval,
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
              count:
                Number.isInteger(Number(c.count ?? c.callCount)) &&
                Number(c.count ?? c.callCount) > 0
                  ? Number(c.count ?? c.callCount)
                  : undefined,
              isTopTask: !!c.isTopTask,
            });
          });

          // Determine start time for the day slots
          let startMin = 10 * 60; // 10:00 AM default
          const initialShiftInfo = shiftInfoAtOpenRef.current;
          if (initialShiftInfo?.loginTime) {
            const parsed = parseTimeStringToMinutes(initialShiftInfo.loginTime);
            if (parsed !== null) startMin = parsed;
          } else if (
            allExistingTasks.length > 0 &&
            allExistingTasks[0].interval
          ) {
            const range = parseIntervalRange(allExistingTasks[0].interval);
            if (range) startMin = range.startMin;
          } else {
            const loginKey = `workforce_login_time_${todayStr}`;
            const loginTs = parseInt(localStorage.getItem(loginKey) || "0", 10);
            if (loginTs > 0) {
              const d = new Date(loginTs);
              startMin = d.getHours() * 60 + d.getMinutes();
            } else if (initialShiftInfo?.shiftStartTime) {
              const parsed = parseTimeStringToMinutes(
                initialShiftInfo.shiftStartTime,
              );
              if (parsed !== null) startMin = parsed;
            }
          }

          // Generate day slots for this employee
          const daySlots = generateDaySlots(
            startMin,
            initialShiftInfo?.shiftEndTime,
          );

          // Build final row list:
          // For each slot, if tasks exist -> list them all (NO blank row!)
          // If no tasks exist for this slot -> render 1 single blank row for the missed interval!
          const newRows: EodRow[] = [];
          const processedTaskIds = new Set<string>();

          daySlots.forEach((slot) => {
            const matchingTasks = allExistingTasks.filter(
              (t) =>
                !processedTaskIds.has(t.id) &&
                areIntervalsMatching(slot, t.interval),
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
              // Missed interval! Provide a blank row for backfilling
              newRows.push({
                id: crypto.randomUUID(),
                task: "",
                interval: slot,
                hours: "",
                isTopTask: false,
              });
            }
          });

          // Append any remaining tasks that had custom non-matching interval tags
          allExistingTasks.forEach((t) => {
            if (!processedTaskIds.has(t.id)) {
              newRows.push(t);
            }
          });

          const deletedKeys = new Set(readDeletedEodRows(todayStr));
          if (!rowsDirtyRef.current) {
            setRows(
              newRows.filter((row) => !deletedKeys.has(eodRowDeletionKey(row))),
            );
          }
          setDraftHydrated(true);
        } catch {
          if (rowsDirtyRef.current || initialDraftRef.current !== null) {
            setDraftHydrated(true);
          }
        }
      };
      fetchExistingData();
    }, [token]);

    // Button on right: Add a row for the SAME timestamp as this row
    const handleAddSameTimestampRow = (index: number) => {
      mutateRows((prev) => {
        const currentInterval = prev[index]?.interval || "";
        const next = [
          ...prev.slice(0, index + 1),
          {
            id: crypto.randomUUID(),
            task: "",
            interval: currentInterval, // SAME TIMESTAMP AS ABOVE
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
        mutateRows((prev) => {
          const next = [
            ...prev.slice(0, index + 1),
            {
              id: crypto.randomUUID(),
              task: "",
              interval: "", // BLANK TIMESTAMP
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
        mutateRows((prev) => {
          const next = [
            ...prev.slice(0, index + 1),
            {
              id: crypto.randomUUID(),
              task: "",
              interval: "", // BLANK TIMESTAMP
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
      mutateRows((prev) => {
        const next = [
          ...prev,
          {
            id: crypto.randomUUID(),
            task: "",
            interval: "",
            hours: "",
            isTopTask: false,
          },
        ];
        setTimeout(() => {
          intervalRefs.current[next.length - 1]?.focus();
        }, 30);
        return next;
      });
    };

    const handleIntervalFocus = (index: number) => {
      if (rows[index]?.interval.trim()) return;
      setIntervalSuggestion({ index, value: suggestNextInterval(rows, index, shiftInfo) });
    };

    const handleIntervalKeyDown = (
      event: React.KeyboardEvent<HTMLInputElement>,
      index: number,
    ) => {
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !rows[index]?.interval.trim() &&
        intervalSuggestion?.index === index
      ) {
        event.preventDefault();
        handleUpdate(index, "interval", intervalSuggestion.value);
        setIntervalSuggestion(null);
        taskRefs.current[index]?.focus();
      }
    };

    const moveRow = (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      mutateRows((current) => {
        const next = [...current];
        const [moved] = next.splice(fromIndex, 1);
        if (!moved) return current;
        next.splice(toIndex, 0, moved);
        return next;
      });
    };

    const handleRemoveRow = (index: number) => {
      mutateRows((prev) => {
        const removed = prev[index];
        if (removed) {
          const key = eodRowDeletionKey(removed);
          setDeletedRowKeys((current) =>
            current.includes(key) ? current : [...current, key],
          );
        }
        return prev.filter((_, i) => i !== index);
      });
    };

    const handleReset = () => {
      if (!resetConfirm) {
        setResetConfirm(true);
        setTimeout(() => setResetConfirm(false), 3000);
        return;
      }
      setDeletedRowKeys((current) => [
        ...new Set([...current, ...rows.map(eodRowDeletionKey)]),
      ]);
      mutateRows([]);
      localStorage.removeItem("eod_draft_v2");
      setResetConfirm(false);
    };

    const handleSaveDraft = () => {
      localStorage.setItem(
        "eod_draft_v2",
        JSON.stringify({ date: getTodayStr(), rows }),
      );
      setSubmitConfirm(false);
      onClose();
    };

    const handleUpdate = (
      index: number,
      field: keyof EodRow,
      value: string | boolean | number | undefined,
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
      mutateRows(newRows);
    };

    const hasCountColumn = true;

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
    const repeatedTaskOccurrences = buildRepeatedTaskOccurrences(rows);

    // Table parsing for paste and file upload
    const combineTasks = (prevRows: EodRow[], newRows: Partial<EodRow>[]) => {
      const validPrev = prevRows.filter((p) => p.task.trim() !== "");
      return [
        ...validPrev,
        ...newRows.map((r) => ({
          id: crypto.randomUUID(),
          interval: r.interval || "",
          task: r.task || "",
          hours: formatToHHMM(r.hours || "") || r.hours || "",
          count: r.count,
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
        mutateRows((prev) => combineTasks(prev, parsedRows));
      }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("Text");
      if (text && (text.includes("\t") || /\r?\n/.test(text.trim()))) {
        e.preventDefault();
        processTableData(text);
      }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const [XLSX, buffer] = await Promise.all([
          import("xlsx"),
          file.arrayBuffer(),
        ]);
        const wb = XLSX.read(buffer, { type: "array" });
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
                hours: formatToHHMM(hoursText) || hoursText || "",
              });
            }
          }
        });

        if (newRows.length > 0) {
          mutateRows((prev) => combineTasks(prev, newRows));
        } else {
          showError("No valid rows found in file.");
        }
      } catch {
        showError("Failed to parse file. Make sure it's valid Excel/CSV.");
      } finally {
        input.value = "";
      }
    };

    const handleSubmit = async () => {
      const valid = rows.filter((r) => r.task.trim().length > 0);
      if (valid.length < 1) {
        return showError("Please enter at least one completed task.");
      }

      const missingHours = valid.some((r) => !r.hours || r.hours.trim() === "");
      if (missingHours) {
        return showError(
          "Time duration is mandatory for all tasks! (e.g. 02:00, 1h 30m, 45m)",
        );
      }

      const invalidCount = valid.some(
        (r) =>
          r.count !== undefined &&
          (!Number.isInteger(r.count) || Number(r.count) < 1),
      );
      if (invalidCount) {
        return showError(
          "Count must be a positive whole number when provided.",
        );
      }

      if (!submitConfirm) {
        setSubmitConfirm(true);
        setTimeout(() => setSubmitConfirm(false), 3000);
        return;
      }

      const completedItems = valid.map((r) => {
        const formattedHours = formatToHHMM(r.hours.trim()) || r.hours.trim();
        const countSummary = r.count ? ` [Count: ${r.count}]` : "";
        if (r.interval && r.interval.trim()) {
          return `${r.task.trim()}${countSummary} (${r.interval.trim()}) - ${formattedHours}`;
        }
        return `${r.task.trim()}${countSummary} - ${formattedHours}`;
      });

      const tasksWithTimings = valid.map((r) => ({
        text: r.task.trim(),
        interval: r.interval.trim() || "2-Hour Interval",
        timeTaken: formatToHHMM(r.hours.trim()) || r.hours.trim(),
        count: r.count,
        callCount: isCallTask(r.task) ? r.count : undefined,
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
            date: getTodayStr(),
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        localStorage.removeItem("eod_draft_v2");
        localStorage.removeItem(eodDeletedRowsStorageKey(getTodayStr()));
        setDeletedRowKeys([]);
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
          const count = t.count ? ` [Count: ${t.count}]` : "";
          text += `${i + 1}. ${t.task}${count} (${t.interval || "Interval"}) - ${formatToHHMM(t.hours) || t.hours}\n`;
        });
        text += "\n";
      }

      text += "⏱️ COMPLETED WORK TIMELINE:\n";
      validRows.forEach((t) => {
        const hrs = t.hours.trim()
          ? ` [${formatToHHMM(t.hours) || t.hours}]`
          : "";
        const stamp = t.interval.trim() ? ` (${t.interval.trim()})` : "";
        const count = t.count ? ` [Count: ${t.count}]` : "";
        text += `• ${t.task}${count}${stamp}${hrs}\n`;
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
          padding: 16,
        }}
      >
        <style>{`
          .eod-placeholder::placeholder {
            color: #cbd5e1;
            font-weight: 400;
            opacity: 1;
          }
        `}</style>
        <div
          onPaste={handlePaste}
          style={{
            background: "#ffffff",
            borderRadius: 12,
            width: 1040,
            maxWidth: "96vw",
            height: "88vh",
            maxHeight: "88vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
          }}
        >
          <datalist id="eod-count-options">
            {COUNT_OPTIONS.map((count) => (
              <option key={count} value={count} />
            ))}
          </datalist>

          {/* Header */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#f8fafc",
              flexShrink: 0,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                🌙 End of Day (EOD) Submission
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                Verify and complete your 2-hour interval work logs. Press{" "}
                <b>Enter</b> to add a row, or click <b>+ Same Slot</b> for
                multiple tasks in the same interval.
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
                margin: "8px 20px 0",
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#b91c1c",
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Body */}
          <div
            style={{
              padding: "14px 20px",
              display: "flex",
              gap: 16,
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* Left Table Section */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Top bar: Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}
                >
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
                    padding: "3px 10px",
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

              {/* Table Outer Container */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  background: "#ffffff",
                }}
              >
                {/* Scrollable table area */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    scrollbarGutter: "stable",
                    overscrollBehavior: "contain",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 2,
                        background: "#f8fafc",
                      }}
                    >
                      <tr
                        style={{
                          background: "#f8fafc",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        <th
                          style={{
                            textAlign: "center",
                            padding: "8px 4px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#64748b",
                            width: 38,
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
                        {hasCountColumn && (
                          <th
                            style={{
                              textAlign: "center",
                              padding: "8px 6px",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#64748b",
                              width: 88,
                              textTransform: "uppercase",
                            }}
                          >
                            Count
                            <span
                              style={{
                                display: "block",
                                fontSize: 9,
                                fontWeight: 500,
                              }}
                            >
                              Optional
                            </span>
                          </th>
                        )}
                        <th
                          style={{
                            textAlign: "right",
                            padding: "8px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#64748b",
                            width: 110,
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
                            width: 115,
                            textTransform: "uppercase",
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const previousInterval =
                          rows[i - 1]?.interval?.trim() || "";
                        const currentInterval = row.interval?.trim() || "";
                        const repeatedTaskOccurrence =
                          repeatedTaskOccurrences.get(rowOccurrenceKey(row, i));
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
                                  colSpan={hasCountColumn ? 6 : 5}
                                  style={{
                                    padding: "7px 12px",
                                    background: "#f8fafc",
                                    borderTop: "2px solid #cbd5e1",
                                    borderBottom: "1px solid #e2e8f0",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 10,
                                    }}
                                  >
                                    <span
                                      style={{
                                        height: 1,
                                        flex: 1,
                                        background: "#cbd5e1",
                                      }}
                                    />
                                    <span
                                      style={{
                                        color: "#475569",
                                        fontSize: 10,
                                        fontWeight: 800,
                                        letterSpacing: "0.08em",
                                        textTransform: "uppercase",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {currentInterval} · Time Slot
                                    </span>
                                    <span
                                      style={{
                                        height: 1,
                                        flex: 1,
                                        background: "#cbd5e1",
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (draggedRowIndex.current !== null) {
                                  moveRow(draggedRowIndex.current, i);
                                  draggedRowIndex.current = null;
                                }
                              }}
                              style={{
                                borderBottom:
                                  i < rows.length - 1
                                    ? "1px solid #f1f5f9"
                                    : "none",
                                background: row.isTopTask
                                  ? "#eff6ff"
                                  : "#ffffff",
                              }}
                            >
                              {/* Top 3 Checkbox */}
                              <td
                                style={{
                                  padding: "6px 4px",
                                  verticalAlign: "middle",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 2,
                                  }}
                                >
                                  <span
                                    draggable
                                    onDragStart={(event) => {
                                      draggedRowIndex.current = i;
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData(
                                        "text/plain",
                                        row.id,
                                      );
                                    }}
                                    onDragEnd={() => {
                                      draggedRowIndex.current = null;
                                    }}
                                    title="Drag to reorder this task"
                                    style={{
                                      display: "grid",
                                      placeItems: "center",
                                      color: "#94a3b8",
                                      cursor: "grab",
                                    }}
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={!!row.isTopTask}
                                    onChange={(e) =>
                                      handleUpdate(
                                        i,
                                        "isTopTask",
                                        e.target.checked,
                                      )
                                    }
                                    title="Mark as Top 3 Task"
                                    style={{
                                      cursor: "pointer",
                                      width: 16,
                                      height: 16,
                                      accentColor: "#2563eb",
                                    }}
                                  />
                                </div>
                              </td>

                              {/* Time Stamp / Interval Input on Left */}
                              <td
                                style={{
                                  padding: "6px 6px",
                                  verticalAlign: "middle",
                                  position: "relative",
                                }}
                              >
                                <input
                                  className="eod-placeholder"
                                  ref={(el) => {
                                    intervalRefs.current[i] = el;
                                  }}
                                  type="text"
                                  value={row.interval || ""}
                                  onChange={(e) =>
                                    handleUpdate(i, "interval", e.target.value)
                                  }
                                  onFocus={() => handleIntervalFocus(i)}
                                  onBlur={() =>
                                    setTimeout(
                                      () => setIntervalSuggestion(null),
                                      120,
                                    )
                                  }
                                  onKeyDown={(event) =>
                                    handleIntervalKeyDown(event, i)
                                  }
                                  placeholder="e.g. 10:00 AM – 12:00 PM"
                                  style={{
                                    width: "100%",
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    border: "1px solid #cbd5e1",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#334155",
                                    background: row.interval
                                      ? "#f8fafc"
                                      : "#ffffff",
                                    boxSizing: "border-box",
                                  }}
                                />
                                {intervalSuggestion?.index === i &&
                                !row.interval.trim() ? (
                                  <button
                                    type="button"
                                    onMouseDown={(event) =>
                                      event.preventDefault()
                                    }
                                    onClick={() => {
                                      handleUpdate(
                                        i,
                                        "interval",
                                        intervalSuggestion.value,
                                      );
                                      setIntervalSuggestion(null);
                                      taskRefs.current[i]?.focus();
                                    }}
                                    style={{
                                      position: "absolute",
                                      zIndex: 20,
                                      top: "calc(100% - 2px)",
                                      left: 6,
                                      right: 6,
                                      padding: "7px 9px",
                                      border: "1px solid #bfdbfe",
                                      borderRadius: 7,
                                      background: "#eff6ff",
                                      color: "#1d4ed8",
                                      fontSize: 10,
                                      fontWeight: 700,
                                      textAlign: "left",
                                      boxShadow:
                                        "0 8px 18px rgba(15,23,42,.14)",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {intervalSuggestion.value}
                                    <span
                                      style={{
                                        float: "right",
                                        color: "#64748b",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Tab to accept
                                    </span>
                                  </button>
                                ) : null}
                              </td>

                              {/* Task Description */}
                              <td
                                style={{
                                  padding: "6px 6px",
                                  verticalAlign: "middle",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <input
                                    className="eod-placeholder"
                                    ref={(el) => {
                                      taskRefs.current[i] = el;
                                    }}
                                    type="text"
                                    value={row.task || ""}
                                    onChange={(e) =>
                                      handleUpdate(i, "task", e.target.value)
                                    }
                                    onKeyDown={(e) => handleTaskKeyDown(e, i)}
                                    placeholder={
                                      row.interval
                                        ? `Task for ${row.interval}...`
                                        : "e.g. Implemented API endpoints"
                                    }
                                    style={{
                                      width: "100%",
                                      minWidth: 0,
                                      padding: "6px 8px",
                                      borderRadius: 6,
                                      border: "1px solid #cbd5e1",
                                      fontSize: 13,
                                      color: "#0f172a",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                  {repeatedTaskOccurrence ? (
                                    <span
                                      title={`${row.task} appears ${repeatedTaskOccurrence.total} times today`}
                                      style={{
                                        flexShrink: 0,
                                        borderRadius: 999,
                                        background: "#eff6ff",
                                        border: "1px solid #bfdbfe",
                                        color: "#1d4ed8",
                                        fontSize: 10,
                                        fontWeight: 800,
                                        padding: "4px 7px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      #{repeatedTaskOccurrence.occurrence} of{" "}
                                      {repeatedTaskOccurrence.total}
                                    </span>
                                  ) : null}
                                </div>
                              </td>

                              {/* Optional quantity for any countable output */}
                              {hasCountColumn && (
                                <td
                                  style={{
                                    padding: "6px 4px",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  <input
                                    className="eod-placeholder"
                                    type="number"
                                    min={1}
                                    step={1}
                                    list="eod-count-options"
                                    aria-label={`Quantity completed for ${row.task || "this task"}`}
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
                                    style={{
                                      width: "100%",
                                      padding: "6px 4px",
                                      borderRadius: 6,
                                      border: "1px solid #93c5fd",
                                      background: "#eff6ff",
                                      color: "#1d4ed8",
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                    placeholder="Count"
                                    title="Optional quantity: calls, reach-outs, reels, edits, listings, or any countable output"
                                  />
                                </td>
                              )}

                              {/* Duration / Time Taken on Right */}
                              <td
                                style={{
                                  padding: "6px 6px",
                                  verticalAlign: "middle",
                                }}
                              >
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
                                    className="eod-placeholder"
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
                                        formatToHHMM(row.hours) || row.hours,
                                      )
                                    }
                                    onKeyDown={(e) => handleHoursKeyDown(e, i)}
                                    placeholder="e.g. 45m"
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
                              <td
                                style={{
                                  padding: "6px 6px",
                                  textAlign: "right",
                                  verticalAlign: "middle",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "flex-end",
                                    gap: 4,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleAddSameTimestampRow(i)}
                                    style={{
                                      border: "1px solid #bfdbfe",
                                      background: "#eff6ff",
                                      color: "#2563eb",
                                      fontSize: 11,
                                      fontWeight: 600,
                                      padding: "3px 7px",
                                      borderRadius: 5,
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 2,
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
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Total Time footer inside Table */}
                <div
                  style={{
                    flexShrink: 0,
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

                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      Total Tracked Work Time:
                    </span>
                    <span
                      style={{
                        fontSize: 13,
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
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
                  {resetConfirm
                    ? "Click again to confirm reset"
                    : "Reset all rows"}
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: "7px 16px",
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
                    onClick={handleSaveDraft}
                    disabled={loading}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 6,
                      border: "1px solid #93c5fd",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: loading ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    title="Save locally without submitting the EOD"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Draft & Close
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                      padding: "7px 20px",
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
                    {loading
                      ? "Submitting..."
                      : submitConfirm
                        ? "Click to Confirm EOD"
                        : "Submit Final EOD"}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Helper Column */}
            <div
              style={{
                width: 290,
                flexShrink: 0,
                minHeight: 0,
                background: "#f8fafc",
                padding: 14,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                overflowY: "auto",
              }}
            >
              {/* Morning To-Do reference with interactive click-to-add checkboxes */}
              {todoItems.length > 0 && (
                <div
                  style={{
                    background: "#ffffff",
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    flexShrink: 0,
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
                    📋 Today's Planned Tasks:
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: "22vh",
                      overflowY: "auto",
                    }}
                  >
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
                          style={{
                            fontSize: 12,
                            color: isLogged ? "#16a34a" : "#334155",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isLogged}
                            onChange={(e) => {
                              if (e.target.checked) {
                                mutateRows((prev) => {
                                  const alreadyPresent = prev.some(
                                    (r) =>
                                      r.sourceTodoText === todo.text ||
                                      (r.task &&
                                        r.task.toLowerCase().trim() ===
                                          todo.text.toLowerCase().trim()),
                                  );
                                  if (alreadyPresent) return prev;

                                  // Check if there is an empty task row to fill
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
                                mutateRows((prev) =>
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
                            style={{
                              cursor: "pointer",
                              marginTop: 2,
                              accentColor: "#2563eb",
                              width: 15,
                              height: 15,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              textDecoration: isLogged
                                ? "line-through"
                                : "none",
                              lineHeight: 1.3,
                            }}
                          >
                            {todo.text}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Live Preview Box */}
              <div
                style={{
                  flex: 1,
                  minHeight: 120,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}
                  >
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
