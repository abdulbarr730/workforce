import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { AttendanceRecord } from "../model/attendance-record.model";
import { resolveShiftVariant } from "./resolve-shift-variant.service";
import { aggregateWorkHours } from "./aggregate-work-hours.service";
import { ShiftPolicy } from "../model/shift-policy.model";
import {
  approvedHalfDayLeaveFor,
  checkDayOffStatus,
} from "./check-day-off.service";
import {
  COUNTED_SESSION_FILTER,
  WorkSession,
} from "../../work-sessions/model/work-session.model";
import {
  getBusinessDate,
  getBusinessDayBounds,
} from "./shift-schedule.service";
import { getShiftPolicyForDate } from "./shift-policy-history.service";
import { markGateFor } from "./mark-gate.service";
import { announceDailyLoginOnce } from "../../notifications/services/login-notification.service";
import {
  agentSendsInputProof,
  windowEventProvesPresence,
} from "../../tracking/services/presence-proof.service";

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
    // A session that "ends" before it starts is corrupt (e.g. a login time
    // corrected onto a finished midnight session); it covers no time.
    if (logoutAt && logoutAt.getTime() < loginAt.getTime()) continue;
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

const INPUT_NEIGHBOUR_WINDOW_MS = 10 * 60 * 1000;

const windowKey = (event: any) =>
  `${event.metadata?.app || ""}|${event.metadata?.title || ""}`;

/**
 * ACTIVE_WINDOW events where the foreground window changed. An untouched PC
 * keeps re-reporting the same window (5-minute flush) and a sleeping Mac
 * reports none, so a switch is evidence of a person at the machine.
 */
function windowSwitchEvents(events: any[]) {
  const switches = new Set<any>();
  let previous: string | null = null;
  for (const event of events) {
    if (event.type !== "ACTIVE_WINDOW") continue;
    const key = windowKey(event);
    if (previous !== null && key !== previous) switches.add(event);
    previous = key;
  }
  return switches;
}

function hasNeighbouringInput(
  event: any,
  events: any[],
  switches: Set<any> = new Set(),
) {
  const at = new Date(event.timestamp).getTime();
  return events.some((other) => {
    if (other === event) return false;
    const isInput = other.type === "USER_ACTIVITY" || other.type === "LOGIN";
    if (!isInput && !switches.has(other)) return false;
    const gap = Math.abs(new Date(other.timestamp).getTime() - at);
    return gap >= 30_000 && gap <= INPUT_NEIGHBOUR_WINDOW_MS;
  });
}

function getLatestRealActivityEvent(events: any[], inputProofCapable: boolean) {
  // For agents that send USER_ACTIVITY, an ACTIVE_WINDOW flush from an idle,
  // unlocked PC is not activity and must not push the logout time later.
  return [...events]
    .reverse()
    .find(
      (event) =>
        REAL_ACTIVITY_EVENT_TYPES.has(event.type) &&
        !(inputProofCapable && event.type === "ACTIVE_WINDOW"),
    );
}

// Logout times are only inferred from inactivity from 8 PM IST (or for
// past days). A real logout or an admin-set time counts at any hour.
const LOGOUT_CAPTURE_FROM_MINUTES = 20 * 60;
// A finished day's logout may not be later than the last real activity plus
// this grace (breaks of 1–1.5h must not look like the end of the day).
const LOGOUT_GRACE_MS = 2 * 60 * 60 * 1000;

function isBeforeLogoutCapture(date: string) {
  return (
    date === getBusinessDate() &&
    getIndiaMinutes(new Date()) < LOGOUT_CAPTURE_FROM_MINUTES
  );
}

function getIndiaMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || 0,
  );
  return hour * 60 + minute;
}

