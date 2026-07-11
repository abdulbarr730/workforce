import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AttendanceRecord } from "../model/attendance-record.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const getAttendanceRecordsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { employeeId, date, month } = req.query;

    const filter: Record<string, unknown> = {};

    if (req.user?.role === "EMPLOYEE") {
      filter.employeeId = req.user.employeeId;
    } else if (employeeId) {
      filter.employeeId = employeeId;
    }

    if (date) {
      filter.date = date;
    } else if (month) {
      // month format: "YYYY-MM"
      filter.date = { $regex: `^${month}` };
    }

    const records = await AttendanceRecord.find(filter)
      .sort({ date: -1 })
      .limit(200)
      .lean();

    res
      .status(200)
      .json(successResponse(records, "Attendance records fetched"));
  },
);
