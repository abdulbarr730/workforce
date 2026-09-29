import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { LeaveRequest } from "../model/leave-request.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AppError } from "../../../shared/utils/app-error";
import { notificationService } from "../../../shared/services/notification.service";
import { User } from "../../users/model/user.model";
import {
  addChangedFields,
  createAdminAuditNotification,
} from "../../notifications/services/admin-notification.service";
import {
  assertRequestEditable,
  datesBetween,
  recomputeAttendanceDates,
  toDateKey,
  todayKey,
} from "../services/request-rules.service";

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "HR"]);

/**
 * Leave dates are always plain "YYYY-MM-DD". Employees can only ask for
 * today or later; a half-day leave is a single day.
 */
const normalizeLeaveDates = (input: {
  type?: string;
  startDate?: unknown;
  endDate?: unknown;
}) => {
  const startDate = toDateKey(input.startDate);
  let endDate = toDateKey(input.endDate) || startDate;
  if (!startDate) throw new AppError("Choose a valid start date.", 400);
  if (String(input.type || "").toUpperCase() === "HALF_DAY") endDate = startDate;
  if (endDate < startDate) {
    throw new AppError("End date cannot be before the start date.", 400);
  }
  return { startDate, endDate };
};

const refreshLeaveAttendance = (
  employeeId: string,
  ...ranges: Array<{ startDate: unknown; endDate: unknown }>
) => {
  const dates = new Set<string>();
  for (const range of ranges) {
    const start = toDateKey(range.startDate);
    const end = toDateKey(range.endDate) || start;
    if (start) datesBetween(start, end).forEach((date) => dates.add(date));
  }
  void recomputeAttendanceDates(employeeId, Array.from(dates));
};

const leaveSnapshot = (leave: any) => ({
  type: leave.type,
  startDate: leave.startDate,
  endDate: leave.endDate,
  reason: leave.reason,
  status: leave.status,
  adminReason: leave.adminReason || "",
});

const getEmployeeName = async (employeeId: string, fallback?: string) => {
  const employee = await User.findOne({ employeeId }).select("name").lean();
  return employee?.name || fallback || employeeId;
};

export const requestLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { startDate, endDate } = normalizeLeaveDates(req.body);
    if (startDate < todayKey()) {
      throw new AppError(
        "Leave can only be requested for today or a future date.",
        400,
      );
    }
    const overlapping = await LeaveRequest.find({
      employeeId,
      status: { $in: ["PENDING", "APPROVED"] },
    })
      .select("startDate endDate status")
      .lean();
    if (
      overlapping.some(
        (leave) =>
          toDateKey(leave.startDate) <= endDate &&
          (toDateKey(leave.endDate) || toDateKey(leave.startDate)) >= startDate,
      )
    ) {
      throw new AppError(
        "You already have a pending or approved leave on these dates.",
        409,
      );
    }

    const leaveRequest = await LeaveRequest.create({
      ...req.body,
      startDate,
      endDate,
      employeeId,
      status: "PENDING",
    });

    const employeeName = await getEmployeeName(employeeId, req.user?.name);
    const after = leaveSnapshot(leaveRequest);
    await createAdminAuditNotification({
      kind: "LEAVE_REQUESTED",
      title: "New leave request",
      message: `${employeeName} requested ${leaveRequest.type} leave.`,
      employeeId,
      employeeName,
      entityType: "LEAVE",
      entityId: String(leaveRequest._id),
      reason: leaveRequest.reason,
      before: null,
      after,
      diff: {
        added: [
          `${leaveRequest.type} leave: ${leaveRequest.startDate} to ${leaveRequest.endDate}`,
        ],
        removed: [],
        changed: [],
      },
      deepLink: `/dashboard/leaves?leaveId=${leaveRequest._id}`,
      changedBy: {
        employeeId,
        name: req.user?.name,
        role: req.user?.role,
      },
    });

    res
      .status(201)
      .json(successResponse(leaveRequest, "Leave requested successfully"));
  },
);

