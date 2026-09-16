import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { EodReport } from "../model/eod-report.model";
import { User } from "../../users/model/user.model";
import { notificationService } from "../../../shared/services/notification.service";
import { dispatchDiscordDailyFlowNotification } from "../../notifications/services/discord-notification.service";

import { DailyTodo } from "../model/daily-todo.model";
import { getBusinessDate, readRequestedDate } from "../utils/business-date";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { getBusinessDayBounds } from "../../attendance/services/shift-schedule.service";
import { buildEodSuggestion } from "../services/eod-suggestion.service";

function todayStr() {
  return getBusinessDate();
}

function parseDurationMinutes(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return 0;

  if (raw.includes("h") || raw.includes("m")) {
    const hours = raw.match(/([\d.]+)\s*h/);
    const minutes = raw.match(/([\d.]+)\s*m/);
    return Math.round(
      (hours ? Number.parseFloat(hours[1]) * 60 : 0) +
        (minutes ? Number.parseFloat(minutes[1]) : 0),
    );
  }

  if (raw.includes(":")) {
    const [hours, minutes] = raw.split(":");
    return (
      (Number.parseInt(hours || "0", 10) || 0) * 60 +
      (Number.parseInt(minutes || "0", 10) || 0)
    );
  }

  const decimalHours = Number.parseFloat(raw);
  return Number.isFinite(decimalHours) ? Math.round(decimalHours * 60) : 0;
}

function formatMinutesLabel(minutes: number) {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  return `${Math.floor(safeMinutes / 60)}h ${safeMinutes % 60}m`;
}

function formatHHMM(minutes: number) {
  const safeMinutes = Math.max(1, Math.round(minutes));
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(
    safeMinutes % 60,
  ).padStart(2, "0")}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function intervalLabel(start: Date, end: Date) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function activityEventDurationSeconds(event: any) {
  const metadata = event.metadata || {};
  const raw =
    metadata.durationSeconds ??
    metadata.idleSeconds ??
    (metadata.idleMinutes ? Number(metadata.idleMinutes) * 60 : undefined);
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 30;
}

function activityStartFromMetadata(event: any, durationSeconds: number) {
  const metadata = event.metadata || {};
  const explicitStart = metadata.from || metadata.start || metadata.startedAt;
  const parsedStart = explicitStart ? new Date(explicitStart) : null;
  if (parsedStart && !Number.isNaN(parsedStart.getTime())) return parsedStart;
  const end = new Date(event.timestamp);
  return new Date(end.getTime() - durationSeconds * 1000);
}

function appendActivityRows(
  rows: any[],
  {
    text,
    start,
    end,
    source,
  }: { text: string; start: Date; end: Date; source: string },
) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  if (end <= start) return;
  let cursor = new Date(start);
  while (cursor < end) {
    const segmentEnd = new Date(
      Math.min(end.getTime(), cursor.getTime() + 2 * 60 * 60_000),
    );
    const minutes = Math.max(
      1,
      Math.round((segmentEnd.getTime() - cursor.getTime()) / 60_000),
    );
    rows.push({
      text,
      interval: intervalLabel(cursor, segmentEnd),
      timeTaken: formatHHMM(minutes),
      isTopTask: false,
      source,
    });
    cursor = segmentEnd;
  }
}

