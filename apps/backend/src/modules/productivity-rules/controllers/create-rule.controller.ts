import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { createRuleSchema } from "../validators/create-rule.validator";

import { createRule } from "../services/create-rule.service";

export const createRuleController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const validatedData = createRuleSchema.parse(req.body);

    const user = (req as any).user;
    const userId = user.userId;

    const result = await createRule(
      validatedData,

      userId,
    );

    return res.status(201).json(
      successResponse(
        result,

        "Productivity rule created",
      ),
    );
  },
);