function isSuspiciousMidnightLogout(input: {
  date: string;
  loginAt: Date;
  logoutAt: Date | null;
}) {
  if (!input.logoutAt) return false;
  if (input.logoutAt <= input.loginAt) return true;
  const logoutBusinessDate = getBusinessDate(input.logoutAt);
  if (logoutBusinessDate !== input.date) return false;
  const logoutMinutes = getIndiaMinutes(input.logoutAt);
  const loginMinutes = getIndiaMinutes(input.loginAt);
  return logoutMinutes <= 150 && loginMinutes >= 6 * 60;
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
  // Before 8 PM IST today's day stays open: people go on 1–1.5h breaks,
  // so inactivity alone never closes the session before then.
  const shouldAutoClose =
    !isToday ||
    (inactiveMinutes >= INACTIVITY_AUTO_LOGOUT_MINUTES &&
      !isBeforeLogoutCapture(date));

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

/**
 * Recalculates a day from telemetry. A status an admin set by hand
 * (attendanceStatusOverridden) is kept: minutes and times still update, the
 * status does not.
 */
export async function computeAttendanceFromEvents(
  input: ComputeAttendanceInput,
) {
  const manual = await AttendanceRecord.findOne({
    employeeId: input.employeeId,
    date: input.date,
    attendanceStatusOverridden: true,
  })
    .select("attendanceStatus lateMinutes")
    .lean();
  const result: any = await computeAttendanceFromTelemetry(input);
  if (!manual) return result;
  const current = result?.attendanceStatus ?? null;
  if (current === manual.attendanceStatus) return result;
  const restored = await AttendanceRecord.findOneAndUpdate(
    { employeeId: input.employeeId, date: input.date },
    {
      $set: {
        attendanceStatus: manual.attendanceStatus,
        ...(manual.attendanceStatus === "LATE" ? {} : { lateMinutes: 0 }),
      },
    },
    { returnDocument: "after" },
  );
  return typeof result?.toObject === "function" || !restored
    ? restored
    : restored.toObject();
}

async function computeAttendanceFromTelemetry(
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

  // A single USER_ACTIVITY with no other input for 10 minutes either side is a
  // blip (e.g. a Mac briefly waking at night), not the employee arriving or
  // leaving. The agent sends USER_ACTIVITY at most once a minute while someone
  // is really using the machine, so genuine use always has a neighbour.
  const switches = windowSwitchEvents(events);
  const presenceEvents = events.filter(
    (event) =>
      event.type !== "USER_ACTIVITY" ||
      hasNeighbouringInput(event, events, switches),
  );

  // The day's login is not decided by the small hours: activity after midnight
  // is the laptop left on or yesterday's work running late, not arriving.
  // Login is looked for from max(05:00, shift start - 4h) IST; only a day with
  // no activity at all after that uses the earlier events.
  const [shiftStartH, shiftStartM] = String(shift?.shiftStartTime || "10:00")
    .split(":")
    .map(Number);
  const loginFloorMinutes = Math.max(
    5 * 60,
    (shiftStartH || 10) * 60 + (shiftStartM || 0) - 4 * 60,
  );
  const loginFloor = new Date(
    `${input.date}T${String(Math.floor(loginFloorMinutes / 60)).padStart(2, "0")}:${String(loginFloorMinutes % 60).padStart(2, "0")}:00+05:30`,
  );
  const afterFloor = (event: any) =>
    new Date(event.timestamp).getTime() >= loginFloor.getTime();
  const dayHasDaytimeActivity = presenceEvents.some(afterFloor);
  const loginPool = (list: any[]) =>
    dayHasDaytimeActivity ? list.filter(afterFloor) : list;

  // Prefer direct OS input proof. ACTIVE_WINDOW is the automatic fallback for
  // older agents or platforms where the unlock signal was unavailable.
  const firstInputEvent = loginPool(presenceEvents).find(
    (event) => event.type === "USER_ACTIVITY",
  );
  // Window fallback (days without input signals): the first window event that
  // is followed by a real window switch within 10 minutes. An idle PC that
  // keeps re-reporting one window never qualifies.
  const switchTimes = Array.from(switches).map((event: any) =>
    new Date(event.timestamp).getTime(),
  );
  const firstWindowEvent = loginPool(events).find((event: any) => {
    if (event.type !== "ACTIVE_WINDOW") return false;
    const at = new Date(event.timestamp).getTime();
    return switchTimes.some(
      (t) => t >= at && t - at <= INPUT_NEIGHBOUR_WINDOW_MS,
    );
  });
  const inputProofCapable = await agentSendsInputProof(
    input.employeeId,
    events,
    input.date,
  );
  const firstReliableWindowEvent =
    firstWindowEvent &&
    windowEventProvesPresence(firstWindowEvent, inputProofCapable)
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
  let presenceEvent =
    (firstInputEvent && isReliableLoginPresenceEvent(firstInputEvent)
      ? firstInputEvent
      : null) ||
    loginPool(events).find((event: any) => event.type === "LOGIN") ||
    (windowIsCloseToInput ? firstReliableWindowEvent : null) ||
    firstReliableWindowEvent ||
    // The agent emits IDLE_END by itself on wake from sleep, so it only proves
    // presence for older agents that cannot send USER_ACTIVITY.
    (inputProofCapable
      ? null
      : loginPool(events).find(
          (event: any) =>
            event.type === "IDLE_END" || event.type === "AWAY_WORK_END",
        )) ||
    // A login set by an admin or an approved attendance-change request counts
    // as presence even when the agent sent nothing that day.
    (existingRecord?.loginTimeOverridden && existingRecord.loginTime
      ? ({
          type: "LOGIN",
          timestamp: existingRecord.loginTime,
          metadata: {},
        } as any)
      : null);

  // With "Mark Attendance" switched on, laptop activity no longer creates
  // the login: only the employee's Mark (stored as a set login time) or an
  // admin's correction does.
  if (await markGateFor(input.date)) {
    presenceEvent =
      existingRecord?.loginTimeOverridden && existingRecord.loginTime
        ? ({
            type: "LOGIN",
            timestamp: existingRecord.loginTime,
            metadata: {},
          } as any)
        : null;
  }

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
    const timeData = aggregateWorkHours({
      events,
      windowStart: presenceEvent.timestamp,
    });
    const latestRealActivityEvent = getLatestRealActivityEvent(presenceEvents, inputProofCapable);
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
    // Before 8 PM IST today's day stays open whatever the idle time.
    const isActiveSession =
      isBeforeLogoutCapture(input.date) ||
      (input.date === getBusinessDate() &&
        latestRealActivityEvent &&
        Date.now() - new Date(latestRealActivityEvent.timestamp).getTime() <
          INACTIVITY_AUTO_LOGOUT_MINUTES * 60 * 1000);

    if (!isActiveSession && timeData.totalWorkedMinutes < 120) {
      attendanceStatus =
        dayOffStatus?.status === "WEEKEND"
          ? "ABSENT"
          : dayOffStatus?.status || "ABSENT";
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
    ).then((doc) => {
      announceLoginIfPresent(input.date, doc);
      return doc;
    });
  }

  const logoutEvent = [...events].reverse().find((e) => e.type === "LOGOUT");
  const latestRealActivityEvent = getLatestRealActivityEvent(presenceEvents, inputProofCapable);
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
    ...COUNTED_SESSION_FILTER,
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
    logoutAt = inferredLogoutAt;
  }

  if (
    !existingRecord?.logoutTimeOverridden &&
    isSuspiciousMidnightLogout({
      date: input.date,
      loginAt,
      logoutAt: logoutAt ? new Date(logoutAt) : null,
    }) &&
    latestRealActivityAt &&
    latestRealActivityAt > loginAt &&
    getBusinessDate(latestRealActivityAt) === input.date &&
    (input.date !== getBusinessDate() ||
      Date.now() - latestRealActivityAt.getTime() >=
        INACTIVITY_AUTO_LOGOUT_MINUTES * 60 * 1000)
  ) {
    logoutAt = latestRealActivityAt;
  }

  // 5. Resolve Lateness via Admin Policy
  const shiftResolution = await resolveShiftVariant({
    loginAt,
    shiftPolicyId: shift._id.toString(),
    shiftPolicySnapshot: shift,
  });

  // 6. Aggregate Work Hours (only time from login onward counts)
  const timeData = aggregateWorkHours({ events, windowStart: loginAt });

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

  if (
    !existingRecord?.logoutTimeOverridden &&
    isActiveSession &&
    isSuspiciousMidnightLogout({
      date: input.date,
      loginAt,
      logoutAt: logoutAt ? new Date(logoutAt) : null,
    })
  ) {
    logoutAt = null;
  }

  // Today before 8 PM IST the day is still open, whatever the idle time.
  const dayStillOpen = isBeforeLogoutCapture(input.date);
  const treatAsWorking = Boolean(isActiveSession) || dayStillOpen;

  if (!logoutAt && !treatAsWorking && latestEvidence) {
    logoutAt = latestEvidence.timestamp;
  }

  // A finished day's logout is the last real activity on the laptop. Old
  // agents (midnight restart, sessions closed at day end) left logouts at
  // 12:00 AM hours after the employee stopped working, inflating overtime.
  // Admin-set logout times are never changed.
  if (
    !existingRecord?.logoutTimeOverridden &&
    logoutAt &&
    latestEvidence &&
    !treatAsWorking
  ) {
    const lastActivityMs = new Date(latestEvidence.timestamp).getTime();
    if (new Date(logoutAt).getTime() > lastActivityMs + LOGOUT_GRACE_MS) {
      logoutAt = latestEvidence.timestamp;
    }
  }

  const logoutAtDate = logoutAt ? new Date(logoutAt) : null;
  const requiredWorkMinutes = Number(shift.minimumWorkMinutes || 120);
  const isFinalizedDay = input.date !== getBusinessDate() || !!logoutAtDate;
  // The shift's minimum work minutes is the half-day limit, measured from login to logout
  // (or to now while the employee is still working) — not productive time.
  const spanEnd = logoutAtDate
    ? logoutAtDate
    : isActiveSession
      ? new Date()
      : latestEvidence
        ? new Date(latestEvidence.timestamp)
        : loginAt;
  const workedSpanMinutes = Math.max(
    0,
    Math.round((spanEnd.getTime() - loginAt.getTime()) / 60_000),
  );
  const workedBelowHalfDayLimit =
    isFinalizedDay && workedSpanMinutes < requiredWorkMinutes;
  // Logging out early is not a half day by itself; only working less than
  // the half-day limit is ("Half Day If Logout Before" is no longer used).

  // A day whose login an admin (or an approved attendance-change request)
  // set by hand may have little or no telemetry; its hours come from the
  // corrected login -> logout instead.
  const manuallyCorrectedWorkDay =
    Boolean(existingRecord?.loginTimeOverridden) && workedSpanMinutes >= 120;

  let attendanceStatus = "PRESENT";
  if (
    !treatAsWorking &&
    timeData.totalWorkedMinutes < 120 &&
    !manuallyCorrectedWorkDay
  ) {
    attendanceStatus = "ABSENT";
  } else if (isAbsentArrival) {
    // Genuine live keyboard/mouse/window evidence proves attendance even when
    // the employee arrived beyond the normal full-day threshold.
    attendanceStatus = isActiveSession ? "HALF_DAY" : "ABSENT";
  } else if (
    shift.shiftType === "HALF_DAY" ||
    isHalfDayArrival ||
    workedBelowHalfDayLimit
  ) {
    attendanceStatus = "HALF_DAY";
  } else if (shiftResolution.isLateEntry) {
    attendanceStatus = "LATE";
  }

  // An approved half-day leave: someone who came in for part of the day is
  // on a half day, not absent.
  if (
    attendanceStatus === "ABSENT" &&
    (await approvedHalfDayLeaveFor(input.employeeId, input.date))
  ) {
    attendanceStatus = "HALF_DAY";
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
      workedSpanMinutes,
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
    announceLoginIfPresent(input.date, doc);
    // Return doc for the frontend
    return doc?.toObject();
  });
}

// Today's login message (once per employee per day) as soon as attendance
// records them as present with a login time. Maintenance scripts that
// recompute past days set SKIP_LOGIN_ANNOUNCE=1 to stay silent.
function announceLoginIfPresent(date: string, doc: any) {
  if (
    process.env.SKIP_LOGIN_ANNOUNCE === "1" ||
    !doc?.loginTime ||
    !["PRESENT", "LATE", "HALF_DAY"].includes(String(doc.attendanceStatus))
  ) {
    return;
  }
  void announceDailyLoginOnce({
    employeeId: doc.employeeId,
    date,
    loginTime: doc.loginTime,
  }).catch((error) =>
    console.error("[Attendance] Login announcement failed:", error),
  );
}
