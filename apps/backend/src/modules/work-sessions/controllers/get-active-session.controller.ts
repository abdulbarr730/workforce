import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getActiveSession } from "../services/get-active-session.service";

export const getActiveSessionController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const user = (req as any).user;

    const session = await getActiveSession(user.employeeId);

    return res.json(
      successResponse(
        session,

        "Active session fetched",
      ),
    );
  },
);
