import { WorkSession } from "../model/work-session.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import {
  getBusinessDate,
  getBusinessDayBounds,
} from "../../attendance/services/shift-schedule.service";
import { EventType } from "../../../_shared/types";

interface StartSessionInput {
  todoList: string[];
}

interface CurrentUser {
  employeeId: string;

  name: string;

  departmentId?: string;

  departmentName?: string;
}

export const startSession = async (
  payload: StartSessionInput,

  user: CurrentUser,
) => {
  /*
      Prevent multiple active sessions
    */

  const existingSession = await WorkSession.findOne({
    employeeId: user.employeeId,

    status: "ACTIVE",
  }).sort({ loginAt: -1 });

  if (existingSession) {
    const currentBusinessDate = getBusinessDate();
    const existingBusinessDate = getBusinessDate(existingSession.loginAt);
    const latestPresence = await ActivityEvent.findOne({
      employeeId: user.employeeId,
      invalidated: { $ne: true },
      type: {
        $in: [
          EventType.USER_ACTIVITY,
          EventType.ACTIVE_WINDOW,
          EventType.LOGIN,
        ],
      },
      timestamp: { $gte: existingSession.loginAt },
    })
      .sort({ timestamp: -1 })
      .lean();

    const inactiveMinutes = latestPresence
      ? (Date.now() - new Date(latestPresence.timestamp).getTime()) / 60000
      : (Date.now() - existingSession.loginAt.getTime()) / 60000;

    if (existingBusinessDate !== currentBusinessDate || inactiveMinutes >= 120) {
      const fallbackBounds = getBusinessDayBounds(existingBusinessDate);
      existingSession.logoutAt = latestPresence
        ? new Date(latestPresence.timestamp)
        : fallbackBounds.start;
      existingSession.status = "COMPLETED";
      await existingSession.save();
    } else {
    if (payload.todoList && payload.todoList.length > 0) {
      existingSession.todoList = payload.todoList;
      await existingSession.save();
    }
    return existingSession;
    }
  }

  return await WorkSession.create({
    employeeId: user.employeeId,

    employeeName: user.name,

    departmentId: user.departmentId || null,

    departmentName: user.departmentName || null,

    loginAt: new Date(),

    todoList: payload.todoList,
  });
};
