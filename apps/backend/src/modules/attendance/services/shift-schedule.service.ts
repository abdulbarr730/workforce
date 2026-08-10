const BUSINESS_TIME_ZONE = "Asia/Kolkata";

type ShiftSchedulePolicy = {
  shiftType?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  loginCutoffTime?: string | null;
};

export function timeStringToMinutes(value?: string | null): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function addMinutesToClock(value: string, minutesToAdd: number) {
  const total = (timeStringToMinutes(value) + minutesToAdd) % (24 * 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getBusinessDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getBusinessDayBounds(date: string) {
  return {
    start: new Date(`${date}T00:00:00.000+05:30`),
    end: new Date(`${date}T23:59:59.999+05:30`),
  };
}

export function getBusinessClockMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hours = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minutes = Number(
    parts.find((part) => part.type === "minute")?.value || 0,
  );
  return hours * 60 + minutes;
}

export function resolveEffectiveShiftSchedule(
  policy: ShiftSchedulePolicy,
  loginAt: Date,
) {
  const shiftStartTime = policy.shiftStartTime || "10:00";
  const shiftEndTime = policy.shiftEndTime || "18:30";
  const loginMinutes = getBusinessClockMinutes(loginAt);
  const cutoffMinutes = timeStringToMinutes(policy.loginCutoffTime || "09:55");

  // A LATE policy already contains its final hours. Only a regular policy is
  // advanced by 30 minutes when the employee arrives after its cutoff.
  const isLateEntry =
    policy.shiftType !== "LATE" && loginMinutes > cutoffMinutes;

  return {
    loginMinutes,
    isLateEntry,
    shiftStartTime: isLateEntry
      ? addMinutesToClock(shiftStartTime, 30)
      : shiftStartTime,
    shiftEndTime: isLateEntry
      ? addMinutesToClock(shiftEndTime, 30)
      : shiftEndTime,
  };
}
