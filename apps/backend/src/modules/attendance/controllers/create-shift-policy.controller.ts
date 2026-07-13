import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { createShiftPolicy } from "../services/create-shift-policy.service";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const createShiftPolicyController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // req is now strictly typed as AuthRequest, so req.user exists
    const adminEmployeeId = req.user?.employeeId;

    if (!adminEmployeeId) {
      throw new AppError("Unauthorized: Missing admin context", 401);
    }

    const shift = await createShiftPolicy(req.body, adminEmployeeId);

    res
      .status(201)
      .json(successResponse(shift, "Shift policy created successfully"));
  },
);