export const processLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { leaveId } = req.params;
    const { status, adminReason } = req.body;
    const adminId = req.user?.employeeId;

    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError("Leave request not found", 404);
    // After the leave's date has passed only a Super Admin can change it.
    assertRequestEditable(toDateKey(leave.startDate), req.user?.role);

    if (status === "CANCELLED") {
      const { AttendanceRecord } = require("../model/attendance-record.model");
      const attendance = await AttendanceRecord.findOne({
        employeeId: leave.employeeId,
        date: leave.startDate.split("T")[0],
      });

      if (!attendance || !attendance.loginTime) {
        throw new AppError(
          "Cannot cancel: Employee did not start the agent on this date",
          400,
        );
      }
    }

    const before = leaveSnapshot(leave);
    leave.status = status;
    leave.approvedBy = adminId as string;
    if (adminReason) {
      leave.adminReason = adminReason;
    }

    await leave.save();

    const after = leaveSnapshot(leave);
    const employeeName = await getEmployeeName(leave.employeeId);
    const diff = addChangedFields(
      { added: [], removed: [], changed: [] },
      before,
      after,
      ["status", "adminReason"],
    );
    await createAdminAuditNotification({
      kind: "LEAVE_PROCESSED",
      title: `Leave ${String(status).toLowerCase()}`,
      message: `${employeeName}'s leave was changed to ${status}.`,
      employeeId: leave.employeeId,
      employeeName,
      entityType: "LEAVE",
      entityId: String(leave._id),
      reason: adminReason || `Status changed to ${status}`,
      before,
      after,
      diff,
      deepLink: `/dashboard/leaves?leaveId=${leave._id}`,
      changedBy: {
        employeeId: req.user?.employeeId,
        name: req.user?.name,
        role: req.user?.role,
      },
    });

    notificationService.broadcastToUser(leave.employeeId, "leave_processed", {
      leave,
    });
    // Approving/rejecting changes whether those days are LEAVE or worked.
    refreshLeaveAttendance(leave.employeeId, leave);

    res
      .status(200)
      .json(successResponse(leave, `Leave request ${status.toLowerCase()}`));
  },
);

export const updateLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { leaveId } = req.params;
    const userRole = req.user?.role;
    const employeeId = req.user?.employeeId;

    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError("Leave request not found", 404);

    if (!ADMIN_ROLES.has(String(userRole))) {
      if (leave.employeeId !== employeeId) {
        throw new AppError("You can only edit your own leave requests", 403);
      }
      if (leave.status !== "PENDING") {
        throw new AppError("You can only edit pending leave requests", 403);
      }
    }
    assertRequestEditable(toDateKey(leave.startDate), userRole);

    const before = leaveSnapshot(leave);
    const previousRange = {
      startDate: leave.startDate,
      endDate: leave.endDate,
    };
    const { type, reason } = req.body;
    const dates = normalizeLeaveDates({
      type: type || leave.type,
      startDate: req.body.startDate || leave.startDate,
      endDate: req.body.endDate || leave.endDate,
    });
    if (!ADMIN_ROLES.has(String(userRole)) && dates.startDate < todayKey()) {
      throw new AppError(
        "Leave can only be requested for today or a future date.",
        400,
      );
    }

    leave.type = type || leave.type;
    leave.startDate = dates.startDate;
    leave.endDate = dates.endDate;
    leave.reason = reason || leave.reason;

    await leave.save();

    const after = leaveSnapshot(leave);
    const employeeName = await getEmployeeName(leave.employeeId);
    const diff = addChangedFields(
      { added: [], removed: [], changed: [] },
      before,
      after,
      ["type", "startDate", "endDate", "reason"],
    );
    await createAdminAuditNotification({
      kind: "LEAVE_UPDATED",
      title: "Leave request edited",
      message: `${employeeName}'s leave request was edited.`,
      employeeId: leave.employeeId,
      employeeName,
      entityType: "LEAVE",
      entityId: String(leave._id),
      reason: String(req.body.editReason || reason || "Leave details updated"),
      before,
      after,
      diff,
      deepLink: `/dashboard/leaves?leaveId=${leave._id}`,
      changedBy: {
        employeeId: req.user?.employeeId,
        name: req.user?.name,
        role: req.user?.role,
      },
    });

    refreshLeaveAttendance(leave.employeeId, previousRange, leave);

    res
      .status(200)
      .json(successResponse(leave, "Leave request updated successfully"));
  },
);

export const deleteLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { leaveId } = req.params;
    const userRole = req.user?.role;
    const employeeId = req.user?.employeeId;

    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError("Leave request not found", 404);

    if (!ADMIN_ROLES.has(String(userRole))) {
      if (leave.employeeId !== employeeId) {
        throw new AppError("You can only delete your own leave requests", 403);
      }
      if (leave.status !== "PENDING") {
        throw new AppError("You can only delete pending leave requests", 403);
      }
    }
    assertRequestEditable(toDateKey(leave.startDate), userRole);

    const before = leaveSnapshot(leave);
    const employeeName = await getEmployeeName(leave.employeeId);
    await leave.deleteOne();

    await createAdminAuditNotification({
      kind: "LEAVE_DELETED",
      title: "Leave request deleted",
      message: `${employeeName}'s leave request was deleted.`,
      employeeId: leave.employeeId,
      employeeName,
      entityType: "LEAVE",
      entityId: String(leave._id),
      reason: String(req.body?.reason || "Leave request deleted"),
      before,
      after: null,
      diff: {
        added: [],
        removed: [
          `${leave.type} leave: ${leave.startDate} to ${leave.endDate}`,
        ],
        changed: [],
      },
      deepLink: `/dashboard/leaves?leaveId=${leave._id}`,
      changedBy: {
        employeeId: req.user?.employeeId,
        name: req.user?.name,
        role: req.user?.role,
      },
    });

    refreshLeaveAttendance(leave.employeeId, leave);

    res
      .status(200)
      .json(successResponse(null, "Leave request deleted successfully"));
  },
);
