import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { EodReport } from "../model/eod-report.model";
import { User } from "../../users/model/user.model";
import { notificationService } from "../../../shared/services/notification.service";

import { DailyTodo } from "../model/daily-todo.model";
import { getBusinessDate, readRequestedDate } from "../utils/business-date";

function todayStr() {
  return getBusinessDate();
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
      notificationService.broadcast("daily_flow_event", {
        title: "EOD Submitted",
        message: `${user?.name || req.user!.employeeId} has submitted their End of Day report.`,
        employeeId: req.user!.employeeId,
        type: "EOD",
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

    const [report, todo] = await Promise.all([
      EodReport.findOne({ employeeId, date: today }).lean(),
      DailyTodo.findOne({ employeeId, date: today }).lean(),
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

    const payload = report
      ? { ...report, recordedCheckins, todayTodo: todo }
      : { recordedCheckins, todayTodo: todo };

    res.json(
      successResponse(payload, report ? "EOD found" : "No EOD for today"),
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
