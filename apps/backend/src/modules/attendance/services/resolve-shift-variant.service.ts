import { ShiftPolicy }
  from "../model/shift-policy.model";

import {
  ShiftResolutionResult
} from "../types/shift-resolution.types";

type ResolveShiftVariantInput = {
  loginAt: Date;
};

export async function
resolveShiftVariant(
  input: ResolveShiftVariantInput
): Promise<ShiftResolutionResult> {
  const loginAt =
    input.loginAt;

  const day =
    loginAt.getDay();

  const hours =
    loginAt.getHours();

  const minutes =
    loginAt.getMinutes();

  const totalMinutes =
    hours * 60 + minutes;

  const isSaturday =
    day === 6;

  /*
    Current architecture:

    Saturday:
      <= 9:25 → REGULAR
      >  9:25 → LATE

    Weekday:
      <= 9:55 → REGULAR
      >  9:55 → LATE
  */

  const saturdayCutoff =
    9 * 60 + 25;

  const weekdayCutoff =
    9 * 60 + 55;

  let shiftName = "";

  if (isSaturday) {
    shiftName =
      totalMinutes <=
      saturdayCutoff
        ? "SATURDAY_REGULAR"
        : "SATURDAY_LATE";
  } else {
    shiftName =
      totalMinutes <=
      weekdayCutoff
        ? "WEEKDAY_REGULAR"
        : "WEEKDAY_LATE";
  }

  const shift =
    await ShiftPolicy.findOne({
      name: shiftName
    });

  if (!shift) {
    throw new Error(
      `Shift policy ${shiftName} not found`
    );
  }

  const lateByMinutes =
    isSaturday
      ? Math.max(
          0,
          totalMinutes -
            saturdayCutoff
        )
      : Math.max(
          0,
          totalMinutes -
            weekdayCutoff
        );

  return {
    resolvedShiftPolicyId:
      shift._id.toString(),

    resolvedShiftPolicyName:
      shift.name,

    attendanceType:
      "PRESENT",

    isLateShift:
      shift.shiftType ===
      "LATE",

    loginAt,

    lateByMinutes,

    workedShiftStart:
      shift.shiftStartTime,

    workedShiftEnd:
      shift.shiftEndTime
  };
}