async function getRecordedBreakAwayRows(employeeId: string, date: string) {
  const { start, end } = getBusinessDayBounds(date);
  const events = await ActivityEvent.find({
    employeeId,
    timestamp: { $gte: start, $lte: end },
    invalidated: { $ne: true },
    type: {
      $in: [
        "BREAK_START",
        "BREAK_END",
        "AWAY_WORK_START",
        "AWAY_WORK_END",
        "IDLE_RESPONSE",
      ] as any[],
    },
  })
    .sort({ timestamp: 1 })
    .lean();

  const rows: any[] = [];
  let currentBreak: any = null;
  let currentAway: any = null;

  for (const event of events as any[]) {
    const metadata = event.metadata || {};
    if (event.type === "BREAK_START") {
      currentBreak = event;
      continue;
    }
    if (event.type === "AWAY_WORK_START") {
      currentAway = event;
      continue;
    }
    if (event.type === "BREAK_END") {
      const durationSeconds = activityEventDurationSeconds(event);
      appendActivityRows(rows, {
        text: metadata.reason
          ? `Break — ${metadata.reason}`
          : "Break / personal time",
        start: currentBreak
          ? new Date(currentBreak.timestamp)
          : activityStartFromMetadata(event, durationSeconds),
        end: new Date(event.timestamp),
        source: "BREAK_LOG",
      });
      currentBreak = null;
      continue;
    }
    if (event.type === "AWAY_WORK_END") {
      const durationSeconds = activityEventDurationSeconds(event);
      appendActivityRows(rows, {
        text: metadata.reason
          ? `Away work — ${metadata.reason}`
          : "Away work / offline work",
        start: currentAway
          ? new Date(currentAway.timestamp)
          : activityStartFromMetadata(event, durationSeconds),
        end: new Date(event.timestamp),
        source: "AWAY_WORK_LOG",
      });
      currentAway = null;
      continue;
    }
    if (event.type === "IDLE_RESPONSE") {
      const durationSeconds = activityEventDurationSeconds(event);
      const isWorking = metadata.isWorking === true;
      const endAt =
        metadata.to && !Number.isNaN(new Date(metadata.to).getTime())
          ? new Date(metadata.to)
          : new Date(event.timestamp);
      appendActivityRows(rows, {
        text: isWorking
          ? metadata.reason
            ? `Away work — ${metadata.reason}`
            : "Away work / offline work"
          : metadata.reason
            ? `Break — ${metadata.reason}`
            : "Break / idle time",
        start: activityStartFromMetadata(event, durationSeconds),
        end: endAt,
        source: isWorking ? "AWAY_WORK_LOG" : "BREAK_LOG",
      });
    }
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.source}|${row.text}|${row.interval}|${row.timeTaken}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getAllowedEodMinutes(employeeId: string, date: string) {
  const { start, end } = getBusinessDayBounds(date);
  const now = new Date();
  const graceMinutes = 60;

  const sessions = await WorkSession.find({
    employeeId,
    loginAt: { $gte: start, $lte: end },
  })
    .sort({ loginAt: 1 })
    .lean();

  if (sessions.length > 0) {
    const firstLogin = new Date(sessions[0].loginAt).getTime();
    const events = await ActivityEvent.find({
      employeeId,
      timestamp: { $gte: start, $lte: end },
      invalidated: { $ne: true },
      type: {
        $in: [
          "ACTIVE_WINDOW",
          "USER_ACTIVITY",
          "IDLE_RESPONSE",
          "IDLE_END",
          "AWAY_WORK_END",
          "BREAK_START",
          "BREAK_END",
        ] as any[],
      },
    })
      .sort({ timestamp: 1 })
      .select("timestamp")
      .lean();
    const lastSession = sessions[sessions.length - 1];
    const lastLogoutOrActivity = Math.max(
      lastSession.logoutAt ? new Date(lastSession.logoutAt).getTime() : 0,
      events.length
        ? new Date(events[events.length - 1].timestamp).getTime()
        : 0,
      date === todayStr() ? Math.min(now.getTime(), end.getTime()) : 0,
    );
    return Math.max(
      0,
      Math.floor((lastLogoutOrActivity - firstLogin) / 60_000) + graceMinutes,
    );
  }

  const events = await ActivityEvent.find({
    employeeId,
    timestamp: { $gte: start, $lte: end },
    invalidated: { $ne: true },
  })
    .sort({ timestamp: 1 })
    .select("timestamp")
    .lean();

  if (events.length < 2) return null;
  const first = new Date(events[0].timestamp).getTime();
  const last = new Date(events[events.length - 1].timestamp).getTime();
  return Math.max(0, Math.floor((last - first) / 60_000) + graceMinutes);
}

export const submitMyEodController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const {
      summary,
      completedItems,
      tasksWithTimings,
      top3Tasks,
      blockers,
      hoursWorked,
      date: bodyDate,
    } = req.body as {
      summary: string;
      completedItems?: string[];
      tasksWithTimings?: Array<{
        text: string;
        interval?: string;
        timeTaken?: string;
        count?: number;
        callCount?: number;
        isTopTask?: boolean;
      }>;
      top3Tasks?: string[];
      blockers?: string;
      hoursWorked?: number;
      date?: string;
    };

    if (!summary || !String(summary).trim())
      throw new AppError("EOD summary is required", 400);

    // Allow backfill: accept YYYY-MM-DD <= today, default to today
    const today = todayStr();
    let date = today;
    if (bodyDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bodyDate))
        throw new AppError("Invalid date format (expected YYYY-MM-DD)", 400);
      if (bodyDate > today)
        throw new AppError("Cannot submit EOD for a future date", 400);
      date = bodyDate;
    }

    const structuredTimings = Array.isArray(tasksWithTimings)
      ? tasksWithTimings
          .map((t) => {
            const parsedCount = Number(t.count);
            const parsedCallCount = Number(t.callCount);
            const count =
              Number.isInteger(parsedCount) && parsedCount >= 1
                ? parsedCount
                : undefined;
            return {
              text: String(t.text || "").trim(),
              interval: String(t.interval || "").trim(),
              timeTaken: String(t.timeTaken || "").trim(),
              count,
              callCount:
                Number.isInteger(parsedCallCount) && parsedCallCount >= 1
                  ? parsedCallCount
                  : /\bcalls?\b/i.test(String(t.text || ""))
                    ? count
                    : undefined,
              isTopTask: Boolean(t.isTopTask),
            };
          })
          .filter((t) => t.text.length > 0)
      : [];

    const submittedMinutes = structuredTimings.reduce(
      (sum, task) => sum + parseDurationMinutes(task.timeTaken),
      0,
    );
    const allowedMinutes = await getAllowedEodMinutes(employeeId, date);
    if (
      allowedMinutes !== null &&
      submittedMinutes > Math.max(0, allowedMinutes + 2)
    ) {
      throw new AppError(
        `Your EOD total is ${formatMinutesLabel(submittedMinutes)}, but only ${formatMinutesLabel(allowedMinutes)} is allowed from your first login plus 1 hour grace. Please reduce the entered task time.`,
        400,
      );
    }

    const oversizedTask = structuredTimings.find(
      (task) => parseDurationMinutes(task.timeTaken) > 120,
    );
    if (oversizedTask) {
      throw new AppError(
        `Task "${oversizedTask.text}" is longer than the selected EOD time slot. Maximum for one row is 2h 0m.`,
        400,
      );
    }

    const finalCompletedItems =
      Array.isArray(completedItems) && completedItems.length > 0
        ? completedItems.filter(Boolean)
        : structuredTimings.map((t) => {
            const count = t.count || t.callCount;
            const countSummary = count ? ` [Count: ${count}]` : "";
            return t.interval
              ? `${t.text}${countSummary} (${t.interval}) - ${t.timeTaken || "2h"}`
              : `${t.text}${countSummary} - ${t.timeTaken || "2h"}`;
          });

    const report = await EodReport.findOneAndUpdate(
      { employeeId, date },
      {
        $set: {
          summary: String(summary).trim(),
          completedItems: finalCompletedItems,
          tasksWithTimings: structuredTimings,
          top3Tasks: Array.isArray(top3Tasks) ? top3Tasks.filter(Boolean) : [],
          blockers: String(blockers || "").trim(),
          hoursWorked: typeof hoursWorked === "number" ? hoursWorked : null,
          isMissedEod: date < today,
          submittedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    // Fetch user name and emit notification
    try {
      const user = await User.findOne(
        { employeeId: req.user!.employeeId },
        "name",
      ).lean();
      const message = `${user?.name || req.user!.employeeId} has submitted their End of Day report.`;
      notificationService.broadcast("daily_flow_event", {
        title: "EOD Submitted",
        message,
        employeeId: req.user!.employeeId,
        type: "EOD",
      });
      await dispatchDiscordDailyFlowNotification({
        title: "EOD Submitted",
        message,
        employeeName: user?.name || req.user!.employeeId,
        employeeId: req.user!.employeeId,
        eventType: "EOD",
      });
    } catch (err) {
      console.error("Failed to emit eod notification", err);
    }

    res.json(successResponse(report, "EOD report submitted"));
  },
);

export const getMyEodTodayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    let today: string;
    try {
      today = readRequestedDate(req.query.date);
    } catch {
      throw new AppError("Invalid date format (expected YYYY-MM-DD)", 400);
    }

    const [report, todo, recordedBreakAwayRows] = await Promise.all([
      EodReport.findOne({ employeeId, date: today }).lean(),
      DailyTodo.findOne({ employeeId, date: today }).lean(),
      getRecordedBreakAwayRows(employeeId, today),
    ]);

    // Aggregate recorded check-in tasks
    const recordedCheckins = (todo?.checkins || []).flatMap((c: any) =>
      c.tasks && c.tasks.length > 0
        ? c.tasks.map((t: any) => ({
            text: t.text,
            interval: c.interval,
            timeTaken: t.timeTaken,
            count: t.count ?? t.callCount,
            callCount: t.callCount,
            isTopTask: !!t.isTopTask,
            done: t.done !== false,
          }))
        : (c.completedTasks || []).map((ct: string) => ({
            text: ct,
            interval: c.interval,
            timeTaken: "02:00",
            count: undefined,
            callCount: undefined,
            isTopTask: false,
            done: true,
          })),
    );

    const recordedRows = [...recordedCheckins, ...recordedBreakAwayRows];
    const payload = report
      ? { ...report, recordedCheckins: recordedRows, todayTodo: todo }
      : { recordedCheckins: recordedRows, todayTodo: todo };

    res.json(
      successResponse(payload, report ? "EOD found" : "No EOD for today"),
    );
  },
);

