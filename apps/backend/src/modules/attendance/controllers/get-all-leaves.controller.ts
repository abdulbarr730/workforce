import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { LeaveRequest } from "../model/leave-request.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const getAllLeavesController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const leaves = await LeaveRequest.find().sort({ createdAt: -1 }).lean();
    res.status(200).json(successResponse(leaves, "All leave requests fetched"));
  },
);

export const getMyLeavesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    const leaves = await LeaveRequest.find({ employeeId })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(successResponse(leaves, "My leave requests fetched"));
  },
);
