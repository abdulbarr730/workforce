import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getActiveSession } from "../services/get-active-session.service";

export const getActiveSessionController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const session = await getActiveSession(user.employeeId);

    let formattedSession = null;
    if (session) {
      formattedSession = {
        ...session,
        sessionId: session._id,
        loginTime: session.loginAt,
        todos: session.todoList,
      };
    }

    return res.json(
      successResponse(formattedSession, "Active session fetched")
    );
  }
);
