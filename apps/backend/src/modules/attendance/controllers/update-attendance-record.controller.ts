import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AttendanceRecord } from "../model/attendance-record.model";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import {
  COUNTED_SESSION_FILTER,
  WorkSession,
} from "../../work-sessions/model/work-session.model";
import { ShiftPolicy } from "../model/shift-policy.model";
import { getBusinessDayBounds } from "../services/shift-schedule.service";
import { resolveShiftVariant } from "../services/resolve-shift-variant.service";
import { getShiftPolicyForDate } from "../services/shift-policy-history.service";
import { invalidateLiveStatsCache } from "../../analytics/controllers/get-live-stats.controller";
import { isSuperAdmin } from "../../../shared/utils/super-admin";
import { notificationService } from "../../../shared/services/notification.service";

const istTime = (value: unknown) =>
  value
    ? new Date(value as string).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "none";
const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  LATE: "Late",
  HALF_DAY: "Half day",
  ABSENT: "Absent",
  HOLIDAY: "Holiday",
  WEEKEND: "Weekly off",
  LEAVE: "Leave",
};

/** "Paid leave" / "Unpaid leave" / "Leave", else the plain status name. */
const statusLabel = (snapshot: any) => {
  const status = snapshot.attendanceStatus;
  if (status === "LEAVE" && snapshot.leavePaid === true) return "Paid leave";
  if (status === "LEAVE" && snapshot.leavePaid === false) return "Unpaid leave";
  return STATUS_LABEL[status] || status || "none";
};

/** Plain lines like "Status: Absent → Present", "Login: 11:10 → 09:40". */
function describeAttendanceChanges(before: any, after: any) {
  const lines: string[] = [];
  if (statusLabel(before) !== statusLabel(after)) {
    lines.push(`Status: ${statusLabel(before)} → ${statusLabel(after)}`);
  }
  if (istTime(before.loginTime) !== istTime(after.loginTime)) {
    lines.push(`Login: ${istTime(before.loginTime)} → ${istTime(after.loginTime)}`);
  }
  if (istTime(before.logoutTime) !== istTime(after.logoutTime)) {
    lines.push(`Logout: ${istTime(before.logoutTime)} → ${istTime(after.logoutTime)}`);
  }
  const minutes: Array<[string, string]> = [
    ["productiveMinutes", "Productive minutes"],
    ["breakMinutes", "Break minutes"],
    ["idleMinutes", "Idle minutes"],
    ["awayWorkingMinutes", "Away-working minutes"],
    ["lateMinutes", "Late minutes"],
    ["overtimeMinutes", "Overtime minutes"],
  ];
  for (const [key, label] of minutes) {
    if (Number(before[key] || 0) !== Number(after[key] || 0)) {
      lines.push(`${label}: ${Math.round(Number(before[key] || 0))} → ${Math.round(Number(after[key] || 0))}`);
    }
  }
  return lines;
}

const MANUAL_STATUS_OVERRIDES = new Set([
  "PRESENT",
  "LATE",
  "HALF_DAY",
  "ABSENT",
  "HOLIDAY",
  "WEEKEND",
  "LEAVE",
]);

const getWeekdayForDate = (date: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  });
  const weekday = formatter.format(new Date(`${date}T12:00:00Z`));
  const dayMap: Record<string, string> = {
    Sun: "SUNDAY",
    Mon: "MONDAY",
    Tue: "TUESDAY",
    Wed: "WEDNESDAY",
    Thu: "THURSDAY",
    Fri: "FRIDAY",
    Sat: "SATURDAY",
  };
  return dayMap[weekday];
};

const timeToMinutes = (timeStr?: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const formatShiftName = (name: string) =>
  name
    ? name
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    : "Shift";

const getLoginMinutesInIndia = (loginAt: Date) => {
  const hour = Number(
    loginAt
      .toLocaleTimeString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
        hour: "2-digit",
      })
      .replace(/\D/g, ""),
  );
  const minute = Number(
    loginAt
      .toLocaleTimeString("en-US", {
        timeZone: "Asia/Kolkata",
        minute: "2-digit",
      })
      .replace(/\D/g, ""),
  );
  return hour * 60 + minute;
};

