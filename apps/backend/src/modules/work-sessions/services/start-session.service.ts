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

export const startSession =
  async (
    payload: StartSessionInput,

    user: CurrentUser
  ) => {
    /*
      Prevent multiple active sessions
    */

    const existingSession =
      await WorkSession.findOne({
        employeeId:
          user.employeeId,

        status: "ACTIVE"
      });

    if (existingSession) {
      return existingSession;
    }

    return await WorkSession.create({
      employeeId:
        user.employeeId,

      employeeName:
        user.name,

      departmentId:
        user.departmentId ||

        null,

      departmentName:
        user.departmentName ||

        null,

      loginAt:
        new Date(),

      todoList:
        payload.todoList
    });
  };