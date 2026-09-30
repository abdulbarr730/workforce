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
import {
  assertLeaveAllowed,
  normalizeTypeCode,
} from "../services/leave-policy.service";
import { isSuperAdmin, loggedName } from "../../../shared/utils/super-admin";

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

const historyEntry = (
  req: AuthRequest,
  action: string,
  fromStatus: string | null,
  toStatus: string | null,
  note = "",
) => isSuperAdmin(req.user?.role) ? null : ({
  at: new Date(),
  byEmployeeId: req.user?.employeeId || undefined,
  byName: req.user?.name || undefined,
  byRole: req.user?.role || undefined,
  action,
  fromStatus: fromStatus || undefined,
  toStatus: toStatus || undefined,
  note,
});

/**
 * Once logged, a leave stays as it is for everyone but a Super Admin: after
 * its date has passed, or once it has been approved/rejected/cancelled.
 */
const assertLeaveChangeable = (leave: any, role: string | undefined) => {
  assertRequestEditable(toDateKey(leave.startDate), role);
  if (leave.status !== "PENDING" && role !== "SUPER_ADMIN") {
    throw new AppError(
      `This leave is already ${String(leave.status).toLowerCase()} and is locked.`,
      403,
    );
  }
};

const getEmployeeName = async (employeeId: string, fallback?: string) => {
  const employee = await User.findOne({ employeeId }).select("name").lean();
  return employee?.name || fallback || employeeId;
};

export const requestLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const type = normalizeTypeCode(req.body.type);
    const { startDate, endDate } = normalizeLeaveDates({ ...req.body, type });
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
    // Leave type, blocked days and monthly/yearly limits.
    // Over the balance is allowed: those days are unpaid.
    const split = await assertLeaveAllowed({ employeeId, type, startDate, endDate });

    const employeeName = await getEmployeeName(employeeId, req.user?.name);
    const leaveRequest = await LeaveRequest.create({
      type,
      reason: req.body.reason,
      startDate,
      endDate,
      employeeId,
      employeeName,
      status: "PENDING",
      history: [
        historyEntry(req, "REQUESTED", null, "PENDING", String(req.body.reason || "")),
      ].filter(Boolean),
    });

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
      deepLink: `/dashboard/requests?leaveId=${leaveRequest._id}`,
      changedBy: {
        employeeId,
        name: req.user?.name,
        role: req.user?.role,
      },
    });

    res
      .status(201)
      .json(
        successResponse(
          { ...leaveRequest.toObject(), paidDays: split.paidDays, unpaidDays: split.unpaidDays },
          split.unpaidDays > 0
            ? `Leave requested. ${split.unpaidDays} day(s) are over your leave balance and will be unpaid.`
            : "Leave requested successfully",
        ),
      );
  },
);

