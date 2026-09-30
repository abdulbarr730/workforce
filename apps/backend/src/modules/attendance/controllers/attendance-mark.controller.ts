import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { loggedName } from "../../../shared/utils/super-admin";
import { User } from "../../users/model/user.model";
import {
  AttendanceMark,
  AttendanceMarkSettings,
  WorkLocation,
} from "../model/attendance-mark.model";
import {
  applyMarkToAttendance,
  clampLaptopOpen,
  clientIp,
  getMarkSettings,
  locationsFor,
  markRequiredFor,
  matchLocation,
} from "../services/attendance-mark.service";
import { toDateKey, todayKey } from "../services/request-rules.service";
import { createAdminAuditNotification } from "../../notifications/services/admin-notification.service";
import { resetMarkGateCache } from "../services/mark-gate.service";
import { notificationService } from "../../../shared/services/notification.service";

const num = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const readingFrom = (req: AuthRequest) => ({
  latitude: num(req.body?.latitude),
  longitude: num(req.body?.longitude),
  accuracyMeters: num(req.body?.accuracyMeters),
  wifiName: req.body?.wifiName ? String(req.body.wifiName).slice(0, 100) : null,
  publicIp: clientIp(req) || null,
});

const checkEntry = (reading: any, result: ReturnType<typeof matchLocation>) => ({
  at: new Date(),
  latitude: reading.latitude,
  longitude: reading.longitude,
  accuracyMeters: reading.accuracyMeters,
  wifiName: reading.wifiName,
  publicIp: reading.publicIp,
  matched: result.matched,
  locationName: result.location?.name || null,
  method: result.method,
  distanceMeters: result.distance,
});

// ── Employee (agent) ─────────────────────────────────────────────────────

/** What the agent needs: is marking on, is location needed, today's mark. */
export const getMarkStatusController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = String(req.user?.employeeId || "");
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const date = todayKey();
    const settings = await getMarkSettings();
    const required = await markRequiredFor(date);
    const locations = required && settings.locationRequired ? await locationsFor(employeeId) : [];
    const mark = await AttendanceMark.findOne({ employeeId, date }).lean();
    res.json(
      successResponse(
        {
          date,
          markRequired: required,
          locationRequired: required && settings.locationRequired && locations.length > 0,
          locations: locations.map((l: any) => l.name),
          mark,
        },
        "Mark attendance status",
      ),
    );
  },
);

/**
 * "Start & Mark Attendance". At a work location (or if no location is
 * needed) the login is when the laptop was opened; otherwise the employee is
 * waiting and the login becomes the time they reach a location.
 */
export const markAttendanceController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = String(req.user?.employeeId || "");
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const date = todayKey();
    if (!(await markRequiredFor(date))) {
      throw new AppError("Mark Attendance is not switched on.", 400);
    }
    const existing: any = await AttendanceMark.findOne({ employeeId, date });
    if (existing?.status === "MARKED") {
      res.json(successResponse(existing, "Attendance already marked"));
      return;
    }

    const settings = await getMarkSettings();
    const locations = settings.locationRequired ? await locationsFor(employeeId) : [];
    const reading = readingFrom(req);
    const laptopOpenAt = existing?.laptopOpenAt || clampLaptopOpen(req.body?.laptopOpenAt, date);
    const user: any = await User.findOne({ employeeId }).select("name").lean();
    const now = new Date();

    const mark: any =
      existing ||
      new AttendanceMark({
        employeeId,
        employeeName: user?.name || req.user?.name || employeeId,
        date,
        laptopOpenAt,
      });
    mark.markedAt = mark.markedAt || now;

    if (!locations.length) {
      // No location needed: the login is when the laptop was opened.
      mark.status = "MARKED";
      mark.loginTime = laptopOpenAt;
      mark.method = "NONE";
    } else {
      const result = matchLocation(reading, locations);
      mark.checks.push(checkEntry(reading, result));
      if (result.matched) {
        mark.status = "MARKED";
        // Already there on the first click: laptop-open time. Arrived later:
        // the time they got there.
        mark.locationReachedAt = now;
        mark.loginTime = existing ? now : laptopOpenAt;
        mark.locationName = result.location?.name || null;
        mark.method = result.method;
      } else if (!["PENDING_APPROVAL", "REJECTED"].includes(mark.status)) {
        // A request to work from elsewhere stays as it is.
        mark.status = "WAITING_LOCATION";
      }
    }
    await mark.save();
    if (mark.status === "MARKED") await applyMarkToAttendance(mark);

    res.json(
      successResponse(
        mark,
        mark.status === "MARKED"
          ? "Attendance marked"
          : "Not at a work location yet. Your attendance will be marked when you arrive.",
      ),
    );
  },
);

