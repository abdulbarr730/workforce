import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { Department } from "../model/department.model";

export const getDepartmentsController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const departments = await Department.find({ isActive: true })
      .sort({ name: 1 })
      .lean();
    res
      .status(200)
      .json(
        successResponse({ departments }, "Departments fetched successfully"),
      );
  },
);