async function resolveCorrectedAttendanceStatus(record: any) {
  if (!record.loginTime) {
    return {
      attendanceStatus: MANUAL_STATUS_OVERRIDES.has(record.attendanceStatus)
        ? record.attendanceStatus
        : "ABSENT",
      lateMinutes: 0,
      shiftAssigned: record.shiftAssigned || null,
      expectedLogoutTime: record.expectedLogoutTime || null,
    };
  }

  const activeDay = getWeekdayForDate(record.date);
  let shift = await ShiftPolicy.findOne({
    activeDays: { $in: [activeDay as any] },
    isDefault: true,
    isActive: true,
  });
  if (!shift) {
    shift = await ShiftPolicy.findOne({
      activeDays: { $in: [activeDay as any] },
      isActive: true,
    });
  }
  if (shift) {
    shift = getShiftPolicyForDate(
      typeof (shift as any).toObject === "function"
        ? (shift as any).toObject()
        : (shift as any),
      record.date,
    ) as any;
  }
  if (!shift) {
    return {
      attendanceStatus: "PRESENT",
      lateMinutes: 0,
      shiftAssigned: "Manual attendance",
      expectedLogoutTime: null,
    };
  }

  const loginAt = new Date(record.loginTime);
  const shiftResolution = await resolveShiftVariant({
    loginAt,
    shiftPolicyId: shift._id.toString(),
    shiftPolicySnapshot: shift,
  });
  const loginMinutes = getLoginMinutesInIndia(loginAt);
  const halfDayThreshold = timeToMinutes(shift.halfDayAfterTime) || 750;
  const absentThreshold = timeToMinutes(shift.absentAfterTime) || 810;
  const totalWorkedMinutes =
    Number(record.productiveMinutes || 0) +
    Number(record.awayWorkingMinutes || 0);
  // Half-day limit = the shift's minimum work, measured login -> logout.
  // Logging out early is not a half day by itself; only working less than
  // the limit is ("Half Day If Logout Before" is no longer used).
  const requiredWorkMinutes = Number(shift.minimumWorkMinutes || 120);
  const workedSpanMinutes = record.logoutTime
    ? (new Date(record.logoutTime).getTime() - loginAt.getTime()) / 60_000
    : null;

  // The admin vouches for corrected times, so tracked activity does not
  // decide here; only a corrected day shorter than 2 hours is absent.
  void totalWorkedMinutes;
  let attendanceStatus = "PRESENT";
  if (workedSpanMinutes !== null && workedSpanMinutes < 120) {
    attendanceStatus = "ABSENT";
  } else if (loginMinutes >= absentThreshold) {
    attendanceStatus = "ABSENT";
  } else if (
    loginMinutes >= halfDayThreshold ||
    (workedSpanMinutes !== null && workedSpanMinutes < requiredWorkMinutes)
  ) {
    attendanceStatus = "HALF_DAY";
  } else if (shift.shiftType === "HALF_DAY") {
    attendanceStatus = "HALF_DAY";
  } else if (shiftResolution.isLateEntry) {
    attendanceStatus = "LATE";
  }

  let endTimeStr = shiftResolution.workedShiftEnd;
  if (attendanceStatus === "HALF_DAY") {
    const weekday = new Date(record.date).toLocaleDateString("en-US", {
      weekday: "short",
    });
    endTimeStr = weekday === "Sat" ? "17:00" : "18:30";
  }

  const dateStr = loginAt.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const expectedLogoutTime = endTimeStr
    ? new Date(`${dateStr}T${endTimeStr}:00+05:30`)
    : null;

  let shiftAssigned = `${shiftResolution.workedShiftStart} to ${endTimeStr} (${formatShiftName(shiftResolution.resolvedShiftPolicyName)})`;
  if (attendanceStatus === "HALF_DAY") shiftAssigned += " (Half Day)";
  if (attendanceStatus === "LATE") shiftAssigned += " (Late Entry)";

  return {
    attendanceStatus,
    lateMinutes: attendanceStatus === "LATE" ? shiftResolution.lateByMinutes : 0,
    shiftAssigned,
    expectedLogoutTime,
  };
}

