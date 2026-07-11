export type ShiftResolutionResult = {
  resolvedShiftPolicyId: string;

  resolvedShiftPolicyName: string;

  attendanceType: "PRESENT" | "HALF_DAY" | "ABSENT";

  isLateShift: boolean;

  isLateEntry: boolean;

  loginAt: Date;

  lateByMinutes: number;

  workedShiftStart: string;

  workedShiftEnd: string;
};
