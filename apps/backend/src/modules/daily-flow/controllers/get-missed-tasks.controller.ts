import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { DailyTodo } from "../model/daily-todo.model";
import { EodReport } from "../model/eod-report.model";

export const getMissedTasksController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    // Check past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const todayStr = new Date().toISOString().split("T")[0];

    const pastAttendances = await AttendanceRecord.find({
      employeeId: user.employeeId,
      date: { $gte: thirtyDaysAgo.toISOString().split("T")[0], $lt: todayStr },
      attendanceStatus: { $nin: ["ABSENT", "HOLIDAY", "WEEKEND", "LEAVE"] }
    }).sort({ date: -1 }).lean();

    if (!pastAttendances.length) {
      return res.status(200).json(successResponse([], "No missed tasks"));
    }

    const dates = pastAttendances.map(a => a.date);

    const todos = await DailyTodo.find({
      employeeId: user.employeeId,
      date: { $in: dates }
    }).lean();

    const eods = await EodReport.find({
      employeeId: user.employeeId,
      date: { $in: dates }
    }).lean();

    const missed = [];

    for (const record of pastAttendances) {
      const hasTodo = todos.some(t => t.date === record.date);
      const hasEod = eods.some(e => e.date === record.date);

      if (!hasTodo || !hasEod) {
        missed.push({
          date: record.date,
          missedTodo: !hasTodo,
          missedEod: !hasEod,
        });
      }
    }

    return res.status(200).json(successResponse(missed, "Missed tasks retrieved"));
  }
);
