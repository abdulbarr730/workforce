import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { AttendanceRecord } from "../model/attendance-record.model";
import { resolveShiftVariant } from "./resolve-shift-variant.service";
import { aggregateWorkHours } from "./aggregate-work-hours.service";
import { ShiftPolicy } from "../model/shift-policy.model";
import { checkDayOffStatus } from "./check-day-off.service";
import { WorkSession } from "../../work-sessions/model/work-session.model";

type ComputeAttendanceInput = {
  employeeId: string;
  date: string;
  shiftPolicyId: string;
};

export async function computeAttendanceFromEvents(
  input: ComputeAttendanceInput,
) {
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

  // 2. Fetch raw events using actual timestamp
  const events = await ActivityEvent.find({
    employeeId: input.employeeId,
    timestamp: {
      $gte: new Date(`${input.date}T00:00:00Z`),
      $lte: new Date(`${input.date}T23:59:59Z`),
    },
  }).sort({ timestamp: 1 });

  // 3. The Interceptor: Determine if zero events is actually a violation
  if (!events || events.length === 0) {
    const dayOffStatus = await checkDayOffStatus(
      input.employeeId,
      input.date,
      shift ? shift.activeDays : [],
    );

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
        shiftAssigned: shift ? formatName(shift.name) : "Weekend Off",
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  // Handle the case where they worked on an off-day (no shift policy found for today)
  if (!shift) {
    const timeData = aggregateWorkHours({ events });

    return AttendanceRecord.findOneAndUpdate(
      { employeeId: input.employeeId, date: input.date },
      {
        attendanceStatus: "PRESENT",
        shiftAssigned: "Weekend Work",
        loginTime: events[0].timestamp,
        logoutTime: events[events.length - 1].timestamp,
        totalWorkedMinutes: timeData.totalWorkedMinutes,
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
      $gte: new Date(`${input.date}T00:00:00Z`),
      $lte: new Date(`${input.date}T23:59:59Z`),
    },
  })
    .sort({ loginAt: 1 })
    .lean();

  const sessionList = sessions.map((s) => ({
    loginAt: s.loginAt,
    logoutAt: s.logoutAt || null,
  }));

  const loginEvent = events.find((e) => e.type === "LOGIN");
  const firstActivityEvent = events[0];
  const loginAt =
    sessions.length > 0
      ? new Date(sessions[0].loginAt)
      : loginEvent
        ? loginEvent.timestamp
        : firstActivityEvent.timestamp;

  const logoutEvent = [...events].reverse().find((e) => e.type === "LOGOUT");
  let logoutAt = logoutEvent ? logoutEvent.timestamp : null;

  if (sessions.length > 0 && sessions[sessions.length - 1].logoutAt) {
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

  let attendanceStatus = "PRESENT";
  if (isAbsentArrival) {
    attendanceStatus = "ABSENT";
  } else if (shift.shiftType === "HALF_DAY" || isHalfDayArrival) {
    attendanceStatus = "HALF_DAY";
  } else if (shiftResolution.isLateEntry) {
    attendanceStatus = "LATE";
  }

  // Format Exact Shift String to match Desktop Agent
  let startTimeStr = shift.shiftStartTime || "10:00";
  let endTimeStr = shift.shiftEndTime || "18:30";

  if (attendanceStatus === "LATE") {
    // If late entry, shift the timings by 30 mins
    let [sh, sm] = startTimeStr.split(":").map(Number);
    sm += 30;
    if (sm >= 60) {
      sh += 1;
      sm -= 60;
    }
    startTimeStr = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;

    let [eh, em] = endTimeStr.split(":").map(Number);
    em += 30;
    if (em >= 60) {
      eh += 1;
      em -= 60;
    }
    endTimeStr = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  }

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
      productiveMinutes: timeData.productiveMinutes,
      breakMinutes: timeData.breakMinutes,
      idleMinutes: timeData.idleMinutes,
      awayWorkingMinutes: timeData.awayWorkingMinutes,
      lateMinutes: shiftResolution.lateByMinutes,
      expectedLogoutTime: expectedLogoutTime,
      overtimeMinutes: finalOvertimeMinutes,
      sessions: sessionList,
    },
    { upsert: true, returnDocument: "after" },
  ).then((doc) => {
    // Return doc for the frontend
    return doc?.toObject();
  });
}
