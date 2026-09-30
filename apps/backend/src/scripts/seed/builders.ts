/**
 * Small deterministic builders shared by the dev seed and the test suite.
 * Keep them free of DB access so tests can use them directly.
 */
import { randomUUID } from "node:crypto";

export const COMPANY_ID = "PROSYNC_INFOTECH_PVT_LTD";

/** mulberry32: tiny seeded PRNG so the seed produces the same data each run. */
export const createRng = (seed: number) => {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (probability: number) => next() < probability,
  };
};
export type Rng = ReturnType<typeof createRng>;

/** A wall-clock time on a business date in IST, e.g. istAt("2026-09-30", "10:05"). */
export const istAt = (date: string, clock: string, extraSeconds = 0) => {
  const [h, m] = clock.split(":").map(Number);
  const base = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000+05:30`);
  return new Date(base.getTime() + extraSeconds * 1000);
};

export const clockPlus = (clock: string, minutes: number) => {
  const [h, m] = clock.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** YYYY-MM-DD `offset` days from `date` (calendar math, timezone-free). */
export const addDays = (date: string, offset: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const weekdayOf = (date: string) =>
  ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][
    new Date(`${date}T12:00:00Z`).getUTCDay()
  ];

export const WORK_APPS = [
  { app: "Visual Studio Code", titles: ["attendance.service.ts", "README.md", "dashboard.tsx"] },
  { app: "Google Chrome", titles: ["Jira - Sprint board", "Gmail - Inbox", "Google Docs - Plan"] },
  { app: "Slack", titles: ["#general", "#engineering", "Direct message"] },
  { app: "Microsoft Excel", titles: ["Q3 Sales.xlsx", "Leads.xlsx"] },
  { app: "Microsoft Teams", titles: ["Daily standup", "Chat"] },
] as const;

export const deviceMetaFor = (employeeId: string) => ({
  hostname: `${employeeId.toLowerCase().replace(/_/g, "-")}-laptop`,
  os: "Windows 11",
  platform: "win32",
  agentVersion: "1.3.1",
});

export type TelemetryEvent = {
  eventId: string;
  employeeId: string;
  companyId: string;
  deviceId: string;
  sessionId: string;
  type: string;
  source: "DESKTOP_AGENT";
  timestamp: Date;
  metadata: Record<string, unknown>;
};

export type WorkdayPlan = {
  employeeId: string;
  deviceId: string;
  date: string;
  loginClock: string; // "HH:MM" IST
  logoutClock: string | null; // null = still working (no LOGOUT yet)
  breaks?: Array<{ startClock: string; minutes: number }>;
  idle?: Array<{ startClock: string; minutes: number }>;
  /** Stop generating at this instant (used for "today"). */
  until?: Date;
};

/**
 * Builds the telemetry a real desktop agent sends for one working day:
 * LOGIN + SESSION_START, USER_ACTIVITY about every 2 minutes, an ACTIVE_WINDOW
 * every 5 minutes (switching apps), HEARTBEAT every 15 minutes, breaks, idle
 * periods and a LOGOUT. Activity pauses during breaks and idle time.
 */
export const buildWorkdayEvents = (plan: WorkdayPlan, rng: Rng): TelemetryEvent[] => {
  const sessionId = randomUUID();
  const meta = deviceMetaFor(plan.employeeId);
  const start = istAt(plan.date, plan.loginClock);
  const plannedEnd = plan.logoutClock ? istAt(plan.date, plan.logoutClock) : null;
  const hardStop = plan.until ?? plannedEnd ?? istAt(plan.date, "23:00");
  const end = plannedEnd && plannedEnd < hardStop ? plannedEnd : hardStop;
  if (end <= start) return [];

  const pauses = [
    ...(plan.breaks || []).map((b) => ({ kind: "BREAK" as const, ...b })),
    ...(plan.idle || []).map((b) => ({ kind: "IDLE" as const, ...b })),
  ].map((p) => ({
    ...p,
    from: istAt(plan.date, p.startClock),
    to: istAt(plan.date, clockPlus(p.startClock, p.minutes)),
  }));
  const paused = (at: Date) => pauses.some((p) => at >= p.from && at < p.to);

  const events: TelemetryEvent[] = [];
  const push = (type: string, timestamp: Date, metadata: Record<string, unknown> = {}) => {
    if (timestamp > end && type !== "LOGOUT") return;
    events.push({
      eventId: randomUUID(),
      employeeId: plan.employeeId,
      companyId: COMPANY_ID,
      deviceId: plan.deviceId,
      sessionId,
      type,
      source: "DESKTOP_AGENT",
      timestamp,
      metadata: { ...meta, ...metadata, clientTimestamp: timestamp.toISOString() },
    });
  };

  push("SESSION_START", new Date(start.getTime() - 60_000));
  push("LOGIN", start, { reason: "DESKTOP_AGENT_LOGIN" });
  // Signing in is itself keyboard input; attendance uses the first input as login.
  push("USER_ACTIVITY", start);

  let current = rng.pick(WORK_APPS);
  for (let t = start.getTime() + 60_000; t < end.getTime(); t += 60_000) {
    const at = new Date(t);
    const minute = Math.round((t - start.getTime()) / 60_000);
    if (minute % 15 === 0) push("HEARTBEAT", at);
    if (paused(at)) continue;
    if (minute % 5 === 0) {
      if (rng.chance(0.4)) current = rng.pick(WORK_APPS);
      push("ACTIVE_WINDOW", at, {
        app: current.app,
        title: rng.pick(current.titles),
        isBrowser: current.app === "Google Chrome",
        durationSeconds: 300,
      });
    }
    if (minute % 2 === 0) push("USER_ACTIVITY", new Date(t + rng.int(0, 40) * 1000));
  }

  for (const p of pauses) {
    if (p.from >= end) continue;
    if (p.kind === "BREAK") {
      push("BREAK_START", p.from, { reason: "Lunch" });
      if (p.to < end) push("BREAK_END", p.to);
    } else {
      push("IDLE_START", p.from, { idleSeconds: 300 });
      if (p.to < end) {
        push("IDLE_END", p.to, { idleSeconds: p.minutes * 60 });
        push("IDLE_RESPONSE", new Date(p.to.getTime() + 5_000), { isWorking: true, reason: "Meeting" });
      }
    }
  }

  if (plannedEnd && plannedEnd <= hardStop) {
    push("LOGOUT", plannedEnd, { reason: "USER_LOGOUT" });
    push("SESSION_END", new Date(plannedEnd.getTime() + 1_000));
  }

  return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
};
