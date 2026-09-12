import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { AttendanceRecord } from "../model/attendance-record.model";
import { resolveShiftVariant } from "./resolve-shift-variant.service";
import { aggregateWorkHours } from "./aggregate-work-hours.service";
import { ShiftPolicy } from "../model/shift-policy.model";
import { checkDayOffStatus } from "./check-day-off.service";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import {
  getBusinessDate,
  getBusinessDayBounds,
} from "./shift-schedule.service";
import { getShiftPolicyForDate } from "./shift-policy-history.service";

// These events describe agent/process state, not proof that the employee used
// the computer. They must never create attendance or worked time by themselves.
const PASSIVE_EVENT_TYPES = new Set([
  "SESSION_START",
  "SESSION_END",
  "HEARTBEAT",
  "SYSTEM_SLEEP",
  "SYSTEM_WAKE",
  "AUTO_SESSION_CLOSE",
  "AGENT_ONLINE",
  "AGENT_OFFLINE",
  "AGENT_ERROR",
]);

const REAL_ACTIVITY_EVENT_TYPES = new Set([
  "USER_ACTIVITY",
  "ACTIVE_WINDOW",
  "LOGIN",
  "IDLE_END",
  "AWAY_WORK_END",
]);

function isMacEvent(event: any) {
  const platform = String(event?.metadata?.platform || "").toLowerCase();
  const os = String(event?.metadata?.os || "").toLowerCase();
  return (
    platform === "darwin" ||
    platform.includes("mac") ||
    os.includes("mac") ||
    os.includes("darwin")
  );
}

function isReliableLoginPresenceEvent(event: any) {
  if (!event) return false;
  if (event.type === "USER_ACTIVITY" || event.type === "LOGIN") return true;
  if (event.type === "ACTIVE_WINDOW") return !isMacEvent(event);
  return event.type === "IDLE_END" || event.type === "AWAY_WORK_END";
}

const INACTIVITY_AUTO_LOGOUT_MINUTES = 120;

function cleanSessionList(
  sessions: Array<{ loginAt: Date; logoutAt?: Date | null }>,
) {
  const cleaned: Array<{ loginAt: Date; logoutAt: Date | null }> = [];
  for (const session of sessions) {
    const loginAt = new Date(session.loginAt);
    const logoutAt = session.logoutAt ? new Date(session.logoutAt) : null;
    const previous = cleaned[cleaned.length - 1];
    if (previous) {
      const previousLogout = previous.logoutAt?.getTime();
      const loginMs = loginAt.getTime();
      if (previousLogout && loginMs <= previousLogout + 2 * 60 * 1000) {
        if (logoutAt && (!previous.logoutAt || logoutAt > previous.logoutAt)) {
          previous.logoutAt = logoutAt;
        }
        continue;
      }
      if (!logoutAt && previousLogout && Math.abs(loginMs - previousLogout) <= 2 * 60 * 1000) {
        continue;
      }
    }
    cleaned.push({ loginAt, logoutAt });
  }
  return cleaned;
}

function getLatestRealActivityEvent(events: any[]) {
  return [...events]
    .reverse()
    .find((event) => REAL_ACTIVITY_EVENT_TYPES.has(event.type));
}

async function closeInactiveSessionIfNeeded(input: {
  employeeId: string;
  date: string;
  latestRealActivityAt: Date | null;
  businessDayStart: Date;
  businessDayEnd: Date;
}) {
  const { employeeId, date, latestRealActivityAt, businessDayStart, businessDayEnd } =
    input;
  const isToday = date === getBusinessDate();

  if (!latestRealActivityAt) return null;

  const inactiveMinutes =
    (Date.now() - latestRealActivityAt.getTime()) / 60000;
  const shouldAutoClose =
    !isToday || inactiveMinutes >= INACTIVITY_AUTO_LOGOUT_MINUTES;

  if (!shouldAutoClose) return null;

  const activeSession = await WorkSession.findOne({
    employeeId,
    logoutAt: null,
    status: "ACTIVE",
    loginAt: { $gte: businessDayStart, $lte: businessDayEnd },
  }).sort({ loginAt: -1 });

  if (!activeSession) return latestRealActivityAt;

  if (latestRealActivityAt >= activeSession.loginAt) {
    activeSession.logoutAt = latestRealActivityAt;
    activeSession.status = "COMPLETED";
    activeSession.autoClosed = true;
    await activeSession.save();
  }

  return latestRealActivityAt;
}