/**
 * Applies an admin's corrected login/logout time to the day's work sessions.
 *
 * Sessions that fall entirely outside the corrected day (e.g. a false session
 * opened just after midnight while the PC sat idle) are marked
 * `excludedByAdmin` instead of being stretched into an impossible range such
 * as "09:55 → 00:31". Nothing is deleted; excluded rows keep their original
 * times for audit.
 */
async function alignSessionsWithCorrection(input: {
  employeeId: string;
  date: string;
  loginTime: Date | null | undefined;
  logoutTime: Date | null | undefined;
  correctedBy: string;
  reason: string;
}) {
  if (input.loginTime === undefined && input.logoutTime === undefined) return;

  const bounds = getBusinessDayBounds(input.date);
  const sessions = await WorkSession.find({
    employeeId: input.employeeId,
    ...COUNTED_SESSION_FILTER,
    loginAt: { $gte: bounds.start, $lte: bounds.end },
  }).sort({ loginAt: 1 });
  if (sessions.length === 0) return;

  const exclude = (session: (typeof sessions)[number], why: string) => {
    session.excludedByAdmin = true;
    session.excludedReason = `${why} (${input.reason})`;
    session.excludedBy = input.correctedBy;
    session.excludedAt = new Date();
    if (!session.logoutAt) session.logoutAt = session.loginAt;
    session.status = "COMPLETED";
  };

  let counted = [...sessions];

  if (input.loginTime) {
    const loginMs = new Date(input.loginTime).getTime();
    const endedBeforeLogin = counted.filter(
      (session) =>
        session.logoutAt && new Date(session.logoutAt).getTime() <= loginMs,
    );
    // Keep at least one session so the corrected day still has a timeline.
    const toExclude =
      endedBeforeLogin.length === counted.length
        ? endedBeforeLogin.slice(0, -1)
        : endedBeforeLogin;
    toExclude.forEach((session) =>
      exclude(session, "Ended before the corrected login time"),
    );
    counted = counted.filter((session) => !toExclude.includes(session));

    const first = counted[0];
    first.loginAt = new Date(input.loginTime);
    if (first.logoutAt && new Date(first.logoutAt).getTime() <= loginMs) {
      first.logoutAt =
        input.logoutTime && new Date(input.logoutTime).getTime() > loginMs
          ? new Date(input.logoutTime)
          : null;
      first.status = first.logoutAt ? "COMPLETED" : "ACTIVE";
    }
  }

  if (input.logoutTime !== undefined) {
    if (input.logoutTime) {
      const logoutMs = new Date(input.logoutTime).getTime();
      const startedAfterLogout = counted.filter(
        (session) => new Date(session.loginAt).getTime() >= logoutMs,
      );
      const toExclude =
        startedAfterLogout.length === counted.length
          ? startedAfterLogout.slice(1)
          : startedAfterLogout;
      toExclude.forEach((session) =>
        exclude(session, "Started after the corrected logout time"),
      );
      counted = counted.filter((session) => !toExclude.includes(session));
    }
    const last = counted[counted.length - 1];
    last.logoutAt = input.logoutTime ? new Date(input.logoutTime) : null;
    last.status = input.logoutTime ? "COMPLETED" : "ACTIVE";
  }

  await Promise.all(sessions.map((session) => session.save()));
}

export type AttendanceCorrection = {
  attendanceStatus?: string;
  loginTime?: string | Date | null;
  logoutTime?: string | Date | null;
  productiveMinutes?: number;
  breakMinutes?: number;
  idleMinutes?: number;
  awayWorkingMinutes?: number;
  lateMinutes?: number;
  overtimeMinutes?: number;
};

/**
 * Applies a correction to an attendance record exactly like the admin edit:
 * overrides, status resolution, correction history and work-session
 * alignment. Used by the admin edit endpoint and by approved
 * attendance-change requests.
 */
