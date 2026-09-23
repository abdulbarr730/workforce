import { WorkSession } from "../model/work-session.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { getBusinessDate } from "../../attendance/services/shift-schedule.service";
import { EventType } from "../../../_shared/types";

const REAL_SESSION_PRESENCE_TYPES = [
  EventType.USER_ACTIVITY,
  EventType.LOGIN,
  EventType.IDLE_END,
  EventType.AWAY_WORK_END,
  EventType.LOGOUT,
];

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
        $in: REAL_SESSION_PRESENCE_TYPES,
      },
      timestamp: { $gte: existingSession.loginAt },
    })
      .sort({ timestamp: -1 })
      .lean();

    const inactiveMinutes = latestPresence
      ? (Date.now() - new Date(latestPresence.timestamp).getTime()) / 60000
      : (Date.now() - existingSession.loginAt.getTime()) / 60000;

    if (existingBusinessDate !== currentBusinessDate || inactiveMinutes >= 120) {
      existingSession.logoutAt = latestPresence
        ? new Date(latestPresence.timestamp)
        : existingSession.loginAt;
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
