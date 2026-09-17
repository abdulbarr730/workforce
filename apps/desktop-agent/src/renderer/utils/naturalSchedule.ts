const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const toTime = (hourRaw: string, minuteRaw?: string, meridiemRaw?: string) => {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  const meridiem = meridiemRaw?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export type NaturalSchedule = {
  scheduledFor: string;
  reminderTime: string;
  cleanedText: string;
};

/** Extract scheduling intent while retaining exactly what the user typed. */
export function parseNaturalSchedule(
  text: string,
  base = new Date(),
): NaturalSchedule | null {
  const original = text.trim();
  if (!original) return null;

  const lower = original.toLowerCase();
  let target: Date | null = null;
  let reminderTime = "";

  const relativeMatch = lower.match(
    /\b(?:after|in)\s+(\d{1,4})\s*(minutes?|mins?|m|hours?|hrs?|h)\b/,
  );
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    if (Number.isFinite(amount) && amount > 0) {
      target = new Date(base);
      target.setMinutes(target.getMinutes() + (unit.startsWith("h") ? amount * 60 : amount));
      reminderTime = `${String(target.getHours()).padStart(2, "0")}:${String(
        target.getMinutes(),
      ).padStart(2, "0")}`;
    }
  }

  const todayMatch = lower.match(/\btoday\b/);
  if (todayMatch && !relativeMatch) target = new Date(base);

  const tomorrowMatch = lower.match(/\b(?:tomorrow|tmrw|tmr)\b/);
  if (tomorrowMatch) {
    const dateTarget = new Date(base);
    dateTarget.setDate(dateTarget.getDate() + 1);
    if (target) dateTarget.setHours(target.getHours(), target.getMinutes(), 0, 0);
    target = dateTarget;
  }

  const weekdayMatch = lower.match(
    /\b(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/,
  );
  if (weekdayMatch) {
    const wanted = WEEKDAY_INDEX[weekdayMatch[1]];
    if (wanted !== undefined) {
      const weekdayTarget = new Date(base);
      const current = weekdayTarget.getDay();
      let diff = wanted - current;
      if (diff <= 0) diff += 7;
      weekdayTarget.setDate(weekdayTarget.getDate() + diff);
      if (target) weekdayTarget.setHours(target.getHours(), target.getMinutes(), 0, 0);
      target = weekdayTarget;
    }
  }

  const timeMatch = lower.match(
    /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s*)?([01]?\d|2[0-3]):([0-5]\d)\b/,
  );
  if (timeMatch) {
    reminderTime = timeMatch[1]
      ? toTime(timeMatch[1], timeMatch[2], timeMatch[3])
      : toTime(timeMatch[4], timeMatch[5]);
    if (reminderTime) {
      const [hours, minutes] = reminderTime.split(":").map(Number);
      if (!target) target = new Date(base);
      target.setHours(hours, minutes, 0, 0);
    }
  }

  if (!target) return null;
  return {
    scheduledFor: toDateKey(target),
    reminderTime,
    cleanedText: original,
  };
}