/** Agent, while waiting: "am I there yet?" — marks the moment they arrive. */
export const checkMarkLocationController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = String(req.user?.employeeId || "");
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const date = todayKey();
    const mark: any = await AttendanceMark.findOne({ employeeId, date });
    if (!mark) throw new AppError("Mark Attendance first.", 400);
    if (mark.status === "MARKED") {
      res.json(successResponse(mark, "Attendance already marked"));
      return;
    }
    // Waiting, waiting for approval or rejected: reaching a work location
    // still marks the attendance at that time.
    const locations = await locationsFor(employeeId);
    const reading = readingFrom(req);
    const result = matchLocation(reading, locations);
    // Keep the log small: only the latest 100 checks.
    mark.checks.push(checkEntry(reading, result));
    if (mark.checks.length > 100) mark.checks.splice(0, mark.checks.length - 100);
    if (result.matched || !locations.length) {
      const now = new Date();
      mark.status = "MARKED";
      mark.locationReachedAt = now;
      mark.loginTime = now;
      mark.locationName = result.location?.name || null;
      mark.method = result.method || "NONE";
    }
    await mark.save();
    if (mark.status === "MARKED") await applyMarkToAttendance(mark);
    res.json(
      successResponse(
        mark,
        mark.status === "MARKED" ? "Attendance marked" : "Still not at a work location",
      ),
    );
  },
);

/**
 * Not at a work location: start from here with a reason (required). The
 * attendance counts once an admin approves it; arriving at a work location
 * first still marks it by the arrival time.
 */
export const requestRemoteMarkController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = String(req.user?.employeeId || "");
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5) {
      throw new AppError("Reason is required: say why you are working from this location.", 400);
    }
    const date = todayKey();
    if (!(await markRequiredFor(date))) {
      throw new AppError("Mark Attendance is not switched on.", 400);
    }
    const mark: any = await AttendanceMark.findOne({ employeeId, date });
    if (!mark) throw new AppError("Click Start & Mark Attendance first.", 400);
    if (mark.status === "MARKED") {
      res.json(successResponse(mark, "Attendance already marked"));
      return;
    }
    const reading = readingFrom(req);
    mark.checks.push(checkEntry(reading, { matched: false, location: null, method: null, distance: null }));
    mark.status = "PENDING_APPROVAL";
    mark.remoteReason = reason.slice(0, 500);
    mark.remoteRequestedAt = new Date();
    mark.remoteDecision = null;
    mark.remoteDecidedByName = null;
    mark.remoteDecidedAt = null;
    mark.remoteDecisionNote = null;
    await mark.save();
    await createAdminAuditNotification({
      kind: "REMOTE_LOGIN_REQUESTED",
      title: "Working from another location",
      message: `${mark.employeeName || employeeId} started work away from the work location: "${mark.remoteReason}". Approve it to mark their attendance.`,
      employeeId,
      employeeName: mark.employeeName || employeeId,
      entityType: "ATTENDANCE",
      entityId: String(mark._id),
      entityDate: date,
      reason: mark.remoteReason,
      before: null,
      after: { status: "PENDING_APPROVAL" },
      deepLink: `/dashboard/locations?date=${date}`,
      changedBy: { employeeId, name: req.user?.name, role: req.user?.role },
    } as any).catch(() => undefined);
    res.json(
      successResponse(mark, "Sent to your admin. Your attendance will be marked when they approve it."),
    );
  },
);

// ── Admin ────────────────────────────────────────────────────────────────

/**
 * Approve / reject working from another location. Approved: the login is
 * when the laptop was opened. Rejected: not marked (arriving at a work
 * location later still marks it).
 */
export const decideRemoteMarkController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const decision = String(req.body?.decision || "").toUpperCase();
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      throw new AppError("Choose Approve or Reject.", 400);
    }
    const note = String(req.body?.note || "").trim();
    if (decision === "REJECTED" && !note && req.user?.role !== "SUPER_ADMIN") {
      throw new AppError("Reason is required to reject.", 400);
    }
    const mark: any = await AttendanceMark.findById(req.params.id);
    if (!mark) throw new AppError("Not found", 404);
    if (mark.status === "MARKED" && mark.method !== "REMOTE") {
      throw new AppError("This attendance is already marked at a work location.", 400);
    }
    if (!mark.remoteReason) {
      throw new AppError("There is no request to work from another location.", 400);
    }
    mark.remoteDecision = decision;
    mark.remoteDecidedByName = loggedName(req.user);
    mark.remoteDecidedAt = new Date();
    mark.remoteDecisionNote = note || null;
    if (decision === "APPROVED") {
      mark.status = "MARKED";
      mark.method = "REMOTE";
      mark.loginTime = mark.laptopOpenAt || mark.remoteRequestedAt || new Date();
      mark.locationName = null;
    } else {
      mark.status = "REJECTED";
    }
    await mark.save();
    if (mark.status === "MARKED") await applyMarkToAttendance(mark);
    notificationService.broadcastToUser(mark.employeeId, "attendance_mark_decided", {
      date: mark.date,
      decision,
      note: mark.remoteDecisionNote,
    });
    res.json(
      successResponse(mark, decision === "APPROVED" ? "Approved — attendance marked" : "Rejected"),
    );
  },
);

