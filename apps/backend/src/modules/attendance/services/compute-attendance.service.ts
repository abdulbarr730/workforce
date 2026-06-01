import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { AttendanceRecord } from "../model/attendance-record.model";
import { resolveShiftVariant } from "./resolve-shift-variant.service";
import { aggregateWorkHours } from "./aggregate-work-hours.service";
import { ShiftPolicy } from "../model/shift-policy.model";
import { checkDayOffStatus } from "./check-day-off.service";

type ComputeAttendanceInput = {
  employeeId: string;
  date: string; 
  shiftPolicyId: string; 
};

export async function computeAttendanceFromEvents(
  input: ComputeAttendanceInput
) {
  // 1. Fetch the Assigned Shift Policy FIRST
  const shift = await ShiftPolicy.findById(input.shiftPolicyId);
  if (!shift) {
    throw new Error(`Shift policy ${input.shiftPolicyId} not found.`);
  }

  // 2. Fetch raw events using actual timestamp
  const events = await ActivityEvent.find({
    employeeId: input.employeeId,
    timestamp: {
      $gte: new Date(`${input.date}T00:00:00Z`),
      $lte: new Date(`${input.date}T23:59:59Z`)
    }
  }).sort({ timestamp: 1 });

  // 3. The Interceptor: Determine if zero events is actually a violation
  if (!events || events.length === 0) {
    const dayOffStatus = await checkDayOffStatus(
      input.employeeId, 
      input.date, 
      shift.activeDays
    );

    // If dayOffStatus returns a value, use it. Otherwise, they missed a work day (ABSENT).
    const finalStatus = dayOffStatus ? dayOffStatus : "ABSENT";

    return AttendanceRecord.findOneAndUpdate(
      { employeeId: input.employeeId, date: input.date },
      { 
        attendanceStatus: finalStatus, 
        totalWorkedMinutes: 0,
        shiftAssigned: shift.name
      },
      { upsert: true, returnDocument: 'after' }
    );
  }

  // 4. Resilient Login Detection (If events exist, proceed with normal calculation)
  const loginEvent = events.find((e) => e.type === "LOGIN");
  const firstActivityEvent = events[0];
  const loginAt = loginEvent ? loginEvent.timestamp : firstActivityEvent.timestamp;

  const logoutEvent = [...events].reverse().find((e) => e.type === "LOGOUT");
  const logoutAt = logoutEvent ? logoutEvent.timestamp : null;

  // 5. Resolve Lateness via Admin Policy
  const shiftResolution = await resolveShiftVariant({
    loginAt,
    shiftPolicyId: input.shiftPolicyId
  });

  // 6. Aggregate Work Hours
  const timeData = aggregateWorkHours({ events });

  // 7. Half-Day Logic (12:30 PM - 1:30 PM rule)
  const loginHour = loginAt.getHours();
  const loginMinute = loginAt.getMinutes();
  const loginTimeInMinutes = loginHour * 60 + loginMinute;
  const isHalfDayArrival = loginTimeInMinutes >= 750 && loginTimeInMinutes <= 810;
  
  let attendanceStatus = "PRESENT";
  if (isHalfDayArrival) {
    attendanceStatus = "HALF_DAY";
  } else if (shiftResolution.isLateShift) {
    attendanceStatus = "LATE";
  }

  let expectedLogoutTime = null;
  if (shift.shiftEndTime && loginAt) {
    const dateStr = new Date(loginAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    expectedLogoutTime = new Date(`${dateStr}T${shift.shiftEndTime}:00+05:30`);
  } else if (shift.minimumWorkMinutes && loginAt) {
    expectedLogoutTime = new Date(loginAt.getTime() + shift.minimumWorkMinutes * 60000);
  }

  // 8. Write the Record
  return AttendanceRecord.findOneAndUpdate(
    { employeeId: input.employeeId, date: input.date },
    {
      attendanceStatus: attendanceStatus,
      shiftAssigned: shiftResolution.resolvedShiftPolicyName,
      loginTime: loginAt,
      logoutTime: logoutAt,
      totalWorkedMinutes: timeData.totalWorkedMinutes,
      productiveMinutes: timeData.productiveMinutes,
      breakMinutes: timeData.breakMinutes,
      idleMinutes: timeData.idleMinutes,
      awayWorkingMinutes: timeData.awayWorkingMinutes,
      lateMinutes: shiftResolution.lateByMinutes,
      overtimeMinutes: Math.max(0, timeData.productiveMinutes - (shift.minimumWorkMinutes || 480))
    },
    { upsert: true, returnDocument: 'after' }
  ).then(doc => {
    // Inject expectedLogoutTime dynamically for the frontend
    return { ...doc?.toObject(), expectedLogoutTime };
  });
}