export async function applyAttendanceCorrection(input: {
  record: any;
  changes: AttendanceCorrection;
  reason: string;
  actor: { employeeId?: string | null; name?: string | null; role?: string | null };
  /** REQUEST = approving the employee's own request; ADMIN = admin's own change. */
  source?: "ADMIN" | "REQUEST";
  requestId?: string | null;
}) {
  const { record, reason, actor } = input;
  const source = input.source || "ADMIN";
  // "Paid leave" / "Unpaid leave" are a Leave day plus whether it is paid.
  const changesIn: any = { ...input.changes };
  let leavePaidChange: boolean | undefined;
  if (changesIn.attendanceStatus === "PAID_LEAVE" || changesIn.attendanceStatus === "UNPAID_LEAVE") {
    leavePaidChange = changesIn.attendanceStatus === "PAID_LEAVE";
    changesIn.attendanceStatus = "LEAVE";
  }
  const {
    attendanceStatus,
    loginTime,
    logoutTime,
    productiveMinutes,
    breakMinutes,
    idleMinutes,
    awayWorkingMinutes,
    lateMinutes,
    overtimeMinutes,
  } = changesIn as AttendanceCorrection;

    const beforeCorrection = {
      attendanceStatus: record.attendanceStatus,
      leavePaid: (record as any).leavePaid ?? null,
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      productiveMinutes: record.productiveMinutes,
      breakMinutes: record.breakMinutes,
      idleMinutes: record.idleMinutes,
      awayWorkingMinutes: record.awayWorkingMinutes,
      lateMinutes: record.lateMinutes,
      overtimeMinutes: record.overtimeMinutes,
      totalWorkedMinutes: record.totalWorkedMinutes,
    };

    if (
      attendanceStatus !== undefined &&
      MANUAL_STATUS_OVERRIDES.has(String(attendanceStatus))
    ) {
      record.attendanceStatus = attendanceStatus;
      if (String(attendanceStatus) !== "LATE") record.lateMinutes = 0;
      // Set by hand: automatic recalculation keeps it.
      (record as any).attendanceStatusOverridden = true;
      // Leave is paid or unpaid; any other status clears it.
      (record as any).leavePaid =
        String(attendanceStatus) === "LEAVE"
          ? leavePaidChange ?? (record as any).leavePaid ?? null
          : null;
    }
    if (loginTime !== undefined) {
      record.loginTime = loginTime ? new Date(loginTime) : null;
      record.loginTimeOverridden = true;
    }
    if (logoutTime !== undefined) {
      record.logoutTime = logoutTime ? new Date(logoutTime) : null;
      record.logoutTimeOverridden = true;
    }
    if (productiveMinutes !== undefined)
      record.productiveMinutes = Number(productiveMinutes);
    if (breakMinutes !== undefined) record.breakMinutes = Number(breakMinutes);
    if (idleMinutes !== undefined) record.idleMinutes = Number(idleMinutes);
    if (awayWorkingMinutes !== undefined)
      record.awayWorkingMinutes = Number(awayWorkingMinutes);
    if (lateMinutes !== undefined) record.lateMinutes = Number(lateMinutes);
    if (overtimeMinutes !== undefined)
      record.overtimeMinutes = Number(overtimeMinutes);

    // "AUTO" hands the status back to the automatic calculation.
    if (String(attendanceStatus) === "AUTO") {
      (record as any).attendanceStatusOverridden = false;
    }
    const hasManualStatusOverride =
      attendanceStatus !== undefined &&
      MANUAL_STATUS_OVERRIDES.has(String(attendanceStatus));
    // A status set by hand earlier stays when only times/minutes change.
    const keepsEarlierManualStatus =
      Boolean((record as any).attendanceStatusOverridden) &&
      String(attendanceStatus) !== "AUTO";
    const shouldAutoResolveStatus =
      !hasManualStatusOverride && !keepsEarlierManualStatus;
    if (shouldAutoResolveStatus) {
      const resolved = await resolveCorrectedAttendanceStatus(record);
      record.attendanceStatus = resolved.attendanceStatus;
      record.lateMinutes = resolved.lateMinutes;
      record.shiftAssigned = resolved.shiftAssigned;
      record.expectedLogoutTime = resolved.expectedLogoutTime;
    }

    if (productiveMinutes !== undefined || awayWorkingMinutes !== undefined) {
      record.totalWorkedMinutes = Number(
        (
          Number(record.productiveMinutes || 0) +
          Number(record.awayWorkingMinutes || 0)
        ).toFixed(2),
      );
    }
    record.lastModifiedBy = actor.employeeId || null;

    if (record.attendanceStatus !== "LEAVE") (record as any).leavePaid = null;
    const afterCorrection = {
      attendanceStatus: record.attendanceStatus,
      leavePaid: (record as any).leavePaid ?? null,
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      productiveMinutes: record.productiveMinutes,
      breakMinutes: record.breakMinutes,
      idleMinutes: record.idleMinutes,
      awayWorkingMinutes: record.awayWorkingMinutes,
      lateMinutes: record.lateMinutes,
      overtimeMinutes: record.overtimeMinutes,
      totalWorkedMinutes: record.totalWorkedMinutes,
    };

    const changeLines = describeAttendanceChanges(beforeCorrection, afterCorrection);
    // Super Admin (developer) corrections are not logged.
    if (!isSuperAdmin(actor.role) && changeLines.length) {
      (record as any).correctionHistory = [
        ...((record as any).correctionHistory || []),
        {
          correctedAt: new Date(),
          correctedBy: actor.employeeId || "",
          correctedByName: actor.name || "",
          correctedByRole: actor.role || "",
          source,
          requestId: input.requestId || null,
          reason,
          changes: changeLines,
          before: beforeCorrection,
          after: afterCorrection,
          // The employee asked for a requested change; admin changes need a look.
          seenAt: source === "REQUEST" ? new Date() : null,
        },
      ];
      if (source === "ADMIN") {
        notificationService.broadcastToUser(record.employeeId, "attendance_changed", {
          date: record.date,
          changes: changeLines,
          reason,
          byName: actor.name || "Admin",
        });
      }
    }

    // Self-healing for corrupted/legacy records missing employeeName
    if (!record.employeeName && record.employeeId) {
      const user = await User.findOne({ employeeId: record.employeeId });
      if (user) {
        record.employeeName = user.name;
      } else {
        // Fallback if user is somehow deleted
        record.employeeName = "Unknown Employee";
      }
    }

    await record.save();

    // Keep the underlying work-session timeline consistent so every screen
    // and later attendance regeneration sees the administrator's correction.
    await alignSessionsWithCorrection({
      employeeId: record.employeeId,
      date: record.date,
      loginTime: loginTime !== undefined ? record.loginTime : undefined,
      logoutTime: logoutTime !== undefined ? record.logoutTime : undefined,
      correctedBy: actor.employeeId || "SUPER_ADMIN",
      reason,
    });
    invalidateLiveStatsCache(record.employeeId);

  return record;
}

