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

const getTimeMinutesInIndia = (date: Date) => {
  const hour = Number(
    date
      .toLocaleTimeString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
        hour: "2-digit",
      })
      .replace(/\D/g, ""),
  );
  const minute = Number(
    date
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
  const earlyLogoutHalfDayThreshold =
    timeToMinutes((shift as any).halfDayLogoutBeforeTime) || 900;
  const logoutMinutes = record.logoutTime
    ? getTimeMinutesInIndia(new Date(record.logoutTime))
    : null;
  const totalWorkedMinutes =
    Number(record.productiveMinutes || 0) +
    Number(record.awayWorkingMinutes || 0);
  const requiredWorkMinutes = Number(shift.minimumWorkMinutes || 120);

  let attendanceStatus = "PRESENT";
  if (totalWorkedMinutes > 0 && totalWorkedMinutes < 120) {
    attendanceStatus = "ABSENT";
  } else if (loginMinutes >= absentThreshold) {
    attendanceStatus = "ABSENT";
  } else if (
    loginMinutes >= halfDayThreshold ||
    (logoutMinutes !== null &&
      logoutMinutes < earlyLogoutHalfDayThreshold &&
      totalWorkedMinutes >= 120) ||
    (totalWorkedMinutes > 0 && totalWorkedMinutes < requiredWorkMinutes)
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

export const updateAttendanceRecordController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
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
      correctionReason,
    } = req.body;

    if (!["SUPER_ADMIN", "ADMIN"].includes(String(req.user?.role || ""))) {
      res
        .status(403)
        .json(errorResponse("Only Admins can edit attendance records"));
      return;
    }
    const reason =
      String(correctionReason || "").trim() || "Attendance corrected by admin";

    const record = await AttendanceRecord.findById(id);

    if (!record) {
      res.status(404).json(errorResponse("Attendance record not found"));
      return;
    }

    const beforeCorrection = {
      attendanceStatus: record.attendanceStatus,
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

    const hasManualStatusOverride =
      attendanceStatus !== undefined &&
      MANUAL_STATUS_OVERRIDES.has(String(attendanceStatus));
    const shouldAutoResolveStatus = !hasManualStatusOverride;
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
    record.lastModifiedBy = req.user?.employeeId || null;

    const afterCorrection = {
      attendanceStatus: record.attendanceStatus,
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

    (record as any).correctionHistory = [
      ...((record as any).correctionHistory || []),
      {
        correctedAt: new Date(),
        correctedBy: req.user?.employeeId || "SUPER_ADMIN",
        correctedByName: req.user?.name || "",
        reason,
        before: beforeCorrection,
        after: afterCorrection,
      },
    ];

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
      correctedBy: req.user?.employeeId || "SUPER_ADMIN",
      reason,
    });
    invalidateLiveStatsCache(record.employeeId);

    res
      .status(200)
      .json(successResponse(record, "Attendance record updated successfully"));
  },
);
