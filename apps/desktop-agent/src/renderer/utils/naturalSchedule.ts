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

const hasDateIntent = (value: string) =>
  /\b(today|tomorrow|tmrw|tmr|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/.test(
    value,
  );

const hasReminderIntent = (value: string) =>
  /\b(remind|reminder|notify|alert)\b/.test(value);

const applyTimeAndAdvanceIfNeeded = (
  target: Date,
  base: Date,
  hours: number,
  minutes: number,
  allowNextOccurrence: boolean,
) => {
  target.setHours(hours, minutes, 0, 0);
  if (allowNextOccurrence && target.getTime() <= base.getTime()) {
    target.setDate(target.getDate() + 1);
  }
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

  const explicitDateIntent = hasDateIntent(lower);
  const timeMatch = lower.match(
    /\b(?:(?:at|on|by|around)\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:(?:at|on|by|around)\s*)?([01]?\d|2[0-3]):([0-5]\d)\b/,
  );
  if (timeMatch) {
    reminderTime = timeMatch[1]
      ? toTime(timeMatch[1], timeMatch[2], timeMatch[3])
      : toTime(timeMatch[4], timeMatch[5]);
    if (reminderTime) {
      const [hours, minutes] = reminderTime.split(":").map(Number);
      if (!target) target = new Date(base);
      applyTimeAndAdvanceIfNeeded(target, base, hours, minutes, !explicitDateIntent);
    }
  }

  if (!timeMatch && hasReminderIntent(lower)) {
    const bareReminderTimeMatch = lower.match(
      /\b(?:remind(?:er)?|notify|alert)(?:\s+me)?(?:\s+(?:on|at|by|around))?\s+(\d{1,2})(?::(\d{2}))?\b/,
    );
    if (bareReminderTimeMatch) {
      const hour = Number(bareReminderTimeMatch[1]);
      const minute = Number(bareReminderTimeMatch[2] || 0);
      if (
        Number.isFinite(hour) &&
        Number.isFinite(minute) &&
        hour >= 1 &&
        hour <= 12 &&
        minute >= 0 &&
        minute <= 59
      ) {
        const candidates = [hour, hour === 12 ? 0 : hour + 12]
          .filter((candidateHour, index, arr) => arr.indexOf(candidateHour) === index)
          .map((candidateHour) => {
            const candidate = new Date(target || base);
            candidate.setHours(candidateHour, minute, 0, 0);
            if (!explicitDateIntent && candidate.getTime() <= base.getTime()) {
              candidate.setDate(candidate.getDate() + 1);
            }
            return candidate;
          })
          .sort((a, b) => a.getTime() - b.getTime());
        let chosen = candidates.find((candidate) => candidate.getTime() > base.getTime());
        if (!chosen && candidates[0]) {
          chosen = new Date(candidates[0]);
          chosen.setDate(chosen.getDate() + 1);
        }
        if (chosen) {
          target = chosen;
          reminderTime = `${String(chosen.getHours()).padStart(2, "0")}:${String(
            chosen.getMinutes(),
          ).padStart(2, "0")}`;
        }
      }
    }
  }

  if (!target) return null;
  return {
    scheduledFor: toDateKey(target),
    reminderTime,
    cleanedText: original,
  };
}
