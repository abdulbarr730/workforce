import { ShiftPolicy } from "../model/shift-policy.model";
import { ShiftResolutionResult } from "../types/shift-resolution.types";

type ResolveShiftVariantInput = {
  loginAt: Date;
  shiftPolicyId: string; 
};

export async function resolveShiftVariant(
  input: ResolveShiftVariantInput
): Promise<ShiftResolutionResult> {
  const { loginAt, shiftPolicyId } = input;

  const shift = await ShiftPolicy.findById(shiftPolicyId);
  if (!shift) {
    throw new Error(`Shift policy ${shiftPolicyId} not found in database.`);
  }

  // 1. Parse shiftStartTime (e.g., "10:00")
  const [startHour, startMinute] = shift.shiftStartTime.split(":").map(Number);
  const expectedStartTime = new Date(loginAt);
  expectedStartTime.setHours(startHour, startMinute, 0, 0);

  // 2. Parse loginCutoffTime (e.g., "10:30")
  const [cutoffHour, cutoffMinute] = shift.loginCutoffTime.split(":").map(Number);
  const cutoffTime = new Date(loginAt);
  cutoffTime.setHours(cutoffHour, cutoffMinute, 0, 0);

  // 3. Determine if the user is late
  const isLateArrival = loginAt.getTime() > cutoffTime.getTime();
  
  let lateByMinutes = 0;
  if (isLateArrival) {
    // If late, calculate the delay from the expected start time, not the cutoff time.
    lateByMinutes = Math.floor((loginAt.getTime() - expectedStartTime.getTime()) / (1000 * 60));
  }

  return {
    resolvedShiftPolicyId: shift._id.toString(),
    resolvedShiftPolicyName: shift.name,
    attendanceType: "PRESENT", 
    isLateShift: shift.shiftType === "LATE", // Keeps type integrity: tells if the shift ITSELF is a night/late shift
    loginAt,
    lateByMinutes,
    workedShiftStart: shift.shiftStartTime,
    workedShiftEnd: shift.shiftEndTime
  };
}