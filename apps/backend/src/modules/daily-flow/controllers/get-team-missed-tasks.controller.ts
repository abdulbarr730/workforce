import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { DailyTodo } from "../model/daily-todo.model";
import { EodReport } from "../model/eod-report.model";
import { User } from "../../users/model/user.model";

export const getTeamMissedTasksController = asyncHandler(
  async (req: Request, res: Response) => {
    const manager = (req as any).user;
    
    // Only managers or admins should access this
    if (manager.role !== "MANAGER" && manager.role !== "ADMIN" && manager.role !== "SUPER_ADMIN") {
      return res.status(403).json(successResponse([], "Access denied"));
    }

    // Get team members. For now, we fetch employees in the same department, or all if admin.
    let query: any = { isActive: true, role: "EMPLOYEE" };
    if (manager.role === "MANAGER") {
       query.departmentId = manager.departmentId;
    }

    const teamMembers = await User.find(query).select("employeeId name").lean();
    if (!teamMembers.length) {
      return res.status(200).json(successResponse([], "No team members found"));
    }

    const employeeIds = teamMembers.map(m => m.employeeId);

    // Check past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const todayStr = new Date().toISOString().split("T")[0];

    const pastAttendances = await AttendanceRecord.find({
      employeeId: { $in: employeeIds },
      date: { $gte: thirtyDaysAgo.toISOString().split("T")[0], $lt: todayStr },
      attendanceStatus: { $nin: ["ABSENT", "HOLIDAY", "WEEKEND", "LEAVE"] as any[] }
    }).sort({ date: -1 }).lean();

    const dates = [...new Set(pastAttendances.map(a => a.date))];

    const todos = await DailyTodo.find({
      employeeId: { $in: employeeIds },
      date: { $in: dates }
    }).lean();

    const eods = await EodReport.find({
      employeeId: { $in: employeeIds },
      date: { $in: dates }
    }).lean();

    const teamMissedTasks = [];

    for (const member of teamMembers) {
      const memberAttendances = pastAttendances.filter(a => a.employeeId === member.employeeId);
      const missed = [];

      for (const record of memberAttendances) {
        const hasTodo = todos.some(t => t.employeeId === member.employeeId && t.date === record.date);
        const hasEod = eods.some(e => e.employeeId === member.employeeId && e.date === record.date);

        if (!hasTodo || !hasEod) {
          missed.push({
            date: record.date,
            missedTodo: !hasTodo,
            missedEod: !hasEod,
          });
        }
      }

      if (missed.length > 0) {
        teamMissedTasks.push({
          employeeId: member.employeeId,
          name: member.name,
          missedTasks: missed
        });
      }
    }

    return res.status(200).json(successResponse(teamMissedTasks, "Team missed tasks retrieved"));
  }
);
