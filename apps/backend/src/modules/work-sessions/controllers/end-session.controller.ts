import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { endSessionSchema } from "../validators/end-session.validator";

import { endSession } from "../services/end-session.service";

export const endSessionController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const validatedData = endSessionSchema.parse(req.body);

    const user = (req as any).user;

    const result = await endSession(
      user.employeeId,

      validatedData,
    );

    return res.json(
      successResponse(
        result,

        "Work session ended",
      ),
    );
  },
);
