const POLICY_FIELDS = [
  "name",
  "description",
  "activeDays",
  "shiftType",
  "shiftStartTime",
  "shiftEndTime",
  "loginCutoffTime",
  "halfDayAfterTime",
  "halfDayLogoutBeforeTime",
  "absentAfterTime",
  "minimumWorkMinutes",
  "overtimeEnabled",
  "overtimeAfterMinutes",
  "eodTriggerTime",
  "breakDeductionEnabled",
  "defaultBreakMinutes",
  "isDefault",
  "isActive",
];

export function getShiftPolicyForDate<T extends Record<string, any>>(
  policy: T,
  attendanceDate: string,
): T {
  const history = Array.isArray((policy as any).policyHistory)
    ? [...(policy as any).policyHistory]
    : [];
  let effectivePolicy: Record<string, any> = { ...policy };

  history
    .filter((entry: any) => entry?.effectiveFrom)
    .sort((a: any, b: any) =>
      String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)),
    )
    .forEach((entry: any) => {
      if (attendanceDate < String(entry.effectiveFrom) && entry.before) {
        effectivePolicy = {
          ...effectivePolicy,
          ...POLICY_FIELDS.reduce<Record<string, any>>((acc, field) => {
            if (Object.prototype.hasOwnProperty.call(entry.before, field)) {
              acc[field] = entry.before[field];
            }
            return acc;
          }, {}),
        };
      }
    });

  return effectivePolicy as T;
}
