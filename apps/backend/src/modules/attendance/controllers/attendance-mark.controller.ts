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
import { notifyEmployeeByEmail } from "../../../shared/services/email.service";
import { assertNotOwn } from "../../../shared/utils/own-record";

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

const istClock = (value: Date) =>
  value.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

/**
 * The start time the employee picked. Must be no earlier than the laptop-open
 * time (to the minute) and not in the future; empty means the laptop-open time.
 */
const readChosenStart = (value: unknown, laptopOpenAt: Date, now: Date) => {
  if (value === null || value === undefined || value === "") return laptopOpenAt;
  const chosen = new Date(String(value));
  if (Number.isNaN(chosen.getTime())) {
    throw new AppError("Choose a valid start time.", 400);
  }
  const floorMinute = Math.floor(laptopOpenAt.getTime() / 60_000) * 60_000;
  if (chosen.getTime() < floorMinute) {
    throw new AppError(
      `You can't start before ${istClock(laptopOpenAt)}, when your laptop was opened. For an earlier time, send an attendance correction request for your admin to approve.`,
      400,
    );
  }
  if (chosen.getTime() > now.getTime() + 60_000) {
    throw new AppError("The start time can't be in the future.", 400);
  }
  return chosen.getTime() < laptopOpenAt.getTime() ? laptopOpenAt : chosen;
};

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

    // The employee may start later than the laptop opened (never earlier:
    // an earlier time needs an attendance-correction request).
    const chosenStartAt = readChosenStart(req.body?.chosenStartAt, laptopOpenAt, now);

    const mark: any =
      existing ||
      new AttendanceMark({
        employeeId,
        employeeName: user?.name || req.user?.name || employeeId,
        date,
        laptopOpenAt,
      });
    mark.markedAt = mark.markedAt || now;
    if (!existing) mark.chosenStartAt = chosenStartAt;
    const startAt = mark.chosenStartAt || laptopOpenAt;

    if (!locations.length) {
      // No location needed: the login is the chosen start (laptop-open time
      // or later).
      mark.status = "MARKED";
      mark.loginTime = startAt;
      mark.method = "NONE";
    } else {
      const result = matchLocation(reading, locations);
      mark.checks.push(checkEntry(reading, result));
      if (result.matched) {
        mark.status = "MARKED";
        // Already there on the first click: the chosen start. Arrived later:
        // the time they got there.
        mark.locationReachedAt = now;
        mark.loginTime = existing ? now : startAt;
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
    assertNotOwn(req.user, mark.employeeId);
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
      // Approved: counted from the chosen start (laptop-open time or later).
      mark.loginTime =
        mark.chosenStartAt || mark.laptopOpenAt || mark.remoteRequestedAt || new Date();
      mark.locationName = null;
    } else {
      mark.status = "REJECTED";
    }
    await mark.save();
    if (mark.status === "MARKED") await applyMarkToAttendance(mark);
    if (req.body?.sendEmail === true) {
      const approved = decision === "APPROVED";
      await notifyEmployeeByEmail({
        employeeId: mark.employeeId,
        category: "REMOTE_START_DECIDED",
        subject: `Working from another location on ${mark.date}: ${approved ? "approved" : "not approved"}`,
        title: approved ? "Your start was approved" : "Your request was not approved",
        lines: [
          approved
            ? `Your request to start work from another location on ${mark.date} was approved. Your attendance is marked.`
            : `Your request to start work from another location on ${mark.date} was not approved. Your attendance will be marked when you reach your work location.`,
        ],
        details: [
          ...(approved && mark.loginTime
            ? ([[
                "Login time",
                new Date(mark.loginTime).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              ]] as Array<[string, string]>)
            : []),
          ...(mark.remoteDecisionNote ? ([["Note", String(mark.remoteDecisionNote)]] as Array<[string, string]>) : []),
        ],
        sentBy: { employeeId: req.user?.employeeId, name: req.user?.name },
      });
    }

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

// ── Google Maps link → map point ─────────────────────────────────────────
// Only Google's own Maps / short-link hosts are ever fetched.
const GOOGLE_HOST =
  /^(?:(?:www|maps)\.)?google\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$|^(?:maps\.app\.)?goo\.gl$/i;

/** Latitude/longitude from a Google Maps URL (place pin preferred). */
const coordsFromMapsUrl = (url: string) => {
  const text = decodeURIComponent(url);
  const pairs: Array<[RegExp, number]> = [
    [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, 1], // exact place pin
    [/[?&](?:q|query|ll|center|destination|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, 1],
    [/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, 1], // map centre
    [/\/place\/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, 1],
    [/\/search\/(-?\d+(?:\.\d+)?),\s*\+?(-?\d+(?:\.\d+)?)/, 1],
  ];
  for (const [pattern] of pairs) {
    const match = text.match(pattern);
    if (match) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
      ) {
        return { latitude, longitude };
      }
    }
  }
  return null;
};

/**
 * Admin: turn a Google Maps link (long or a maps.app.goo.gl share link) into
 * latitude / longitude. Only Google Maps addresses are followed.
 */
export const resolveMapUrlController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    let current = String(req.body?.url || "").trim();
    if (!/^https?:\/\//i.test(current)) current = `https://${current}`;
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new AppError("Paste a Google Maps link.", 400);
    }
    if (!GOOGLE_HOST.test(parsed.hostname)) {
      throw new AppError("Only Google Maps links can be used.", 400);
    }
    // Follow short-link redirects (a few hops, Google hosts only).
    for (let hop = 0; hop < 5; hop += 1) {
      const found = coordsFromMapsUrl(current);
      if (found) {
        res.json(successResponse({ ...found, url: current }, "Location found"));
        return;
      }
      let response: globalThis.Response;
      try {
        response = await fetch(current, {
          method: "GET",
          redirect: "manual",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; WorkforceBot/1.0)" },
          signal: AbortSignal.timeout(8_000),
        });
      } catch {
        throw new AppError("Could not open that link. Check it and try again.", 400);
      }
      const next = response.headers.get("location");
      if (!next) {
        // No redirect: the page itself may carry the coordinates.
        const body = (await response.text().catch(() => "")).slice(0, 400_000);
        const inBody =
          coordsFromMapsUrl(body) ||
          (() => {
            const m = body.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
            return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
          })();
        if (inBody) {
          res.json(successResponse({ ...inBody, url: current }, "Location found"));
          return;
        }
        break;
      }
      const nextUrl = new URL(next, current);
      if (!GOOGLE_HOST.test(nextUrl.hostname)) break;
      current = nextUrl.toString();
    }
    throw new AppError(
      "No location found in that link. In Google Maps, open the place, tap Share, and paste that link.",
      400,
    );
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
