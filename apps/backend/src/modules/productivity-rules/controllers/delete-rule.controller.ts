import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { ProductivityRule } from "../model/productivity-rule.model";

export const deleteRuleController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await ProductivityRule.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json(successResponse(null, "Rule not found"));
    }

    return res
      .status(200)
      .json(successResponse(null, "Productivity rule deleted"));
  },
);