export const getMarkSettingsController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    res.json(successResponse(await getMarkSettings(), "Mark attendance settings"));
  },
);

/**
 * Switching Mark Attendance on applies from today; earlier days are never
 * changed. Switching it off returns to activity-based attendance.
 */
export const updateMarkSettingsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const current = await getMarkSettings();
    const markRequired = req.body?.markRequired === true;
    const locationRequired = req.body?.locationRequired === true;
    const requiredFrom =
      markRequired && !current.markRequired ? todayKey() : current.requiredFrom;
    await AttendanceMarkSettings.findOneAndUpdate(
      { key: "default" },
      {
        $set: {
          markRequired,
          locationRequired,
          requiredFrom: markRequired ? requiredFrom || todayKey() : current.requiredFrom,
          updatedBy: req.user?.employeeId || null,
          updatedByName: loggedName(req.user),
        },
      },
      { upsert: true },
    );
    resetMarkGateCache();
    res.json(successResponse(await getMarkSettings(), "Settings saved"));
  },
);

export const getWorkLocationsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const locations = await WorkLocation.find(
      req.query.includeInactive === "true" ? {} : { isActive: true },
    )
      .sort({ name: 1 })
      .lean();
    res.json(successResponse(locations, "Work locations"));
  },
);

const readLocationBody = (body: any) => {
  const name = String(body?.name || "").trim();
  if (!name) throw new AppError("Location name is required.", 400);
  const latitude = num(body?.latitude);
  const longitude = num(body?.longitude);
  if ((latitude === null) !== (longitude === null)) {
    throw new AppError("Enter both latitude and longitude, or neither.", 400);
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    throw new AppError("Latitude must be between -90 and 90.", 400);
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    throw new AppError("Longitude must be between -180 and 180.", 400);
  }
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : String(value || "").split(","))
      .map((v) => String(v).trim())
      .filter(Boolean);
  const wifiNames = list(body?.wifiNames);
  const publicIps = list(body?.publicIps);
  if (latitude === null && !wifiNames.length && !publicIps.length) {
    throw new AppError("Add a map location, an office Wi-Fi name or an office IP address.", 400);
  }
  const appliesTo: "ALL" | "EMPLOYEES" =
    body?.appliesTo === "EMPLOYEES" ? "EMPLOYEES" : "ALL";
  const employeeIds = list(body?.employeeIds);
  if (appliesTo === "EMPLOYEES" && !employeeIds.length) {
    throw new AppError("Choose at least one employee, or make it apply to everyone.", 400);
  }
  return {
    name,
    latitude,
    longitude,
    radiusMeters: Math.min(Math.max(num(body?.radiusMeters) ?? 200, 20), 5000),
    wifiNames,
    publicIps,
    appliesTo,
    employeeIds: appliesTo === "EMPLOYEES" ? employeeIds : [],
  };
};

export const createWorkLocationController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const location = await WorkLocation.create({
      ...readLocationBody(req.body),
      isActive: true,
      createdByName: loggedName(req.user),
    });
    res.status(201).json(successResponse(location, "Location added"));
  },
);

/** Edit a location, or switch it off with { isActive: false } (never deleted). */
export const updateWorkLocationController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const location: any = await WorkLocation.findById(req.params.id);
    if (!location) throw new AppError("Location not found", 404);
    if (req.body?.name !== undefined) {
      Object.assign(location, readLocationBody({ ...location.toObject(), ...req.body }));
    }
    if (typeof req.body?.isActive === "boolean") location.isActive = req.body.isActive;
    location.updatedByName = loggedName(req.user);
    await location.save();
    res.json(successResponse(location, "Location updated"));
  },
);

/** Admin: this browser's internet address (to add the office IP). */
export const getMyIpController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(successResponse({ ip: clientIp(req) }, "Your IP address"));
  },
);

/** Admin: everyone's marks for a day. */
export const getMarksController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const date = toDateKey(req.query.date) || todayKey();
    const marks = await AttendanceMark.find({ date })
      .select("-checks")
      .sort({ employeeName: 1 })
      .lean();
    res.json(successResponse(marks, "Attendance marks"));
  },
);
