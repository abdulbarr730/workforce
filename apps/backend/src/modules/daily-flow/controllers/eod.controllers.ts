import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { EodReport } from "../model/eod-report.model";
import { User } from "../../users/model/user.model";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export const submitMyEodController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const {
      summary,
      completedItems,
      top3Tasks,
      blockers,
      hoursWorked,
      date: bodyDate,
    } = req.body as {
      summary: string;
      completedItems?: string[];
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
    const report = await EodReport.findOneAndUpdate(
      { employeeId, date },
      {
        $set: {
          summary: String(summary).trim(),
          completedItems: Array.isArray(completedItems)
            ? completedItems.filter(Boolean)
            : [],
          top3Tasks: Array.isArray(top3Tasks) ? top3Tasks.filter(Boolean) : [],
          blockers: String(blockers || "").trim(),
          hoursWorked: typeof hoursWorked === "number" ? hoursWorked : null,
          submittedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    res.json(successResponse(report, "EOD report submitted"));
  },
);

export const getMyEodTodayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const report = await EodReport.findOne({
      employeeId,
      date: todayStr(),
    }).lean();
    res.json(
      successResponse(report, report ? "EOD found" : "No EOD for today"),
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
