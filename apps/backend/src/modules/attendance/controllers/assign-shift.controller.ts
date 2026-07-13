import { Request, Response } from "express";

import { User } from "../../users/model/user.model";

import { ShiftPolicy } from "../model/shift-policy.model";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { AppError } from "../../../shared/utils/app-error";

export const assignShiftController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const {
      employeeId,

      shiftPolicyId,
    } = req.body;

    const user = await User.findOne({
      employeeId,
    });

    if (!user) {
      throw new AppError(
        "Employee not found",

        404,
      );
    }

    const shift = await ShiftPolicy.findById(shiftPolicyId);

    if (!shift) {
      throw new AppError(
        "Shift policy not found",

        404,
      );
    }

    user.assignedShiftPolicyId = shift._id.toString();

    user.assignedShiftPolicyName = shift.name;

    await user.save();

    return res.json(
      successResponse(
        user,

        "Shift assigned successfully",
      ),
    );
  },
);
