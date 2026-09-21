import { getLocalDateKey } from "../../shared/daily-flow";

export type EodDraftRow = {
  id: string;
  task: string;
  interval: string;
  hours: string;
  count?: number;
  isTopTask?: boolean;
  sourceTodoText?: string;
};

const EOD_DRAFT_KEY = "eod_draft_v2";

export const normalizeTaskKey = (task: string) =>
  task.trim().toLowerCase().replace(/\s+/g, " ");

export const formatToHHMM = (val: string) => {
  if (!val) return val;
  const num = parseFloat(val);
  if (Number.isNaN(num)) return val;
  if (val.includes(":")) return val;
  if (val.toLowerCase().includes("h") || val.toLowerCase().includes("m"))
    return val;

  const totalMinutes = Math.round(num * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

export const parseDurationFromTaskText = (value: string) => {
  const text = String(value || "")
    .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, " ")
    .replace(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi, " ");
  let totalMinutes = 0;

  const hourMinutePattern =
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\s*(?:(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m))?/gi;
  text.replace(hourMinutePattern, (_match, hours, minutes) => {
    totalMinutes += Number.parseFloat(hours) * 60;
    if (minutes) totalMinutes += Number.parseFloat(minutes);
    return "";
  });

  const minutePattern = /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/gi;
  text
    .replace(hourMinutePattern, " ")
    .replace(minutePattern, (_match, minutes) => {
      totalMinutes += Number.parseFloat(minutes);
      return "";
  });

  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "";
  const roundedMinutes = Math.round(totalMinutes);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
};

export const durationFromFieldsOrText = (
  explicitDuration?: string | null,
  estimatedDuration?: string | null,
  taskText?: string | null,
) => {
  const explicit = String(explicitDuration || "").trim();
  if (explicit) return formatToHHMM(explicit) || explicit;
  const estimated = String(estimatedDuration || "").trim();
  if (estimated) return formatToHHMM(estimated) || estimated;
  return parseDurationFromTaskText(String(taskText || ""));
};

const readDraftRows = (date: string): EodDraftRow[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(EOD_DRAFT_KEY) || "null");
    if (parsed?.date === date && Array.isArray(parsed.rows)) {
      return parsed.rows
        .filter((row: any) => String(row?.task || "").trim())
        .map((row: any) => ({
          id: row.id || crypto.randomUUID(),
          task: String(row.task || "").trim(),
          interval: String(row.interval || "").trim(),
          hours: formatToHHMM(String(row.hours || "").trim()),
          count:
            Number.isInteger(Number(row.count ?? row.callCount)) &&
            Number(row.count ?? row.callCount) > 0
              ? Number(row.count ?? row.callCount)
              : undefined,
          isTopTask: !!row.isTopTask,
          sourceTodoText: row.sourceTodoText,
        }));
    }
  } catch {}
  return [];
};

const writeDraftRows = (date: string, rows: EodDraftRow[]) => {
  localStorage.setItem(EOD_DRAFT_KEY, JSON.stringify({ date, rows }));
  window.dispatchEvent(new CustomEvent("eod-draft-updated", { detail: { date } }));
};

export const completedAtIntervalLabel = (completedAt?: string | null) => {
  if (!completedAt) return "Completed task";
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return "Completed task";
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `Completed at ${time}`;
};

export function upsertEodDraftTask(input: {
  date?: string;
  task: string;
  interval?: string;
  hours?: string;
  count?: number;
  isTopTask?: boolean;
  sourceTodoText?: string;
}) {
  const date = input.date || getLocalDateKey();
  const taskText = input.task.trim();
  if (!taskText) return;

  const rows = readDraftRows(date);
  const interval = (input.interval || "Completed task").trim();
  const hours = formatToHHMM(String(input.hours || "").trim());
  const sourceKey = normalizeTaskKey(input.sourceTodoText || taskText);
  const intervalKey = interval.toLowerCase();
  const existingIdx = rows.findIndex((row) => {
    const rowSource = normalizeTaskKey(row.sourceTodoText || row.task);
    const rowInterval = row.interval.toLowerCase();
    return (
      rowSource === sourceKey &&
      (rowInterval === intervalKey ||
        rowInterval.startsWith("completed at") ||
        intervalKey.startsWith("completed at"))
    );
  });

  const nextRow: EodDraftRow = {
    id: existingIdx >= 0 ? rows[existingIdx].id : crypto.randomUUID(),
    task: taskText,
    interval,
    hours,
    count: input.count,
    isTopTask:
      !!input.isTopTask || (existingIdx >= 0 && !!rows[existingIdx].isTopTask),
    sourceTodoText: input.sourceTodoText || taskText,
  };

  if (existingIdx >= 0) {
    rows[existingIdx] = { ...rows[existingIdx], ...nextRow };
  } else {
    rows.push(nextRow);
  }

  writeDraftRows(date, rows);
}

export function removeEodDraftTask(input: {
  date?: string;
  task: string;
  interval?: string;
}) {
  const date = input.date || getLocalDateKey();
  const taskKey = normalizeTaskKey(input.task);
  const intervalKey = input.interval?.trim().toLowerCase();
  const rows = readDraftRows(date).filter((row) => {
    const rowKey = normalizeTaskKey(row.sourceTodoText || row.task);
    if (rowKey !== taskKey) return true;
    if (!intervalKey) return false;
    return row.interval.toLowerCase() !== intervalKey;
  });
  writeDraftRows(date, rows);
}
