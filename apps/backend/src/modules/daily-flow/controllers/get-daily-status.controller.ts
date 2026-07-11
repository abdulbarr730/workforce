import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { User } from "../../users/model/user.model";
import { DailyTodo as Todo } from "../model/daily-todo.model";
import { EodReport as Eod } from "../model/eod-report.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

export const getDailyStatusController = asyncHandler(
  async (req: Request, res: Response) => {
    const date =
      (req.query.date as string) || new Date().toISOString().split("T")[0];
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    // Fetch all active employees
    const users = await User.find({
      isActive: true,
      role: { $nin: ["SUPER_ADMIN", "ADMIN"] as any[] },
    }).lean();

    // Fetch all todos for the day
    const todos = await Todo.find({
      date,
    }).lean();

    // Fetch all eods for the day
    const eods = await Eod.find({
      date,
    }).lean();

    // Fetch work sessions for login/logout times
    const sessions = await WorkSession.find({
      loginAt: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    // Fetch attendance records for accurate computed times
    const attendanceRecords = await AttendanceRecord.find({
      date,
    }).lean();

    // Fetch last activities for accurate fallback if attendance is not yet generated
    const lastActivities = await ActivityEvent.aggregate([
      { $match: { timestamp: { $gte: startOfDay, $lte: endOfDay } } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: "$employeeId", lastSeen: { $first: "$timestamp" } } },
    ]);

    const isPastDate = date < new Date().toISOString().split("T")[0];

    const result = users.map((u) => {
      const userTodo = todos.find((t) => t.employeeId === u.employeeId);
      const userEod = eods.find((e) => e.employeeId === u.employeeId);

      const userSessions = sessions
        .filter((s) => s.employeeId === u.employeeId)
        .sort(
          (a, b) =>
            new Date(a.loginAt).getTime() - new Date(b.loginAt).getTime(),
        );
      const userAttendance = attendanceRecords.find(
        (a) => a.employeeId === u.employeeId,
      );

      let exactLoginTime =
        userAttendance?.loginTime ||
        (userSessions.length > 0 ? userSessions[0].loginAt : null);
      let exactLogoutTime =
        userAttendance?.logoutTime ||
        (userSessions.length > 0 &&
        userSessions[userSessions.length - 1].logoutAt
          ? userSessions[userSessions.length - 1].logoutAt
          : null);

      if (!exactLogoutTime && isPastDate) {
        const lastAct = lastActivities.find((a) => a._id === u.employeeId);
        if (lastAct) {
          exactLogoutTime = lastAct.lastSeen;
        }
      }

      // If EOD is submitted but logout is null (and no activity was found), fallback to EOD submission time
      if (!exactLogoutTime && userEod && isPastDate) {
        exactLogoutTime = userEod.submittedAt || userEod.updatedAt;
      }

      // If still no exactLogoutTime, check expectedLogoutTime from attendance
      if (!exactLogoutTime && userAttendance?.expectedLogoutTime) {
        if (
          isPastDate ||
          new Date() > new Date(userAttendance.expectedLogoutTime)
        ) {
          exactLogoutTime = userAttendance.expectedLogoutTime;
        }
      }

      return {
        _id: u._id,
        employeeId: u.employeeId,
        name: u.name,
        department: (u as any).departmentName || null,
        todo: userTodo
          ? {
              items: userTodo.items,
              submittedAt: userTodo.updatedAt || userTodo.createdAt,
            }
          : null,
        eod: userEod
          ? {
              summary: userEod.summary,
              completedItems: userEod.completedItems,
              top3Tasks: (userEod as any).top3Tasks,
              hoursWorked: userEod.hoursWorked,
              submittedAt: userEod.submittedAt || userEod.updatedAt,
            }
          : null,
        loginTime: exactLoginTime,
        logoutTime: exactLogoutTime,
        expectedLogoutTime: userAttendance?.expectedLogoutTime || null,
        sessions: userSessions.map((s) => ({
          loginAt: s.loginAt,
          logoutAt: s.logoutAt,
        })),
      };
    });

    return res.json(
      successResponse(result, "Daily status fetched successfully"),
    );
  },
);
