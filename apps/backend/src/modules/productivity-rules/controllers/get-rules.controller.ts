import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ProductivityRule } from "../model/productivity-rule.model";

export const getRulesController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const rules = await ProductivityRule.find().sort({ appName: 1 }).lean();
    res.status(200).json(successResponse(rules, "Productivity rules fetched"));
  },
);