export const getMyEodSuggestionController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    let date: string;
    try {
      date = readRequestedDate(req.query.date);
    } catch {
      throw new AppError("Invalid date format (expected YYYY-MM-DD)", 400);
    }

    const includeAi = String(req.query.includeAi || "true") !== "false";
    const suggestion = await buildEodSuggestion(employeeId, date, {
      includeAi,
    });
    res.json(successResponse(suggestion, "EOD suggestion generated"));
  },
);

export const listEodSuggestionsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { employeeId } = req.query as { employeeId?: string };
    const includeAi = String(req.query.includeAi || "false") === "true";
    let date: string;
    try {
      date = readRequestedDate(req.query.date);
    } catch {
      throw new AppError("Invalid date format (expected YYYY-MM-DD)", 400);
    }

    const userFilter: Record<string, any> = employeeId
      ? { employeeId }
      : {
          isActive: true,
          deletedAt: null,
          role: { $nin: ["SUPER_ADMIN", "ADMIN"] },
        };
    const users = await User.find(userFilter)
      .select("employeeId name departmentName")
      .lean();

    const suggestions = await Promise.all(
      users.map(async (user: any) => ({
        employeeName: user.name,
        departmentName: user.departmentName || "",
        ...(await buildEodSuggestion(user.employeeId, date, { includeAi })),
      })),
    );

    res.json(
      successResponse(
        {
          date,
          employeesProcessed: suggestions.length,
          suggestions,
        },
        "Team EOD suggestions generated",
      ),
    );
  },
);

