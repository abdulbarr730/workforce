import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { startSessionSchema } from "../validators/start-session.validator";

import { startSession } from "../services/start-session.service";

export const startSessionController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const validatedData = startSessionSchema.parse(req.body);

    const user = (req as any).user;

    const result = await startSession(
      validatedData,

      user,
    );

    return res.status(201).json(
      successResponse(
        result,

        "Work session started",
      ),
    );
  },
);
