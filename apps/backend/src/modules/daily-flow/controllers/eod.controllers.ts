import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { EodReport } from "../model/eod-report.model";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export const submitMyEodController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { summary, completedItems, blockers, hoursWorked, date: bodyDate } = req.body as {
      summary: string;
      completedItems?: string[];
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
          completedItems: Array.isArray(completedItems) ? completedItems.filter(Boolean) : [],
          blockers: String(blockers || "").trim(),
          hoursWorked: typeof hoursWorked === "number" ? hoursWorked : null,
          submittedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.json(successResponse(report, "EOD report submitted"));
  }
);

export const getMyEodTodayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const report = await EodReport.findOne({ employeeId, date: todayStr() }).lean();
    res.json(successResponse(report, report ? "EOD found" : "No EOD for today"));
  }
);

export const listEodReportsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { employeeId, date } = req.query as { employeeId?: string; date?: string };
    const filter: Record<string, any> = {};
    if (employeeId) filter.employeeId = employeeId;
    if (date) filter.date = date;
    const reports = await EodReport.find(filter).sort({ date: -1 }).limit(200).lean();
    res.json(successResponse(reports, "EOD reports fetched"));
  }
);
