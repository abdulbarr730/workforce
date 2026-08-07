export interface EodTaskTiming {
  text?: string;
  task?: string;
  interval?: string;
  timeTaken?: string;
  count?: number;
  callCount?: number;
  isTopTask?: boolean;
}

export interface EodReportData {
  summary?: string;
  completedItems?: string[];
  tasksWithTimings?: EodTaskTiming[];
  top3Tasks?: string[];
  hoursWorked?: number | string | null;
  submittedAt?: string;
}

export interface NormalizedEodTask {
  text: string;
  interval: string;
  duration: string;
  count?: number;
  callCount?: number;
  isTopTask: boolean;
  isSectionHeader?: boolean;
}

const INTERVAL_PATTERN =
  /\(?\b(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?\s*[-–—]\s*\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)\b\)?/gi;
const CALL_COUNT_PATTERN = /\[(\d+)\s*calls?\]/i;
const GENERIC_COUNT_PATTERN = /\[\s*count\s*:\s*(\d+)\s*\]/i;
const SECTION_PREFIXES = ["📌", "📋", "🚨", "---"];

function cleanTaskText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[-–—:;,\s]+|[-–—:;,\s]+$/g, "")
    .trim();
}

function normalizeForComparison(value: string): string {
  return cleanTaskText(value).toLocaleLowerCase();
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function cleanTopTaskValues(report: EodReportData): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of report.top3Tasks || []) {
    const text = parseEodCompletedItem(value).text;
    const key = normalizeForComparison(text);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(text);
    }
  }
  return result;
}

export function parseEodCompletedItem(item: string): NormalizedEodTask {
  const original = String(item || "").trim();
  if (SECTION_PREFIXES.some((prefix) => original.startsWith(prefix))) {
    return {
      text: original,
      interval: "",
      duration: "",
      isTopTask: false,
      isSectionHeader: true,
    };
  }

  let working = original;
  let duration = "";
  const durationSeparator = working.lastIndexOf(" - ");
  if (durationSeparator >= 0) {
    const durationCandidate = working.slice(durationSeparator + 3).trim();
    if (parseEodDurationMinutes(durationCandidate) > 0) {
      duration = durationCandidate;
      working = working.slice(0, durationSeparator).trim();
    }
  }
  if (!duration) {
    const trailingDuration = working.match(
      /\s*\(([\d.]+(?::\d{1,2}){0,2}\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)?)\)\s*$/i,
    );
    if (trailingDuration) {
      duration = trailingDuration[1].trim();
      working = working.slice(0, trailingDuration.index).trim();
    }
  }

  const callMatch = working.match(CALL_COUNT_PATTERN);
  const callCount = positiveInteger(callMatch?.[1]);
  const countMatch = working.match(GENERIC_COUNT_PATTERN);
  const count = positiveInteger(countMatch?.[1]) || callCount;
  working = working.replace(CALL_COUNT_PATTERN, " ");
  working = working.replace(GENERIC_COUNT_PATTERN, " ");

  const intervals = Array.from(working.matchAll(INTERVAL_PATTERN));
  const interval = intervals[0]?.[1]?.replace(/\s+/g, " ").trim() || "";
  working = working.replace(INTERVAL_PATTERN, " ");

  return {
    text: cleanTaskText(working) || original,
    interval,
    duration,
    count,
    callCount,
    isTopTask: false,
  };
}

export function normalizeEodTasks(
  report: EodReportData | null | undefined,
): NormalizedEodTask[] {
  if (!report) return [];

  const fallbackRows = (report.completedItems || []).map(parseEodCompletedItem);
  const structuredRows = (report.tasksWithTimings || []).filter((task) =>
    String(task.text || task.task || "").trim(),
  );
  const topTasks = new Set(
    cleanTopTaskValues(report).map(normalizeForComparison).filter(Boolean),
  );

  if (structuredRows.length === 0) {
    return fallbackRows.map((row) => ({
      ...row,
      isTopTask: topTasks.has(normalizeForComparison(row.text)),
    }));
  }

  return structuredRows.map((task, index) => {
    const parsedText = parseEodCompletedItem(
      String(task.text || task.task || ""),
    );
    const fallback = fallbackRows[index];
    const text = parsedText.text;
    const normalizedText = normalizeForComparison(text);

    return {
      text,
      interval:
        String(task.interval || "").trim() ||
        parsedText.interval ||
        fallback?.interval ||
        "",
      duration:
        String(task.timeTaken || "").trim() ||
        parsedText.duration ||
        fallback?.duration ||
        "",
      count:
        positiveInteger(task.count) ||
        positiveInteger(task.callCount) ||
        parsedText.count ||
        fallback?.count,
      callCount:
        positiveInteger(task.callCount) ||
        parsedText.callCount ||
        fallback?.callCount,
      isTopTask: Boolean(task.isTopTask) || topTasks.has(normalizedText),
    };
  });
}

export function normalizeEodTopTasks(
  report: EodReportData | null | undefined,
): string[] {
  if (!report) return [];
  const values = cleanTopTaskValues(report);
  const seen = new Set(values.map(normalizeForComparison));
  for (const task of normalizeEodTasks(report)) {
    const key = normalizeForComparison(task.text);
    if (task.isTopTask && key && !seen.has(key)) {
      seen.add(key);
      values.push(task.text);
    }
  }
  return values;
}

export function parseEodDurationMinutes(value: string): number {
  const duration = String(value || "")
    .trim()
    .toLocaleLowerCase();
  if (!duration) return 0;

  if (/^\d+(?::\d{1,2}){1,2}$/.test(duration)) {
    const parts = duration.split(":").map(Number);
    if (parts.length === 3) {
      return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
    }
    return Math.round(parts[0] * 60 + parts[1]);
  }

  let totalMinutes = 0;
  const hourMatch = duration.match(/([\d.]+)\s*(?:h|hr|hrs|hour|hours)\b/);
  const minuteMatch = duration.match(
    /([\d.]+)\s*(?:m|min|mins|minute|minutes)\b/,
  );
  const secondMatch = duration.match(
    /([\d.]+)\s*(?:s|sec|secs|second|seconds)\b/,
  );
  if (hourMatch) totalMinutes += Number(hourMatch[1]) * 60;
  if (minuteMatch) totalMinutes += Number(minuteMatch[1]);
  if (secondMatch) totalMinutes += Number(secondMatch[1]) / 60;
  if (totalMinutes > 0) return Math.round(totalMinutes);

  const numeric = Number(duration);
  return Number.isFinite(numeric) ? Math.round(numeric * 60) : 0;
}

export function formatEodDuration(value: string): string {
  const minutes = parseEodDurationMinutes(value);
  if (minutes <= 0) return String(value || "").trim() || "—";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours > 0) return `${hours}h`;
  return `${remainingMinutes}m`;
}

export function getEodTotalMinutes(
  report: EodReportData | null | undefined,
): number {
  const taskMinutes = normalizeEodTasks(report).reduce(
    (total, task) => total + parseEodDurationMinutes(task.duration),
    0,
  );
  if (taskMinutes > 0) return taskMinutes;

  const hoursWorked = Number(report?.hoursWorked);
  return Number.isFinite(hoursWorked) && hoursWorked > 0
    ? Math.round(hoursWorked * 60)
    : 0;
}

export function formatEodTotalMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return "—";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}
