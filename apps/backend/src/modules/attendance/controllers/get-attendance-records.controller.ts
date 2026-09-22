import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AttendanceRecord } from "../model/attendance-record.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { computeAttendanceFromEvents } from "../services/compute-attendance.service";

function getIndiaMinutes(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || 0,
  );
  return hour * 60 + minute;
}

function needsMidnightLogoutRepair(record: any) {
  if (!record?.logoutTime || !record?.loginTime || record.logoutTimeOverridden) {
    return false;
  }
  const login = new Date(record.loginTime);
  const logout = new Date(record.logoutTime);
  const loginMinutes = getIndiaMinutes(login);
  const logoutMinutes = getIndiaMinutes(logout);
  return logoutMinutes <= 150 && loginMinutes >= 6 * 60;
}

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

    // Date, week and month requests are already bounded and must return the
    // complete range. A fixed 200-row cap caused older days to disappear for
    // larger teams because results are sorted newest-first.
    const recordsQuery = AttendanceRecord.find(filter).sort({
      date: -1,
      employeeId: 1,
    });

    // Keep a safety cap only for legacy/unbounded calls.
    if (!date && !week && !month) recordsQuery.limit(200);

    let records = await recordsQuery.lean();

    const repairCandidates = records.filter(needsMidnightLogoutRepair).slice(0, 50);
    if (repairCandidates.length > 0) {
      const employeeIds = Array.from(
        new Set(repairCandidates.map((record: any) => record.employeeId)),
      );
      const users = await User.find({ employeeId: { $in: employeeIds } })
        .select("employeeId assignedShiftPolicyId")
        .lean();
      const userByEmployeeId = new Map(
        users.map((user: any) => [String(user.employeeId), user]),
      );

      await Promise.all(
        repairCandidates.map(async (record: any) => {
          const user = userByEmployeeId.get(String(record.employeeId));
          if (!user) return;
          await computeAttendanceFromEvents({
            employeeId: record.employeeId,
            date: record.date,
            shiftPolicyId: user.assignedShiftPolicyId?.toString() || "",
          });
        }),
      );

      records = await recordsQuery.clone().lean();
    }

    res
      .status(200)
      .json(successResponse(records, "Attendance records fetched"));
  },
);
