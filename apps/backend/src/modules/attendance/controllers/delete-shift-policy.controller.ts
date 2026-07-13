import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { ShiftPolicy } from "../model/shift-policy.model";

export const deleteShiftPolicyController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const policy = await ShiftPolicy.findById(id);

    if (!policy) {
      throw new AppError("Shift policy not found", 404);
    }

    if (policy.isDefault) {
      throw new AppError("Cannot delete the default shift policy", 400);
    }

    await ShiftPolicy.findByIdAndDelete(id);

    return res.json(successResponse(null, "Shift policy deleted successfully"));
  },
);
