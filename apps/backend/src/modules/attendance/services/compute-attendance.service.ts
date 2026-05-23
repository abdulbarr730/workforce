import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { AttendanceRecord } from "../model/attendance-record.model";
import { resolveShiftVariant } from "./resolve-shift-variant.service";
import { aggregateWorkHours } from "./aggregate-work-hours.service";

type ComputeAttendanceInput = {
  employeeId: string;
  date: string; // Format: YYYY-MM-DD
  shiftPolicyId: string; // The shift assigned to this specific employee
};

export async function computeAttendanceFromEvents(
  input: ComputeAttendanceInput
) {
  // 1. OFFLINE FIX: Use `timestamp`, not `createdAt`. 
  // This ensures late-arriving offline data is placed on the correct historical day.
  const events = await ActivityEvent.find({
    employeeId: input.employeeId,
    timestamp: {
      $gte: new Date(`${input.date}T00:00:00Z`),
      $lte: new Date(`${input.date}T23:59:59Z`)
    }
  }).sort({ timestamp: 1 });

  // 2. Absent Detection
  if (!events || events.length === 0) {
    return AttendanceRecord.findOneAndUpdate(
      { employeeId: input.employeeId, date: input.date },
      { status: "ABSENT", totalWorkedMinutes: 0 },
      { upsert: true, new: true }
    );
  }

  // 3. Resilient Login Detection
  // Do not crash if LOGIN is missing. Use the very first event of the day as a fallback.
  const loginEvent = events.find((e) => e.type === "LOGIN");
  const firstActivityEvent = events[0];
  const loginAt = loginEvent ? loginEvent.timestamp : firstActivityEvent.timestamp;

  const logoutEvent = [...events].reverse().find((e) => e.type === "LOGOUT");
  const logoutAt = logoutEvent ? logoutEvent.timestamp : null;

  // 4. Resolve the Shift (DB-Driven)
  const shiftResolution = await resolveShiftVariant({
    loginAt,
    shiftPolicyId: input.shiftPolicyId
  });

  // 5. Integrate the Work Hour Aggregator (The real math)
  const timeData = aggregateWorkHours({ events });

  // 6. Half-Day Logic (Strictly based on arrival time, per Master Plan 6.3)
  const loginHour = loginAt.getHours();
  const loginMinute = loginAt.getMinutes();
  const loginTimeInMinutes = loginHour * 60 + loginMinute;

  // 12:30 PM = 750 minutes, 1:30 PM = 810 minutes
  const isHalfDayArrival = loginTimeInMinutes >= 750 && loginTimeInMinutes <= 810;
  
  let attendanceStatus = "PRESENT";
  if (isHalfDayArrival) {
    attendanceStatus = "HALF_DAY";
  } else if (shiftResolution.isLateShift) {
    attendanceStatus = "LATE";
  }

  // 7. Write the Computed Record
  return AttendanceRecord.findOneAndUpdate(
    {
      employeeId: input.employeeId,
      date: input.date
    },
    {
      status: attendanceStatus,
      resolvedShiftPolicyId: shiftResolution.resolvedShiftPolicyId,
      resolvedShiftPolicyName: shiftResolution.resolvedShiftPolicyName,
      loginAt,
      logoutAt,
      totalWorkedMinutes: timeData.totalWorkedMinutes,
      productiveMinutes: timeData.productiveMinutes,
      breakMinutes: timeData.breakMinutes,
      idleMinutes: timeData.idleMinutes,
      awayWorkingMinutes: timeData.awayWorkingMinutes,
      lateMinutes: shiftResolution.lateByMinutes,
      // Calculate overtime: productive time minus expected shift time (e.g., 8 hours = 480 mins)
      // Note: Pull expectedShiftDuration from the ShiftPolicy in production
      overtimeMinutes: Math.max(0, timeData.productiveMinutes - 480) 
    },
    {
      upsert: true,
      new: true
    }
  );
}