export const updateAttendanceRecordController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { correctionReason, ...changes } = req.body;

    const role = String(req.user?.role || "");
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
      res.status(403).json(errorResponse("Only admins can edit attendance."));
      return;
    }
    // Every admin change is logged for the day and shown to the employee.
    if (role !== "SUPER_ADMIN" && String(correctionReason || "").trim().length < 3) {
      res
        .status(400)
        .json(errorResponse("Reason is required: say why this attendance is being changed."));
      return;
    }
    const reason =
      String(correctionReason || "").trim() || "Attendance corrected by admin";

    // "day:<employeeId>:<YYYY-MM-DD>" edits a past day that has no record
    // yet (shown as Absent); the record is created first.
    let record: any = null;
    const dayKey = String(id).match(/^day:(.+):(\d{4}-\d{2}-\d{2})$/);
    if (dayKey) {
      const [, employeeId, date] = dayKey;
      record = await AttendanceRecord.findOne({ employeeId, date });
      if (!record) {
        const employee: any = await User.findOne({ employeeId }).select("name").lean();
        if (!employee) {
          res.status(404).json(errorResponse("Employee not found"));
          return;
        }
        record = await AttendanceRecord.create({
          employeeId,
          employeeName: employee.name,
          date,
          attendanceStatus: "ABSENT",
        } as any);
      }
    } else {
      record = await AttendanceRecord.findById(id);
    }

    if (!record) {
      res.status(404).json(errorResponse("Attendance record not found"));
      return;
    }

    await applyAttendanceCorrection({
      record,
      changes,
      reason,
      actor: { employeeId: req.user?.employeeId, name: req.user?.name, role: req.user?.role },
      source: "ADMIN",
    });

    res
      .status(200)
      .json(successResponse(record, "Attendance record updated successfully"));
  },
);