type ComputeAttendanceInput = {
  employeeId: string;
  date: string;
  shiftPolicyId: string;
};

export async function computeAttendanceFromEvents(
  input: ComputeAttendanceInput,
) {
  const businessDayBounds = getBusinessDayBounds(input.date);
  const existingRecord = await AttendanceRecord.findOne({
    employeeId: input.employeeId,
    date: input.date,
  }).lean();
  // 1. Fetch the Assigned Shift Policy for the given date using Dual-Layer hybrid logic
  const inputDateObj = new Date(`${input.date}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  });
  const weekday = formatter.format(inputDateObj);
  const dayMap: Record<string, string> = {
    Sun: "SUNDAY",
    Mon: "MONDAY",
    Tue: "TUESDAY",
    Wed: "WEDNESDAY",
    Thu: "THURSDAY",
    Fri: "FRIDAY",
    Sat: "SATURDAY",
  };
  const activeDay = dayMap[weekday];

  let shift = null;
  if (input.shiftPolicyId) {
    shift = await ShiftPolicy.findOne({
      _id: input.shiftPolicyId,
      activeDays: { $in: [activeDay as any] },
      isActive: true,
    });
  }

  if (!shift) {
    shift = await ShiftPolicy.findOne({
      activeDays: { $in: [activeDay as any] },
      isDefault: true,
      isActive: true,
    });
  }

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
      input.date,
    ) as any;
  }

  const dayOffStatus = await checkDayOffStatus(
    input.employeeId,
    input.date,
    shift ? shift.activeDays : [],
  );

  // 2. Fetch raw events using actual timestamp
  const rawEvents = await ActivityEvent.find({
    employeeId: input.employeeId,
    invalidated: { $ne: true },
    timestamp: {
      $gte: businessDayBounds.start,
      $lte: businessDayBounds.end,
    },
  }).sort({ timestamp: 1 });

  const events = rawEvents.filter(
    (event) => !PASSIVE_EVENT_TYPES.has(event.type),
  );

  // Prefer direct OS input proof. ACTIVE_WINDOW is the automatic fallback for
  // older agents or platforms where the unlock signal was unavailable.
  const firstInputEvent = events.find(
    (event) => event.type === "USER_ACTIVITY",
  );
  const firstWindowEvent = events.find(
    (event) => event.type === "ACTIVE_WINDOW",
  );
  const firstReliableWindowEvent =
    firstWindowEvent && !isMacEvent(firstWindowEvent)
      ? firstWindowEvent
      : null;
  const windowIsCloseToInput =
    firstInputEvent &&
    firstReliableWindowEvent &&
    Math.abs(
      new Date(firstInputEvent.timestamp).getTime() -
        new Date(firstReliableWindowEvent.timestamp).getTime(),
    ) <=
      2 * 60 * 1000;
  const presenceEvent =
    (firstInputEvent && isReliableLoginPresenceEvent(firstInputEvent)
      ? firstInputEvent
      : null) ||
    events.find((event) => event.type === "LOGIN") ||
    (windowIsCloseToInput ? firstReliableWindowEvent : null) ||
    firstReliableWindowEvent ||
    events.find(
      (event) => event.type === "IDLE_END" || event.type === "AWAY_WORK_END",
    );

  // 3. The Interceptor: Determine if zero events is actually a violation
  if (!presenceEvent) {
    if (
      input.date === getBusinessDate() &&
      existingRecord?.loginTime &&
      ["PRESENT", "LATE", "HALF_DAY"].includes(
        String(existingRecord.attendanceStatus),
      )
    ) {
      return AttendanceRecord.findOne({
        employeeId: input.employeeId,
        date: input.date,
      });
    }
    // If dayOffStatus returns a value, use it. Otherwise, they missed a work day (ABSENT).
    const finalStatus = dayOffStatus ? dayOffStatus.status : "ABSENT";

    const formatName = (name: string) =>
      name
        ? name
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ")
        : "Weekend Off";

    return AttendanceRecord.findOneAndUpdate(
      { employeeId: input.employeeId, date: input.date },
      {
        attendanceStatus: finalStatus,
        totalWorkedMinutes: 0,
        requiredWorkMinutes: dayOffStatus
          ? 0
          : Number(shift?.minimumWorkMinutes || 480),
        shiftAssigned:
          dayOffStatus?.status === "HOLIDAY"
            ? dayOffStatus.label
            : dayOffStatus?.status === "LEAVE"
              ? dayOffStatus.label
              : dayOffStatus?.status === "WEEKEND"
                ? dayOffStatus.label
                : shift
                  ? formatName(shift.name)
                  : "Weekend Off",
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  // Handle the case where they worked on an off-day (no shift policy found for today)
  if (!shift || dayOffStatus?.status === "HOLIDAY") {
    const timeData = aggregateWorkHours({ events });
    const latestRealActivityEvent = getLatestRealActivityEvent(events);
    const inferredLogoutAt = await closeInactiveSessionIfNeeded({
      employeeId: input.employeeId,
      date: input.date,
      latestRealActivityAt: latestRealActivityEvent
        ? new Date(latestRealActivityEvent.timestamp)
        : null,
      businessDayStart: businessDayBounds.start,
      businessDayEnd: businessDayBounds.end,
    });

    let attendanceStatus = "PRESENT";
    const isActiveSession =
      input.date === getBusinessDate() &&
      latestRealActivityEvent &&
      Date.now() - new Date(latestRealActivityEvent.timestamp).getTime() <
        INACTIVITY_AUTO_LOGOUT_MINUTES * 60 * 1000;

    if (
      dayOffStatus?.status !== "HOLIDAY" &&
      !isActiveSession &&
      timeData.totalWorkedMinutes < 120
    ) {
      attendanceStatus = "ABSENT";
    }

    return AttendanceRecord.findOneAndUpdate(
      { employeeId: input.employeeId, date: input.date },
      {
        attendanceStatus: attendanceStatus,
        shiftAssigned:
          dayOffStatus?.status === "HOLIDAY"
            ? `${dayOffStatus.label} Work`
            : "Weekend Work",
        loginTime: presenceEvent.timestamp,
        logoutTime:
          inferredLogoutAt ||
          (isActiveSession ? null : latestRealActivityEvent?.timestamp),
        totalWorkedMinutes: timeData.totalWorkedMinutes,
        requiredWorkMinutes: 0,
        productiveMinutes: timeData.productiveMinutes,
        breakMinutes: timeData.breakMinutes,
        idleMinutes: timeData.idleMinutes,
        awayWorkingMinutes: timeData.awayWorkingMinutes,
        lateMinutes: 0,
        expectedLogoutTime: null,
        overtimeMinutes: timeData.productiveMinutes,
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  const logoutEvent = [...events].reverse().find((e) => e.type === "LOGOUT");
  const latestRealActivityEvent = getLatestRealActivityEvent(events);
  const latestRealActivityAt = latestRealActivityEvent
    ? new Date(latestRealActivityEvent.timestamp)
    : null;

  const inferredLogoutAt =
    !existingRecord?.logoutTimeOverridden && !logoutEvent
      ? await closeInactiveSessionIfNeeded({
          employeeId: input.employeeId,
          date: input.date,
          latestRealActivityAt,
          businessDayStart: businessDayBounds.start,
          businessDayEnd: businessDayBounds.end,
        })
      : null;

  // 4. Resilient Login Detection
  const sessions = await WorkSession.find({
    employeeId: input.employeeId,
    loginAt: {
      $gte: businessDayBounds.start,
      $lte: businessDayBounds.end,
    },
  })
    .sort({ loginAt: 1 })
    .lean();

  const sessionList = cleanSessionList(sessions);

  const loginAt =
    existingRecord?.loginTimeOverridden && existingRecord.loginTime
      ? new Date(existingRecord.loginTime)
      : new Date(presenceEvent.timestamp);

  let logoutAt = logoutEvent ? logoutEvent.timestamp : null;

  if (existingRecord?.logoutTimeOverridden) {
    logoutAt = existingRecord.logoutTime || null;
  }

  if (
    !existingRecord?.logoutTimeOverridden &&
    sessionList.length > 0 &&
    sessionList[sessionList.length - 1].logoutAt
  ) {
    if (
      !logoutAt ||
      new Date(sessionList[sessionList.length - 1].logoutAt!) >
        new Date(logoutAt)
    ) {
      logoutAt = sessionList[sessionList.length - 1].logoutAt!;
    }
  }

  if (inferredLogoutAt) {
    const currentLogoutAt = logoutAt ? new Date(logoutAt) : null;
    const looksStaleOrSynthetic =
      !currentLogoutAt ||
      currentLogoutAt.getTime() - inferredLogoutAt.getTime() >=
        INACTIVITY_AUTO_LOGOUT_MINUTES * 60 * 1000;

    if (looksStaleOrSynthetic) {
      logoutAt = inferredLogoutAt;
    }
  }

  // 5. Resolve Lateness via Admin Policy
  const shiftResolution = await resolveShiftVariant({
    loginAt,
    shiftPolicyId: shift._id.toString(),
    shiftPolicySnapshot: shift,
  });

  // 6. Aggregate Work Hours
  const timeData = aggregateWorkHours({ events });

  // 7. Half-Day Logic
  // Convert loginAt to Asia/Kolkata timezone to avoid UTC hour mismatches
  const options = { timeZone: "Asia/Kolkata", hour12: false };
  const loginHourStr = loginAt.toLocaleTimeString("en-US", {
    ...options,
    hour: "2-digit",
  });
  const loginMinStr = loginAt.toLocaleTimeString("en-US", {
    ...options,
    minute: "2-digit",
  });

  // Clean up any potential AM/PM artifacts from older environments just in case
  const loginHour = parseInt(loginHourStr.replace(/\D/g, ""), 10);
  const loginMinute = parseInt(loginMinStr.replace(/\D/g, ""), 10);
  const loginTimeInMinutes = loginHour * 60 + loginMinute;

  // Read thresholds from shift policy, with fallbacks to defaults (12:30 PM - 1:30 PM)
  const timeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const halfDayThreshold = shift.halfDayAfterTime
    ? timeToMinutes(shift.halfDayAfterTime)
    : 750;
  const absentThreshold = shift.absentAfterTime
    ? timeToMinutes(shift.absentAfterTime)
    : 810;
  const earlyLogoutHalfDayThreshold = (shift as any).halfDayLogoutBeforeTime
    ? timeToMinutes((shift as any).halfDayLogoutBeforeTime)
    : 900;

  const isHalfDayArrival =
    loginTimeInMinutes >= halfDayThreshold &&
    loginTimeInMinutes < absentThreshold;
  const isAbsentArrival = loginTimeInMinutes >= absentThreshold;

  // Recent real input/window evidence is authoritative. Do not require a
  // separate WorkSession row to remain open: that bookkeeping can be delayed
  // or closed independently even while the employee is actively using the PC.
  const latestEvidence = latestRealActivityEvent;
  const isActiveSession =
    input.date === getBusinessDate() &&
    latestEvidence &&
    Date.now() - new Date(latestEvidence.timestamp).getTime() <
      INACTIVITY_AUTO_LOGOUT_MINUTES * 60 * 1000;

  if (!logoutAt && !isActiveSession && latestEvidence) {
    logoutAt = latestEvidence.timestamp;
  }

  const logoutAtDate = logoutAt ? new Date(logoutAt) : null;
  const logoutHourStr = logoutAtDate
    ? logoutAtDate.toLocaleTimeString("en-US", {
        ...options,
        hour: "2-digit",
      })
    : "";
  const logoutMinStr = logoutAtDate
    ? logoutAtDate.toLocaleTimeString("en-US", {
        ...options,
        minute: "2-digit",
      })
    : "";
  const logoutTimeInMinutes = logoutAtDate
    ? parseInt(logoutHourStr.replace(/\D/g, ""), 10) * 60 +
      parseInt(logoutMinStr.replace(/\D/g, ""), 10)
    : null;
  const requiredWorkMinutes = Number(shift.minimumWorkMinutes || 120);
  const isFinalizedDay = input.date !== getBusinessDate() || !!logoutAtDate;
  const workedBelowFullDayRequirement =
    isFinalizedDay && timeData.totalWorkedMinutes < requiredWorkMinutes;
  const isEarlyLogoutHalfDay =
    isFinalizedDay &&
    logoutTimeInMinutes !== null &&
    logoutTimeInMinutes < earlyLogoutHalfDayThreshold &&
    timeData.totalWorkedMinutes >= 120;

  let attendanceStatus = "PRESENT";
  if (!isActiveSession && timeData.totalWorkedMinutes < 120) {
    attendanceStatus = "ABSENT";
  } else if (isAbsentArrival) {
    // Genuine live keyboard/mouse/window evidence proves attendance even when
    // the employee arrived beyond the normal full-day threshold.
    attendanceStatus = isActiveSession ? "HALF_DAY" : "ABSENT";
  } else if (
    shift.shiftType === "HALF_DAY" ||
    isHalfDayArrival ||
    isEarlyLogoutHalfDay ||
    workedBelowFullDayRequirement
  ) {
    attendanceStatus = "HALF_DAY";
  } else if (shiftResolution.isLateEntry) {
    attendanceStatus = "LATE";
  }

  // Format Exact Shift String to match Desktop Agent
  let startTimeStr = shiftResolution.workedShiftStart;
  let endTimeStr = shiftResolution.workedShiftEnd;

  let expectedLogoutTime = null;
  if (endTimeStr && loginAt) {
    const dateStr = new Date(loginAt).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    expectedLogoutTime = new Date(`${dateStr}T${endTimeStr}:00+05:30`);
  } else if (shift.minimumWorkMinutes && loginAt) {
    expectedLogoutTime = new Date(
      loginAt.getTime() + shift.minimumWorkMinutes * 60000,
    );
  }

  const formatName = (name: string) =>
    name
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

  let exactShiftString = `${startTimeStr} to ${endTimeStr} (${formatName(shiftResolution.resolvedShiftPolicyName)})`;
  if (attendanceStatus === "HALF_DAY") {
    exactShiftString += " (Half Day)";
  } else if (attendanceStatus === "LATE") {
    exactShiftString += " (Late Entry)";
  }

  // 8. Finalize Logout and OT Logic
  let finalLogoutTime = logoutAt;
  let finalOvertimeMinutes = 0;

  if (finalLogoutTime && shift.overtimeEnabled) {
    const configuredGraceMinutes = Number(shift.overtimeAfterMinutes || 0);
    const overtimeGraceMinutes =
      configuredGraceMinutes >= 240 ? 0 : Math.max(0, configuredGraceMinutes);
    const overtimeStartsAt = expectedLogoutTime
      ? new Date(
          expectedLogoutTime.getTime() +
            overtimeGraceMinutes * 60000,
        )
      : null;
    if (overtimeStartsAt && finalLogoutTime > overtimeStartsAt) {
      finalOvertimeMinutes = Math.floor(
        (finalLogoutTime.getTime() - overtimeStartsAt.getTime()) / 60000,
      );
    }
  } else {
    finalOvertimeMinutes = 0;
  }

  // 9. Write the Record
  return AttendanceRecord.findOneAndUpdate(
    { employeeId: input.employeeId, date: input.date },
    {
      attendanceStatus: attendanceStatus,
      shiftAssigned: exactShiftString,
      loginTime: loginAt,
      logoutTime: finalLogoutTime,
      totalWorkedMinutes: timeData.totalWorkedMinutes,
      requiredWorkMinutes,
      productiveMinutes: timeData.productiveMinutes,
      breakMinutes: timeData.breakMinutes,
      idleMinutes: timeData.idleMinutes,
      awayWorkingMinutes: timeData.awayWorkingMinutes,
      lateMinutes: shiftResolution.lateByMinutes,
      expectedLogoutTime: expectedLogoutTime,
      overtimeMinutes: finalOvertimeMinutes,
      sessions: sessionList,
      loginTimeOverridden: existingRecord?.loginTimeOverridden || false,
      logoutTimeOverridden: existingRecord?.logoutTimeOverridden || false,
    },
    { upsert: true, returnDocument: "after" },
  ).then((doc) => {
    // Return doc for the frontend
    return doc?.toObject();
  });
}
