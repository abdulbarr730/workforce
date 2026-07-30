import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AttendanceRecord } from "../model/attendance-record.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const getAttendanceRecordsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { employeeId, date, month, week } = req.query;

    const filter: Record<string, unknown> = {};

    if (req.user?.role === "EMPLOYEE") {
      filter.employeeId = req.user.employeeId;
    } else if (employeeId) {
      filter.employeeId = employeeId;
    }

    if (date) {
      filter.date = date;
    } else if (week) {
      const weekStr = String(week);
      const year = parseInt(weekStr.substring(0, 4), 10);
      const w = parseInt(weekStr.substring(6, 8), 10);
      
      const d = new Date(year, 0, 1);
      d.setDate(d.getDate() + (4 - (d.getDay() || 7)));
      d.setHours(d.getHours() + (w - 1) * 168);
      d.setDate(d.getDate() - (d.getDay() || 7) + 1);

      const weekDates = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(d);
        day.setDate(day.getDate() + i);
        const yyyy = day.getFullYear();
        const mm = String(day.getMonth() + 1).padStart(2, "0");
        const dd = String(day.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      });

      filter.date = { $in: weekDates };
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
