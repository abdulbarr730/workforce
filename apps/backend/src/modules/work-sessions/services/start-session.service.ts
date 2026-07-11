import { WorkSession } from "../model/work-session.model";

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
  });

  if (existingSession) {
    if (payload.todoList && payload.todoList.length > 0) {
      existingSession.todoList = payload.todoList;
      await existingSession.save();
    }
    return existingSession;
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
