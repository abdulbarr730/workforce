import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { LeaveRequest } from "../model/leave-request.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AppError } from "../../../shared/utils/app-error";
import { notificationService } from "../../../shared/services/notification.service";

export const requestLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const leaveRequest = await LeaveRequest.create({
      ...req.body,
      employeeId,
      status: "PENDING",
    });

    notificationService.broadcastToRole("ADMIN", "leave_requested", { leaveRequest });

    res
      .status(201)
      .json(successResponse(leaveRequest, "Leave requested successfully"));
  }
);

export const processLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { leaveId } = req.params;
    const { status, adminReason } = req.body;
    const adminId = req.user?.employeeId;

    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError("Leave request not found", 404);

    if (status === "CANCELLED") {
      const { AttendanceRecord } = require("../model/attendance-record.model");
      const attendance = await AttendanceRecord.findOne({
        employeeId: leave.employeeId,
        date: leave.startDate.split("T")[0],
      });

      if (!attendance || !attendance.loginTime) {
        throw new AppError("Cannot cancel: Employee did not start the agent on this date", 400);
      }
    }

    leave.status = status;
    leave.approvedBy = adminId as string;
    if (adminReason) {
      leave.adminReason = adminReason;
    }
    
    await leave.save();

    notificationService.broadcastToUser(leave.employeeId, "leave_processed", { leave });

    res
      .status(200)
      .json(successResponse(leave, `Leave request ${status.toLowerCase()}`));
  }
);

export const updateLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { leaveId } = req.params;
    const userRole = req.user?.role;
    const employeeId = req.user?.employeeId;

    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError("Leave request not found", 404);

    if (userRole === "EMPLOYEE") {
      if (leave.employeeId !== employeeId) {
        throw new AppError("You can only edit your own leave requests", 403);
      }
      if (leave.status !== "PENDING") {
        throw new AppError("You can only edit pending leave requests", 403);
      }
    }

    const { type, startDate, endDate, reason } = req.body;
    
    leave.type = type || leave.type;
    leave.startDate = startDate || leave.startDate;
    leave.endDate = endDate || leave.endDate;
    leave.reason = reason || leave.reason;

    await leave.save();

    res
      .status(200)
      .json(successResponse(leave, "Leave request updated successfully"));
  }
);

export const deleteLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { leaveId } = req.params;
    const userRole = req.user?.role;
    const employeeId = req.user?.employeeId;

    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError("Leave request not found", 404);

    if (userRole === "EMPLOYEE") {
      if (leave.employeeId !== employeeId) {
        throw new AppError("You can only delete your own leave requests", 403);
      }
      if (leave.status !== "PENDING") {
        throw new AppError("You can only delete pending leave requests", 403);
      }
    }

    await leave.deleteOne();

    res
      .status(200)
      .json(successResponse(null, "Leave request deleted successfully"));
  }
);
