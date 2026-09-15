import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { DailyTodo } from "../model/daily-todo.model";
import { EodReport } from "../model/eod-report.model";
import { AssignedTask } from "../../assigned-tasks/model/assigned-task.model";
import { getBusinessDayBounds } from "../../attendance/services/shift-schedule.service";

type SuggestedRow = {
  task: string;
  interval: string;
  hours: string;
  count?: number;
  isTopTask?: boolean;
  confidence: number;
  source: string;
  evidence: string[];
};

const normalizeTask = (value: string) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const formatMinutes = (minutes: number) => {
  const safe = Math.max(1, Math.round(minutes));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60,
  ).padStart(2, "0")}`;
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

const intervalLabel = (start: Date, end: Date) =>
  `${formatTime(start)} – ${formatTime(end)}`;

const appLabel = (metadata: any) => {
  const app = String(metadata?.app || "").trim();
  const title = String(metadata?.title || "").trim();
  const domain = String(metadata?.domain || "").trim();
  if (/teams/i.test(app) || /microsoft teams/i.test(title)) {
    return "Microsoft Teams communication and task updates";
  }
  if (/chrome|edge|browser/i.test(app) && domain) {
    if (/docs\.google|sheets/i.test(domain) || /google sheets/i.test(title)) {
      return "Google Sheets / data work";
    }
    if (/mail\.google|gmail/i.test(domain) || /gmail/i.test(title)) {
      return "Email follow-ups and responses";
    }
    if (/prosunc|prosync|crm|dashboard/i.test(domain + " " + title)) {
      return "CRM / dashboard work";
    }
    return `Browser work on ${domain}`;
  }
  if (app) return `${app} work`;
  if (title) return title.slice(0, 80);
  return "Work activity";
};

const eventDurationSeconds = (event: any) => {
  const metadata = event.metadata || {};
  const raw =
    metadata.durationSeconds ??
    metadata.idleSeconds ??
    (metadata.idleMinutes ? Number(metadata.idleMinutes) * 60 : undefined);
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 30;
};

const pushUnique = (rows: SuggestedRow[], row: SuggestedRow) => {
  const key = `${normalizeTask(row.task)}|${row.interval}`;
  if (rows.some((existing) => `${normalizeTask(existing.task)}|${existing.interval}` === key)) {
    return;
  }
  rows.push(row);
};

export async function buildEodSuggestion(employeeId: string, date: string) {
  const { start, end } = getBusinessDayBounds(date);
  const [todo, pastEods, assignedTasks, events] = await Promise.all([
    DailyTodo.findOne({ employeeId, date }).lean(),
    EodReport.find({ employeeId, date: { $lt: date } })
      .sort({ date: -1 })
      .limit(20)
      .select("tasksWithTimings completedItems")
      .lean(),
    AssignedTask.find({
      assignedToEmployeeId: employeeId,
      scheduledFor: date,
      status: { $in: ["COMPLETED", "IN_PROGRESS", "ACCEPTED"] },
    })
      .sort({ completedAt: 1, updatedAt: 1 })
      .lean(),
    ActivityEvent.find({
      employeeId,
      timestamp: { $gte: start, $lte: end },
      invalidated: { $ne: true },
      type: {
        $in: [
          "ACTIVE_WINDOW",
          "IDLE_RESPONSE",
          "BREAK_END",
          "AWAY_WORK_END",
        ] as any[],
      },
    })
      .sort({ timestamp: 1 })
      .lean(),
  ]);

  const rows: SuggestedRow[] = [];
  const historyTasks = pastEods
    .flatMap((report: any) => [
      ...(report.tasksWithTimings || []).map((task: any) => task.text),
      ...(report.completedItems || []),
    ])
    .map((text) => String(text || "").replace(/\s*\([^)]*\)\s*-\s*.*$/, ""))
    .filter(Boolean);

  for (const checkin of (todo?.checkins || []) as any[]) {
    for (const task of checkin.tasks?.length
      ? checkin.tasks
      : (checkin.completedTasks || []).map((text: string) => ({ text }))) {
      const text = String(task.text || "").trim();
      if (!text) continue;
      pushUnique(rows, {
        task: text,
        interval: checkin.interval || "",
        hours: formatMinutes(
          task.timeTaken ? 0 : 120,
        ) || task.timeTaken || "02:00",
        count: Number.isInteger(Number(task.count)) ? Number(task.count) : undefined,
        isTopTask: Boolean(task.isTopTask),
        confidence: task.timeTaken ? 0.96 : 0.82,
        source: "CHECKIN",
        evidence: ["Already recorded in check-in"],
      });
      if (task.timeTaken) rows[rows.length - 1].hours = String(task.timeTaken);
    }
  }

  for (const item of (todo?.items || []) as any[]) {
    if (!item?.done) continue;
    const completedAt = item.completedAt ? new Date(item.completedAt) : null;
    const slotStart =
      completedAt && !Number.isNaN(completedAt.getTime())
        ? new Date(completedAt.getTime() - 60 * 60 * 1000)
        : start;
    const slotEnd =
      completedAt && !Number.isNaN(completedAt.getTime())
        ? completedAt
        : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    pushUnique(rows, {
      task: String(item.text || "").trim(),
      interval: intervalLabel(slotStart, slotEnd),
      hours: item.timeTaken || item.estimatedTime || "01:00",
      isTopTask: Boolean(item.isTopTask),
      confidence: item.timeTaken || item.estimatedTime ? 0.88 : 0.72,
      source: "TODO_COMPLETED",
      evidence: ["Marked completed in Todo"],
    });
  }

  for (const task of assignedTasks as any[]) {
    const finishedAt = task.completedAt ? new Date(task.completedAt) : null;
    const slotEnd =
      finishedAt && !Number.isNaN(finishedAt.getTime())
        ? finishedAt
        : end;
    const slotStart = task.startedAt
      ? new Date(task.startedAt)
      : new Date(slotEnd.getTime() - 60 * 60 * 1000);
    pushUnique(rows, {
      task: String(task.title || "").trim(),
      interval: intervalLabel(slotStart, slotEnd),
      hours: task.actualTime || task.estimatedTime || "01:00",
      confidence: task.status === "COMPLETED" ? 0.9 : 0.68,
      source: "ASSIGNED_TASK",
      evidence: [`Assigned task status: ${task.status}`],
    });
  }

  const telemetryBuckets = new Map<
    string,
    { start: Date; end: Date; seconds: number; labels: Map<string, number> }
  >();
  for (const event of events as any[]) {
    if (event.type !== "ACTIVE_WINDOW") continue;
    const ts = new Date(event.timestamp);
    const bucketStart = new Date(ts);
    bucketStart.setMinutes(bucketStart.getMinutes() < 30 ? 0 : 30, 0, 0);
    const bucketMs =
      start.getTime() +
      Math.floor((bucketStart.getTime() - start.getTime()) / (2 * 60 * 60_000)) *
        2 *
        60 *
        60_000;
    const slotStart = new Date(Math.max(start.getTime(), bucketMs));
    const slotEnd = new Date(Math.min(end.getTime(), slotStart.getTime() + 2 * 60 * 60_000));
    const key = intervalLabel(slotStart, slotEnd);
    const bucket =
      telemetryBuckets.get(key) ||
      ({
        start: slotStart,
        end: slotEnd,
        seconds: 0,
        labels: new Map<string, number>(),
      } as any);
    const seconds = eventDurationSeconds(event);
    const label = appLabel(event.metadata);
    bucket.seconds += seconds;
    bucket.labels.set(label, (bucket.labels.get(label) || 0) + seconds);
    telemetryBuckets.set(key, bucket);
  }

  for (const [interval, bucket] of telemetryBuckets) {
    if (bucket.seconds < 10 * 60) continue;
    if (rows.some((row) => row.interval === interval && row.task.trim())) continue;
    const topLabels = Array.from(bucket.labels.entries()).sort((a, b) => b[1] - a[1]);
    const bestLabel = topLabels[0]?.[0] || "Work activity";
    const historicalMatch = historyTasks.find((task) => {
      const normalized = normalizeTask(task);
      return (
        normalized &&
        (normalizeTask(bestLabel).includes(normalized.slice(0, 12)) ||
          normalized.includes(normalizeTask(bestLabel).slice(0, 12)))
      );
    });
    const taskName = historicalMatch || bestLabel;
    pushUnique(rows, {
      task: taskName,
      interval,
      hours: formatMinutes(Math.min(120, Math.max(15, bucket.seconds / 60))),
      confidence: historicalMatch ? 0.72 : 0.58,
      source: "TELEMETRY",
      evidence: topLabels
        .slice(0, 3)
        .map(([label, seconds]) => `${label}: ${formatMinutes(seconds / 60)}`),
    });
  }

  rows.sort((a, b) => a.interval.localeCompare(b.interval));
  rows.slice(0, 3).forEach((row) => {
    row.isTopTask = row.isTopTask || row.confidence >= 0.85;
  });

  return {
    employeeId,
    date,
    rows,
    summary: {
      suggestedRows: rows.length,
      highConfidenceRows: rows.filter((row) => row.confidence >= 0.8).length,
      sources: Array.from(new Set(rows.map((row) => row.source))),
    },
  };
}

