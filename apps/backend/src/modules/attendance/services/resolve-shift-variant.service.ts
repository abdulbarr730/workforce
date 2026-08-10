import { ShiftPolicy } from "../model/shift-policy.model";
import { ShiftResolutionResult } from "../types/shift-resolution.types";
import { resolveEffectiveShiftSchedule } from "./shift-schedule.service";

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

  const schedule = resolveEffectiveShiftSchedule(shift, loginAt);

  let lateByMinutes = 0;
  if (schedule.isLateEntry) {
    const [startHour, startMinute] = shift.shiftStartTime
      .split(":")
      .map(Number);
    lateByMinutes = Math.max(
      0,
      schedule.loginMinutes - (startHour * 60 + startMinute),
    );
  }

  return {
    resolvedShiftPolicyId: shift._id.toString(),
    resolvedShiftPolicyName: shift.name,
    attendanceType: "PRESENT",
    isLateShift: shift.shiftType === "LATE",
    isLateEntry: schedule.isLateEntry,
    loginAt,
    lateByMinutes,
    workedShiftStart: schedule.shiftStartTime,
    workedShiftEnd: schedule.shiftEndTime,
  };
}