export const processLeaveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { leaveId } = req.params;
    const { status, adminReason } = req.body;
    const adminId = req.user?.employeeId;

    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError("Leave request not found", 404);
    if (leave.status === "CANCELLED") {
      throw new AppError("This leave was cancelled by the employee.", 400);
    }
    if (leave.status === status) {
      throw new AppError(`This leave is already ${String(status).toLowerCase()}.`, 400);
    }
    // Past date or already decided: Super Admin only.
    assertLeaveChangeable(leave, req.user?.role);
    if (
      status === "REJECTED" &&
      !String(adminReason || "").trim() &&
      !isSuperAdmin(req.user?.role)
    ) {
      throw new AppError("Give a reason for rejecting.", 400);
    }

    const before = leaveSnapshot(leave);
    const previousStatus = leave.status;
    leave.status = status;
    leave.approvedBy = adminId as string;
    leave.decidedByName = loggedName(req.user);
    leave.decidedAt = new Date();
    if (adminReason) {
      leave.adminReason = adminReason;
    }
    if (!leave.employeeName) {
      leave.employeeName = await getEmployeeName(leave.employeeId);
    }
    const decidedEntry = historyEntry(req, status, previousStatus, status, String(adminReason || ""));
    if (decidedEntry) leave.history.push(decidedEntry as any);

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
      deepLink: `/dashboard/requests?leaveId=${leave._id}`,
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
    assertLeaveChangeable(leave, userRole);

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

    const nextType = normalizeTypeCode(type || leave.type);
    const datesChanged =
      nextType !== normalizeTypeCode(leave.type) ||
      dates.startDate !== toDateKey(leave.startDate) ||
      dates.endDate !== toDateKey(leave.endDate);
    if (datesChanged && userRole !== "SUPER_ADMIN") {
      await assertLeaveAllowed({
        employeeId: leave.employeeId,
        type: nextType,
        startDate: dates.startDate,
        endDate: dates.endDate,
        excludeLeaveId: String(leave._id),
      });
    }
    leave.type = nextType;
    leave.startDate = dates.startDate;
    leave.endDate = dates.endDate;
    leave.reason = reason || leave.reason;
    const editedEntry = historyEntry(
        req,
        "EDITED",
        leave.status,
        leave.status,
        `${before.type} ${before.startDate} to ${before.endDate} -> ${leave.type} ${leave.startDate} to ${leave.endDate}`,
      );
    if (editedEntry) leave.history.push(editedEntry as any);

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
      deepLink: `/dashboard/requests?leaveId=${leave._id}`,
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

    if (String(req.query.permanent) === "true") {
      if (userRole !== "SUPER_ADMIN") {
        throw new AppError("You don't have permission to delete a leave permanently.", 403);
      }
      const snapshot = leaveSnapshot(leave);
      const name = await getEmployeeName(leave.employeeId);
      await leave.deleteOne();
      // The audit trail of the deletion is kept.
      await createAdminAuditNotification({
        kind: "LEAVE_DELETED",
        title: "Leave permanently deleted",
        message: `${name}'s ${leave.type} leave (${leave.startDate} to ${leave.endDate}) was permanently deleted.`,
        employeeId: leave.employeeId,
        employeeName: name,
        entityType: "LEAVE",
        entityId: String(leave._id),
        reason: String(req.body?.reason || req.query.reason || "Permanently deleted"),
        before: { ...snapshot, history: leave.history },
        after: null,
        diff: {
          added: [],
          removed: [`${leave.type} leave: ${leave.startDate} to ${leave.endDate}`],
          changed: [],
        },
        deepLink: "/dashboard/requests",
        changedBy: {
          employeeId: req.user?.employeeId,
          name: req.user?.name,
          role: req.user?.role,
        },
      });
      refreshLeaveAttendance(leave.employeeId, leave);
      res.status(200).json(successResponse(null, "Leave permanently deleted"));
      return;
    }

    if (!ADMIN_ROLES.has(String(userRole))) {
      if (leave.employeeId !== employeeId) {
        throw new AppError("You can only cancel your own leave requests", 403);
      }
      if (leave.status !== "PENDING") {
        throw new AppError("You can only cancel pending leave requests", 403);
      }
    }
    if (leave.status === "CANCELLED") {
      throw new AppError("This leave is already cancelled.", 400);
    }
    assertLeaveChangeable(leave, userRole);

    // Cancelling keeps the request (and its history); nothing is deleted.
    const before = leaveSnapshot(leave);
    const employeeName = await getEmployeeName(leave.employeeId);
    const previousStatus = leave.status;
    leave.status = "CANCELLED";
    if (!leave.employeeName) leave.employeeName = employeeName;
    const cancelledEntry = historyEntry(
      req,
      "CANCELLED",
      previousStatus,
      "CANCELLED",
      String(req.body?.reason || ""),
    );
    if (cancelledEntry) leave.history.push(cancelledEntry as any);
    await leave.save();

    await createAdminAuditNotification({
      kind: "LEAVE_CANCELLED",
      title: "Leave request cancelled",
      message: `${employeeName}'s leave request was cancelled.`,
      employeeId: leave.employeeId,
      employeeName,
      entityType: "LEAVE",
      entityId: String(leave._id),
      reason: String(req.body?.reason || "Leave request cancelled"),
      before,
      after: leaveSnapshot(leave),
      diff: {
        added: [],
        removed: [
          `${leave.type} leave: ${leave.startDate} to ${leave.endDate}`,
        ],
        changed: [],
      },
      deepLink: `/dashboard/requests?leaveId=${leave._id}`,
      changedBy: {
        employeeId: req.user?.employeeId,
        name: req.user?.name,
        role: req.user?.role,
      },
    });

    refreshLeaveAttendance(leave.employeeId, leave);

    res
      .status(200)
      .json(successResponse(leave, "Leave request cancelled"));
  },
);
