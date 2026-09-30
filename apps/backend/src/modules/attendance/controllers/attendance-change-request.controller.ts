import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { notificationService } from "../../../shared/services/notification.service";
import { AttendanceChangeRequest } from "../model/attendance-change-request.model";
import { AttendanceRecord } from "../model/attendance-record.model";
import { User } from "../../users/model/user.model";
import { createAdminAuditNotification } from "../../notifications/services/admin-notification.service";
import { applyAttendanceCorrection } from "./update-attendance-record.controller";
import {
  recomputeAttendanceDates,
  toDateKey,
  todayKey,
} from "../services/request-rules.service";
import { isSuperAdmin } from "../../../shared/utils/super-admin";
import { getSuperAdmins, withoutSuperAdmin } from "../../../shared/utils/super-admin";

const MAX_DAYS_BACK = 45;
const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "HR"]);
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const atIndiaTime = (date: string, time: string) =>
  new Date(`${date}T${time}:00+05:30`);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const actorOf = (req: AuthRequest) => ({
  employeeId: req.user?.employeeId || undefined,
  name: req.user?.name || undefined,
  role: req.user?.role || undefined,
});

/** Employee: ask to correct the login/logout of a day (today or earlier). */
export const createAttendanceChangeRequestController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const date = toDateKey(req.body?.date);
    const loginTime = String(req.body?.loginTime || "").trim();
    const logoutTime = String(req.body?.logoutTime || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const today = todayKey();

    if (!date) throw new AppError("Choose the date to correct.", 400);
    if (date > today) {
      throw new AppError("You can only correct today or an earlier day.", 400);
    }
    const oldest = new Date(`${today}T12:00:00Z`);
    oldest.setUTCDate(oldest.getUTCDate() - MAX_DAYS_BACK);
    if (date < oldest.toISOString().slice(0, 10)) {
      throw new AppError(
        `Corrections can be requested for the last ${MAX_DAYS_BACK} days only.`,
        400,
      );
    }
    if (!timeRegex.test(loginTime)) {
      throw new AppError("Enter the correct login time (HH:MM).", 400);
    }
    if (logoutTime && !timeRegex.test(logoutTime)) {
      throw new AppError("Enter a valid logout time (HH:MM).", 400);
    }
    if (logoutTime && logoutTime <= loginTime) {
      throw new AppError("Logout time must be after the login time.", 400);
    }
    if (reason.length < 5) {
      throw new AppError("Please explain what is wrong (a short reason).", 400);
    }

    const pending = await AttendanceChangeRequest.exists({
      employeeId,
      date,
      status: "PENDING",
    });
    if (pending) {
      throw new AppError(
        "You already have a pending correction for this date. Cancel it first to send a new one.",
        409,
      );
    }

    const record = await AttendanceRecord.findOne({ employeeId, date }).lean();
    const user = await User.findOne({ employeeId }).select("name").lean();
    const actor = actorOf(req);

    const request = await AttendanceChangeRequest.create({
      employeeId,
      employeeName: user?.name || req.user?.name || employeeId,
      date,
      requestedLoginTime: atIndiaTime(date, loginTime),
      requestedLogoutTime: logoutTime ? atIndiaTime(date, logoutTime) : null,
      reason,
      status: "PENDING",
      before: {
        attendanceStatus: record?.attendanceStatus || null,
        loginTime: record?.loginTime || null,
        logoutTime: record?.logoutTime || null,
        loginTimeOverridden: Boolean(record?.loginTimeOverridden),
        logoutTimeOverridden: Boolean(record?.logoutTimeOverridden),
      },
      history: [
        {
          at: new Date(),
          byEmployeeId: actor.employeeId,
          byName: actor.name,
          byRole: actor.role,
          action: "REQUESTED",
          toStatus: "PENDING",
          note: reason,
        },
      ],
    });

    await createAdminAuditNotification({
      kind: "ATTENDANCE_CHANGE_REQUESTED",
      title: "Attendance correction requested",
      message: `${request.employeeName} asked to correct attendance for ${date}: login ${loginTime}${logoutTime ? `, logout ${logoutTime}` : ""}.`,
      employeeId,
      employeeName: request.employeeName,
      entityType: "ATTENDANCE",
      entityId: String(request._id),
      entityDate: date,
      reason,
      before: request.before,
      after: { loginTime, logoutTime: logoutTime || null },
      deepLink: `/dashboard/requests?tab=attendance&id=${request._id}`,
      changedBy: actor,
    }).catch(() => undefined);

    res
      .status(201)
      .json(successResponse(request, "Attendance correction requested"));
  },
);

const buildFilter = (query: any) => {
  const filter: Record<string, any> = {};
  const status = String(query.status || "").toUpperCase();
  if (["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
    filter.status = status;
  }
  const from = toDateKey(query.from);
  const to = toDateKey(query.to);
  if (from || to) {
    filter.date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }
  const search = String(query.search || "").trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { employeeName: pattern },
      { employeeId: pattern },
      { reason: pattern },
      { decisionReason: pattern },
      { date: pattern },
    ];
  }
  return filter;
};

/** Employee: own correction requests (history), searchable. */
export const getMyAttendanceChangeRequestsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const requests = await AttendanceChangeRequest.find({
      ...buildFilter(req.query),
      employeeId,
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const admins = await getSuperAdmins();
    res.json(
      successResponse(
        requests.map((r: any) => withoutSuperAdmin(admins, r)),
        "Attendance correction requests",
      ),
    );
  },
);

