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

const toDateKey = (date: Date) => date.toLocaleDateString("en-CA");

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

export function parseNaturalSchedule(
  text: string,
  base = new Date(),
): NaturalSchedule | null {
  const original = text.trim();
  if (!original) return null;

  let target: Date | null = null;
  const lower = original.toLowerCase();
  const consumed: string[] = [];

  const todayMatch = lower.match(/\b(today)\b/);
  if (todayMatch) {
    target = new Date(base);
    consumed.push(todayMatch[0]);
  }

  const tomorrowMatch = lower.match(/\b(tomorrow|tmrw|tmr)\b/);
  if (tomorrowMatch) {
    target = new Date(base);
    target.setDate(target.getDate() + 1);
    consumed.push(tomorrowMatch[0]);
  }

  if (!target) {
    const weekdayMatch = lower.match(
      /\b(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/,
    );
    if (weekdayMatch) {
      const wanted = WEEKDAY_INDEX[weekdayMatch[1]];
      if (wanted !== undefined) {
        target = new Date(base);
        const current = target.getDay();
        let diff = wanted - current;
        if (diff <= 0) diff += 7;
        target.setDate(target.getDate() + diff);
        consumed.push(weekdayMatch[0]);
      }
    }
  }

  const timeMatch = lower.match(
    /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s*)?([01]?\d|2[0-3]):([0-5]\d)\b/,
  );
  let reminderTime = "";
  if (timeMatch) {
    reminderTime = timeMatch[1]
      ? toTime(timeMatch[1], timeMatch[2], timeMatch[3])
      : toTime(timeMatch[4], timeMatch[5]);
    consumed.push(timeMatch[0]);
  }

  if (!target && reminderTime) {
    target = new Date(base);
  }
  if (!target) return null;

  let cleanedText = original;
  for (const part of consumed.sort((a, b) => b.length - a.length)) {
    cleanedText = cleanedText.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), " ");
  }
  cleanedText = cleanedText
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\b(at)\s*$/i, "")
    .trim();

  return {
    scheduledFor: toDateKey(target),
    reminderTime,
    cleanedText: cleanedText || original,
  };
}

