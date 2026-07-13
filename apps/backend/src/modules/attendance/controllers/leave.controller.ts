import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { LeaveRequest } from "../model/leave-request.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AppError } from "../../../shared/utils/app-error";

export const requestLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const leaveRequest = await LeaveRequest.create({
      ...req.body,
      employeeId,
      status: "PENDING",
    });

    res
      .status(201)
      .json(successResponse(leaveRequest, "Leave requested successfully"));
  },
);

export const processLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { leaveId } = req.params;
    const { status } = req.body;
    const adminId = req.user?.employeeId;

    const leave = await LeaveRequest.findByIdAndUpdate(
      leaveId,
      { status, approvedBy: adminId },
      { returnDocument: "after" },
    );

    if (!leave) throw new AppError("Leave request not found", 404);

    res
      .status(200)
      .json(successResponse(leave, `Leave request ${status.toLowerCase()}`));
  },
);
