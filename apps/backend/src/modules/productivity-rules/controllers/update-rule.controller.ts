import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { createRuleSchema } from "../validators/create-rule.validator";
import { ProductivityRule } from "../model/productivity-rule.model";

export const updateRuleController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const validatedData = createRuleSchema.parse(req.body);
    const user = (req as any).user;
    const userId = user.userId;

    const result = await ProductivityRule.findByIdAndUpdate(
      id,
      { ...validatedData, updatedBy: userId },
      { new: true },
    );

    if (!result) {
      return res.status(404).json(successResponse(null, "Rule not found"));
    }

    return res
      .status(200)
      .json(successResponse(result, "Productivity rule updated"));
  },
);
