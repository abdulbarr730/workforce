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
  const inputIsInitialProof =
    firstInputEvent &&
    (!firstWindowEvent ||
      new Date(firstInputEvent.timestamp).getTime() <=
        new Date(firstWindowEvent.timestamp).getTime() + 2 * 60 * 1000);
  const presenceEvent =
    (inputIsInitialProof ? firstInputEvent : firstWindowEvent) ||
    events.find((event) => event.type === "LOGIN") ||
    events.find(
      (event) => event.type === "IDLE_END" || event.type === "AWAY_WORK_END",
    );

  // 3. The Interceptor: Determine if zero events is actually a violation
  if (!presenceEvent) {
    // If dayOffStatus returns a value, use it. Otherwise, they missed a work day (ABSENT).
    const finalStatus = dayOffStatus ? dayOffStatus : "ABSENT";

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
          dayOffStatus === "HOLIDAY"
            ? "Holiday"
            : shift
              ? formatName(shift.name)
              : "Weekend Off",
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  // Handle the case where they worked on an off-day (no shift policy found for today)
  if (!shift || dayOffStatus === "HOLIDAY") {
    const timeData = aggregateWorkHours({ events });

    let attendanceStatus = "PRESENT";
    const lastEvent = events[events.length - 1];
    const isActiveSession =
      input.date === getBusinessDate() &&
      lastEvent &&
      lastEvent.type !== "LOGOUT" &&
      Date.now() - new Date(lastEvent.timestamp).getTime() <= 5 * 60 * 1000;

    if (
      dayOffStatus !== "HOLIDAY" &&
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
          dayOffStatus === "HOLIDAY" ? "Holiday Work" : "Weekend Work",
        loginTime: presenceEvent.timestamp,
        logoutTime: events[events.length - 1].timestamp,
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

  const sessionList = sessions.map((s) => ({
    loginAt: s.loginAt,
    logoutAt: s.logoutAt || null,
  }));

  const loginAt =
    existingRecord?.loginTimeOverridden && existingRecord.loginTime
      ? new Date(existingRecord.loginTime)
      : new Date(presenceEvent.timestamp);

  const logoutEvent = [...events].reverse().find((e) => e.type === "LOGOUT");
  let logoutAt = logoutEvent ? logoutEvent.timestamp : null;

  if (existingRecord?.logoutTimeOverridden) {
    logoutAt = existingRecord.logoutTime || null;
  }

  if (
    !existingRecord?.logoutTimeOverridden &&
    sessions.length > 0 &&
    sessions[sessions.length - 1].logoutAt
  ) {
    if (
      !logoutAt ||
      new Date(sessions[sessions.length - 1].logoutAt!) > new Date(logoutAt)
    ) {
      logoutAt = sessions[sessions.length - 1].logoutAt!;
    }
  }

  // 5. Resolve Lateness via Admin Policy
  const shiftResolution = await resolveShiftVariant({
    loginAt,
    shiftPolicyId: shift._id.toString(),
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

  const isHalfDayArrival =
    loginTimeInMinutes >= halfDayThreshold &&
    loginTimeInMinutes < absentThreshold;
  const isAbsentArrival = loginTimeInMinutes >= absentThreshold;

  // An unclosed database session is not evidence that the laptop is still
  // online. Require recent real activity on the current business day.
  const latestEvidenceAt = new Date(events[events.length - 1].timestamp);
  const isActiveSession =
    input.date === getBusinessDate() &&
    sessions.length > 0 &&
    !sessions[sessions.length - 1].logoutAt &&
    Date.now() - latestEvidenceAt.getTime() <= 5 * 60 * 1000;

  let attendanceStatus = "PRESENT";
  if (!isActiveSession && timeData.totalWorkedMinutes < 120) {
    attendanceStatus = "ABSENT";
  } else if (isAbsentArrival) {
    attendanceStatus = "ABSENT";
  } else if (shift.shiftType === "HALF_DAY" || isHalfDayArrival) {
    attendanceStatus = "HALF_DAY";
  } else if (shiftResolution.isLateEntry) {
    attendanceStatus = "LATE";
  }

  // Format Exact Shift String to match Desktop Agent
  let startTimeStr = shiftResolution.workedShiftStart;
  let endTimeStr = shiftResolution.workedShiftEnd;

  if (attendanceStatus === "HALF_DAY") {
    const weekday = new Date(input.date).toLocaleDateString("en-US", {
      weekday: "short",
    });
    endTimeStr = weekday === "Sat" ? "17:00" : "18:30";
  }

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

  if (finalLogoutTime) {
    if (expectedLogoutTime && finalLogoutTime > expectedLogoutTime) {
      finalOvertimeMinutes = Math.floor(
        (finalLogoutTime.getTime() - expectedLogoutTime.getTime()) / 60000,
      );
    }
  } else {
    if (expectedLogoutTime && Date.now() > expectedLogoutTime.getTime()) {
      finalLogoutTime = expectedLogoutTime;
    }
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
      requiredWorkMinutes: Number(shift.minimumWorkMinutes || 480),
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