export const listEodReportsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { employeeId, date, month, week } = req.query as {
      employeeId?: string;
      date?: string;
      month?: string;
      week?: string;
    };
    const filter: Record<string, any> = {};

    if (employeeId) {
      filter.employeeId = employeeId;
    } else {
      const allowedUsers = await User.find({
        role: { $nin: ["SUPER_ADMIN", "ADMIN"] as any[] },
      })
        .select("employeeId")
        .lean();
      filter.employeeId = { $in: allowedUsers.map((u) => u.employeeId) };
    }

    if (date) {
      filter.date = date;
    } else if (month) {
      filter.date = { $regex: `^${month}` };
    } else if (week) {
      const [yearStr, weekStr] = (week as string).split("-W");
      const year = parseInt(yearStr, 10);
      const weekNum = parseInt(weekStr, 10);

      const simple = new Date(year, 0, 1 + (weekNum - 1) * 7);
      const dow = simple.getDay();
      const ISOweekStart = simple;
      if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
      else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

      const startDate = ISOweekStart.toISOString().split("T")[0];
      const endDateDate = new Date(
        ISOweekStart.getTime() + 6 * 24 * 60 * 60 * 1000,
      );
      const endDate = endDateDate.toISOString().split("T")[0];

      filter.date = { $gte: startDate, $lte: endDate };
    }

    const reports = await EodReport.find(filter)
      .sort({ date: -1 })
      .limit(1000)
      .lean();
    res.json(successResponse(reports, "EOD reports fetched"));
  },
);
