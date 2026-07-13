import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ShiftPolicy } from "../model/shift-policy.model";
import { User } from "../../users/model/user.model";

export const updateShiftPolicyController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const adminEmployeeId = req.user?.employeeId;
    const { id } = req.params;

    if (!adminEmployeeId) {
      throw new AppError("Unauthorized: Missing admin context", 401);
    }

    const existingPolicy = await ShiftPolicy.findById(id);
    if (!existingPolicy) {
      throw new AppError("Shift policy not found", 404);
    }

    if (req.body.name && req.body.name !== existingPolicy.name) {
      const nameExists = await ShiftPolicy.findOne({ name: req.body.name });
      if (nameExists) {
        throw new AppError(
          `A shift policy with the name '${req.body.name}' already exists.`,
          409,
        );
      }
    }

    if (req.body.isDefault && !existingPolicy.isDefault) {
      await ShiftPolicy.updateMany({}, { isDefault: false });
    }

    Object.assign(existingPolicy, req.body);
    existingPolicy.updatedBy = adminEmployeeId;
    await existingPolicy.save();

    // If the name changed, update any users that have this policy assigned
    if (req.body.name && req.body.name !== existingPolicy.name) {
      await User.updateMany(
        { assignedShiftPolicyId: id },
        { assignedShiftPolicyName: req.body.name },
      );
    }

    res
      .status(200)
      .json(
        successResponse(existingPolicy, "Shift policy updated successfully"),
      );
  },
);
