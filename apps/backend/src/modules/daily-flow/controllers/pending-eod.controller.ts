import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { AttendanceStatus } from "../../attendance/types/attendance-status.enum";
import { EodReport } from "../model/eod-report.model";

const LOOKBACK_DAYS = 14;

// Statuses that REQUIRE an EOD (employee actually worked)
const WORK_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.HALF_DAY,
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

/**
 * Returns the earliest past day (within LOOKBACK_DAYS, excluding today) where
 * the employee has a work-day attendance record but no EOD report.
 * Frontend uses this to block the dashboard until the missing EOD is filed.
 */
export const getMyPendingEodController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const today = todayStr();
    const since = daysAgoStr(LOOKBACK_DAYS);

    const records = await AttendanceRecord.find({
      employeeId,
      deleted: { $ne: true },
      date: { $gte: since, $lt: today },
      attendanceStatus: { $in: WORK_STATUSES },
    })
      .select("date")
      .sort({ date: 1 })
      .lean();

    if (records.length === 0) {
      res.json(successResponse({ pendingDate: null }, "No pending EOD"));
      return;
    }

    const dates = records.map((r) => r.date);
    const submitted = await EodReport.find({
      employeeId,
      date: { $in: dates },
    })
      .select("date")
      .lean();

    const submittedSet = new Set(submitted.map((e) => e.date));
    const pending = dates.find((d) => !submittedSet.has(d)) ?? null;

    res.json(
      successResponse(
        { pendingDate: pending, lookbackDays: LOOKBACK_DAYS },
        pending ? "EOD pending" : "All caught up",
      ),
    );
  },
);
