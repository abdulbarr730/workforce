import { ShiftPolicy } from "../model/shift-policy.model";
import { ShiftResolutionResult } from "../types/shift-resolution.types";

type ResolveShiftVariantInput = {
  loginAt: Date;
  shiftPolicyId: string;
};

export async function resolveShiftVariant(
  input: ResolveShiftVariantInput,
): Promise<ShiftResolutionResult> {
  const { loginAt, shiftPolicyId } = input;

  const shift = await ShiftPolicy.findById(shiftPolicyId);
  if (!shift) {
    throw new Error(`Shift policy ${shiftPolicyId} not found in database.`);
  }

  // Extract the IST hour and minute from loginAt
  const options = { timeZone: "Asia/Kolkata", hour12: false };
  const loginHourStr = loginAt.toLocaleTimeString("en-US", {
    ...options,
    hour: "2-digit",
  });
  const loginMinStr = loginAt.toLocaleTimeString("en-US", {
    ...options,
    minute: "2-digit",
  });
  const loginTimeMins =
    parseInt(loginHourStr.replace(/\D/g, ""), 10) * 60 +
    parseInt(loginMinStr.replace(/\D/g, ""), 10);

  // 1. Parse shiftStartTime (e.g., "10:00")
  const [startHour, startMinute] = shift.shiftStartTime.split(":").map(Number);
  const expectedStartTimeMins = startHour * 60 + startMinute;

  // 2. Parse loginCutoffTime (e.g., "10:30")
  const [cutoffHour, cutoffMinute] = shift.loginCutoffTime
    .split(":")
    .map(Number);
  const cutoffTimeMins = cutoffHour * 60 + cutoffMinute;

  // 3. Determine if the user is late
  const isLateArrival = loginTimeMins > cutoffTimeMins;

  let lateByMinutes = 0;
  if (isLateArrival) {
    // If late, calculate the delay from the expected start time
    lateByMinutes = Math.max(0, loginTimeMins - expectedStartTimeMins);
  }

  return {
    resolvedShiftPolicyId: shift._id.toString(),
    resolvedShiftPolicyName: shift.name,
    attendanceType: "PRESENT",
    isLateShift: shift.shiftType === "LATE", // Keeps type integrity: tells if the shift ITSELF is a night/late shift
    isLateEntry: isLateArrival,
    loginAt,
    lateByMinutes,
    workedShiftStart: shift.shiftStartTime,
    workedShiftEnd: shift.shiftEndTime,
  };
}