/** Admin: all correction requests, searchable. */
export const getAttendanceChangeRequestsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const filter = buildFilter(req.query);
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    const requests = await AttendanceChangeRequest.find(filter)
      .sort({ status: 1, createdAt: -1 })
      .limit(500)
      .lean();
    const admins = await getSuperAdmins();
    res.json(
      successResponse(
        requests.map((r: any) => withoutSuperAdmin(admins, r)),
        "Attendance correction requests",
      ),
    );
  },
);

/** Employee: withdraw a pending request. */
export const cancelAttendanceChangeRequestController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const request = await AttendanceChangeRequest.findById(req.params.id);
    if (!request) throw new AppError("Request not found", 404);
    if (request.employeeId !== req.user?.employeeId) {
      throw new AppError("You can only cancel your own requests", 403);
    }
    if (request.status !== "PENDING") {
      throw new AppError("Only pending requests can be cancelled", 400);
    }
    const actor = actorOf(req);
    request.status = "CANCELLED";
    request.history.push({
      at: new Date(),
      byEmployeeId: actor.employeeId,
      byName: actor.name,
      byRole: actor.role,
      action: "CANCELLED",
      fromStatus: "PENDING",
      toStatus: "CANCELLED",
      note: "",
    } as any);
    await request.save();
    res.json(successResponse(request, "Request cancelled"));
  },
);

/**
 * Admin: approve or reject. Admins/HR decide pending requests; once a
 * request is decided, only a Super Admin can change that decision (e.g.
 * approved -> rejected restores the attendance to how it was before).
 */
export const decideAttendanceChangeRequestController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const role = String(req.user?.role || "");
    if (!ADMIN_ROLES.has(role)) throw new AppError("Not allowed", 403);

    const nextStatus = String(req.body?.status || "").toUpperCase();
    if (!["APPROVED", "REJECTED"].includes(nextStatus)) {
      throw new AppError("Choose Approve or Reject.", 400);
    }
    const decisionReason = String(req.body?.decisionReason || "").trim();

    const request = await AttendanceChangeRequest.findById(req.params.id);
    if (!request) throw new AppError("Request not found", 404);
    if (request.status === "CANCELLED") {
      throw new AppError("This request was cancelled by the employee.", 400);
    }
    if (request.status !== "PENDING" && role !== "SUPER_ADMIN") {
      throw new AppError(
        "This request has already been decided. Only a Super Admin can change it.",
        403,
      );
    }
    if (request.status === nextStatus) {
      throw new AppError(`This request is already ${nextStatus.toLowerCase()}.`, 400);
    }
    if (nextStatus === "REJECTED" && !decisionReason) {
      throw new AppError("Give a reason for rejecting.", 400);
    }

    const actor = actorOf(req);
    const previousStatus = request.status;
    let record = await AttendanceRecord.findOne({
      employeeId: request.employeeId,
      date: request.date,
    });

    if (nextStatus === "APPROVED") {
      if (!record) {
        record = await AttendanceRecord.create({
          employeeId: request.employeeId,
          employeeName: request.employeeName,
          date: request.date,
          attendanceStatus: "ABSENT",
        } as any);
      }
      await applyAttendanceCorrection({
        record,
        changes: {
          loginTime: request.requestedLoginTime,
          ...(request.requestedLogoutTime
            ? { logoutTime: request.requestedLogoutTime }
            : {}),
        },
        reason: `Approved attendance correction request: ${request.reason}${decisionReason ? ` (${decisionReason})` : ""}`,
        actor,
      });
    } else if (previousStatus === "APPROVED" && record) {
      // Super Admin reversing an approval: put the record back as it was.
      const before: any = request.before || {};
      await applyAttendanceCorrection({
        record,
        changes: {
          loginTime: before.loginTime || null,
          logoutTime: before.logoutTime || null,
        },
        reason: `Attendance correction request reversed: ${decisionReason}`,
        actor,
      });
      record.loginTimeOverridden = Boolean(before.loginTimeOverridden);
      record.logoutTimeOverridden = Boolean(before.logoutTimeOverridden);
      await record.save();
      await recomputeAttendanceDates(request.employeeId, [request.date]);
    }

    request.status = nextStatus as any;
    request.decidedBy = actor.employeeId;
    request.decidedByName = isSuperAdmin(actor.role) ? undefined : actor.name;
    request.decisionReason = decisionReason;
    request.decidedAt = new Date();
    // Super Admin (developer) decisions are not logged.
    if (!isSuperAdmin(actor.role)) request.history.push({
      at: new Date(),
      byEmployeeId: actor.employeeId,
      byName: actor.name,
      byRole: actor.role,
      action: nextStatus,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      note: decisionReason,
    } as any);
    await request.save();

    await createAdminAuditNotification({
      kind: "ATTENDANCE_CHANGE_DECIDED",
      title: `Attendance correction ${nextStatus.toLowerCase()}`,
      message: `${request.employeeName}'s correction for ${request.date} was ${nextStatus.toLowerCase()}.`,
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      entityType: "ATTENDANCE",
      entityId: String(request._id),
      entityDate: request.date,
      reason: decisionReason || `Marked ${nextStatus}`,
      before: { status: previousStatus },
      after: { status: nextStatus },
      deepLink: `/dashboard/requests?tab=attendance&id=${request._id}`,
      changedBy: actor,
    }).catch(() => undefined);

    notificationService.broadcastToUser(
      request.employeeId,
      "attendance_request_decided",
      { request },
    );

    res.json(
      successResponse(request, `Request ${nextStatus.toLowerCase()}`),
    );
  },
);
