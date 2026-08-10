export const DEFAULT_WELCOME_CALL_SCHEDULE = {
  mode: "SCHEDULED" as const,
  dailyTime: "11:00",
  timezone: "Asia/Kolkata",
  requireAgentPresence: true,
  weeklyRunTimes: [
    { weekday: "MONDAY", time: "11:00" },
    { weekday: "TUESDAY", time: "11:00" },
    { weekday: "WEDNESDAY", time: "11:00" },
    { weekday: "THURSDAY", time: "11:00" },
    { weekday: "FRIDAY", time: "11:00" },
    { weekday: "FRIDAY", time: "17:00" },
    { weekday: "SATURDAY", time: "10:00" },
  ],
  webinarCutoff: {
    enabled: true,
    weekday: "SATURDAY",
    time: "11:00",
  },
  postWebinarImmediate: {
    enabled: true,
    startTime: "11:00",
    memberEmployeeIds: [] as string[],
  },
};

export type WelcomeCallZonedClock = {
  date: string;
  weekday: string;
  minutes: number;
};

export const minutesFromClockTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

export const getZonedClock = (
  now: Date,
  timezone: string,
): WelcomeCallZonedClock => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: String(parts.weekday || "").toUpperCase(),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

export const getWelcomeCallSchedule = (campaign: any) => {
  const rawSchedule = campaign.allocationSchedule || {};
  const configured =
    typeof rawSchedule.toObject === "function"
      ? rawSchedule.toObject()
      : rawSchedule;
  const isLegacySchedule =
    !configured.postWebinarImmediate?.startTime &&
    configured.dailyTime === "09:00" &&
    configured.webinarCutoff?.time === "11:00";
  return {
    ...DEFAULT_WELCOME_CALL_SCHEDULE,
    ...configured,
    dailyTime: isLegacySchedule
      ? DEFAULT_WELCOME_CALL_SCHEDULE.dailyTime
      : configured.dailyTime || DEFAULT_WELCOME_CALL_SCHEDULE.dailyTime,
    weeklyRunTimes: Array.isArray(configured.weeklyRunTimes)
      ? configured.weeklyRunTimes.map((run: any) => ({
          weekday: String(run.weekday),
          time: String(run.time),
        }))
      : DEFAULT_WELCOME_CALL_SCHEDULE.weeklyRunTimes,
    webinarCutoff: {
      ...DEFAULT_WELCOME_CALL_SCHEDULE.webinarCutoff,
      ...(configured.webinarCutoff || {}),
    },
    postWebinarImmediate: {
      ...DEFAULT_WELCOME_CALL_SCHEDULE.postWebinarImmediate,
      ...(configured.postWebinarImmediate || {}),
      memberEmployeeIds: (
        configured.postWebinarImmediate?.memberEmployeeIds || []
      ).map(String),
    },
  };
};

export const isAfterWebinarCutoff = (campaign: any, now = new Date()) => {
  const schedule = getWelcomeCallSchedule(campaign);
  if (
    schedule.mode !== "SCHEDULED" ||
    !schedule.webinarCutoff.enabled ||
    !schedule.postWebinarImmediate.enabled
  ) {
    return false;
  }
  const clock = getZonedClock(now, schedule.timezone);
  return (
    clock.weekday === schedule.webinarCutoff.weekday &&
    clock.minutes >
      minutesFromClockTime(schedule.postWebinarImmediate.startTime)
  );
};

const WEEKDAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export const getWebinarOccurrenceDate = (campaign: any, at = new Date()) => {
  const schedule = getWelcomeCallSchedule(campaign);
  const clock = getZonedClock(at, schedule.timezone);
  const currentWeekday = WEEKDAY_INDEX[clock.weekday];
  const webinarWeekday = WEEKDAY_INDEX[schedule.webinarCutoff.weekday];
  let daysUntil = (webinarWeekday - currentWeekday + 7) % 7;
  if (
    daysUntil === 0 &&
    clock.minutes > minutesFromClockTime(schedule.webinarCutoff.time)
  ) {
    daysUntil = 7;
  }
  const [year, month, day] = clock.date.split("-").map(Number);
  const occurrence = new Date(Date.UTC(year, month - 1, day + daysUntil));
  return occurrence.toISOString().slice(0, 10);
};
