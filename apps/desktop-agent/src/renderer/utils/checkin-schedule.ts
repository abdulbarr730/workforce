function clockTimeToTimestamp(
  time: string | undefined,
  nowMs: number,
): number | null {
  if (!time) return null;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const date = new Date(nowMs);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

export { clockTimeToTimestamp };

export function calculateNextCheckinAt({
  loginTimeMs,
  intervalMinutes,
  customTimes,
  shiftEndTime,
  nowMs = Date.now(),
}: {
  loginTimeMs: number;
  intervalMinutes: number;
  customTimes: string[];
  shiftEndTime?: string;
  nowMs?: number;
}): number | null {
  const shiftEndMs = clockTimeToTimestamp(shiftEndTime, nowMs);
  if (shiftEndMs !== null && nowMs >= shiftEndMs) return null;

  const candidates: number[] = [];

  customTimes.forEach((time) => {
    const candidate = clockTimeToTimestamp(time, nowMs);
    if (
      candidate !== null &&
      candidate > nowMs &&
      (shiftEndMs === null || candidate <= shiftEndMs)
    ) {
      candidates.push(candidate);
    }
  });

  if (intervalMinutes > 0) {
    const intervalMs = intervalMinutes * 60 * 1000;
    const elapsedMs = Math.max(0, nowMs - loginTimeMs);
    const nextIndex = Math.max(1, Math.floor(elapsedMs / intervalMs) + 1);
    const candidate = loginTimeMs + nextIndex * intervalMs;
    if (shiftEndMs === null || candidate <= shiftEndMs) {
      candidates.push(candidate);
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : null;
}
