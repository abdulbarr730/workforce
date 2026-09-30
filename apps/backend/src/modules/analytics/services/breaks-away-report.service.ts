import exceljs from "exceljs";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { User } from "../../users/model/user.model";
import { UserRole } from "../../../_shared/constants";

type Entry = {
  employeeId: string;
  date: string; // IST day the break / away work started
  kind: "BREAK" | "AWAY";
  start: Date;
  end: Date;
  seconds: number;
  reason: string;
  source: string;
};

const IST = "Asia/Kolkata";
const istDate = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(value);
const istTime = (value?: Date | string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        timeZone: IST,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const hm = (minutes: number) => {
  const m = Math.round(minutes);
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
};
/** Average clock time (minutes after IST midnight) → "09:52". */
const averageClock = (minutesList: number[]) => {
  if (!minutesList.length) return "—";
  const avg = Math.round(minutesList.reduce((s, m) => s + m, 0) / minutesList.length);
  const h = Math.floor(avg / 60);
  const m = avg % 60;
  const suffix = h >= 12 ? "pm" : "am";
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
};
const istMinutes = (value: Date | string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return h * 60 + m;
};

/**
 * Every break and away-work period in a date range, the way attendance counts
 * them: Break / Away-work buttons (start → end) and idle-popup answers
 * ("not working" = break, "working away" = away work). Identical repeats of
 * the same period are counted once.
 */
async function collectEntries(startDate: string, endDate: string, employeeIds: string[]) {
  const events = await ActivityEvent.find({
    employeeId: { $in: employeeIds },
    invalidated: { $ne: true },
    timestamp: {
      $gte: new Date(`${startDate}T00:00:00+05:30`),
      $lte: new Date(`${endDate}T23:59:59.999+05:30`),
    },
    type: {
      $in: ["BREAK_START", "BREAK_END", "AWAY_WORK_START", "AWAY_WORK_END", "IDLE_RESPONSE"] as any[],
    },
  })
    .select("employeeId type timestamp metadata")
    .sort({ employeeId: 1, timestamp: 1 })
    .lean();

  const entries: Entry[] = [];
  const seen = new Set<string>();
  const push = (entry: Entry) => {
    const key = `${entry.employeeId}|${entry.kind}|${Math.round(entry.start.getTime() / 60000)}|${Math.round(entry.end.getTime() / 60000)}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  const open = new Map<string, { break?: any; away?: any }>();
  for (const event of events as any[]) {
    const state = open.get(event.employeeId) || {};
    const meta = event.metadata || {};
    const at = new Date(event.timestamp);
    if (event.type === "BREAK_START") {
      state.break = { start: at, reason: meta.reason || "Break" };
    } else if (event.type === "BREAK_END" && state.break) {
      const seconds = Math.max(1, Number(meta.durationSeconds) || (at.getTime() - state.break.start.getTime()) / 1000);
      push({
        employeeId: event.employeeId,
        date: istDate(state.break.start),
        kind: "BREAK",
        start: state.break.start,
        end: at,
        seconds,
        reason: meta.reason || state.break.reason,
        source: "Break button",
      });
      state.break = undefined;
    } else if (event.type === "AWAY_WORK_START") {
      state.away = { start: at, reason: meta.reason || "Away work" };
    } else if (event.type === "AWAY_WORK_END" && state.away) {
      const seconds = Math.max(1, (at.getTime() - state.away.start.getTime()) / 1000);
      push({
        employeeId: event.employeeId,
        date: istDate(state.away.start),
        kind: "AWAY",
        start: state.away.start,
        end: at,
        seconds,
        reason: meta.reason || state.away.reason,
        source: "Away-work button",
      });
      state.away = undefined;
    } else if (event.type === "IDLE_RESPONSE") {
      const seconds = Math.max(
        1,
        Number(meta.durationSeconds) || Number(meta.idleSeconds) || Number(meta.idleMinutes || 0) * 60,
      );
      const end = meta.to ? new Date(meta.to) : at;
      const start = meta.from ? new Date(meta.from) : new Date(end.getTime() - seconds * 1000);
      push({
        employeeId: event.employeeId,
        date: istDate(start),
        kind: meta.isWorking ? "AWAY" : "BREAK",
        start,
        end,
        seconds,
        reason: meta.reason || (meta.isWorking ? "Working away from the computer" : "Not working"),
        source: meta.isWorking ? "Idle popup: working" : "Idle popup: not working",
      });
    }
    open.set(event.employeeId, state);
  }
  return entries.filter((e) => e.date >= startDate && e.date <= endDate);
}

const header = (sheet: exceljs.Worksheet) => {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
};

/**
 * Adds three sheets: per employee (range totals + average login/logout), per
 * day (login, logout, number and time of breaks and away work) and every
 * break / away-work entry.
 */
export async function addBreaksAwaySheets(
  workbook: exceljs.Workbook,
  startDate: string,
  endDate: string,
  employeeId?: string,
) {
  const users = await User.find({
    role: { $ne: UserRole.SUPER_ADMIN },
    ...(employeeId ? { employeeId } : { isActive: true }),
  })
    .select("employeeId name")
    .sort({ name: 1 })
    .lean();
  const ids = users.map((u: any) => String(u.employeeId)).filter(Boolean);
  const nameOf = new Map(users.map((u: any) => [String(u.employeeId), String(u.name)]));

  const [entries, records] = await Promise.all([
    collectEntries(startDate, endDate, ids),
    AttendanceRecord.find({
      employeeId: { $in: ids },
      date: { $gte: startDate, $lte: endDate },
    })
      .select("employeeId date attendanceStatus leavePaid loginTime logoutTime breakMinutes awayWorkingMinutes")
      .sort({ date: 1 })
      .lean(),
  ]);

  const key = (employeeId: string, date: string) => `${employeeId}|${date}`;
  const perDay = new Map<string, { breaks: Entry[]; away: Entry[] }>();
  for (const entry of entries) {
    const k = key(entry.employeeId, entry.date);
    const bucket = perDay.get(k) || { breaks: [], away: [] };
    (entry.kind === "BREAK" ? bucket.breaks : bucket.away).push(entry);
    perDay.set(k, bucket);
  }
  const recordOf = new Map(
    (records as any[]).map((r) => [key(r.employeeId, String(r.date).slice(0, 10)), r]),
  );
  const minutesOf = (list: Entry[]) => list.reduce((s, e) => s + e.seconds / 60, 0);
  const statusText = (r: any) =>
    !r
      ? ""
      : r.attendanceStatus === "LEAVE" && r.leavePaid === true
        ? "Paid leave"
        : r.attendanceStatus === "LEAVE" && r.leavePaid === false
          ? "Unpaid leave"
          : String(r.attendanceStatus || "").replace(/_/g, " ");

  // Days to list: any day with attendance or a break / away entry.
  const dayKeys = new Set<string>([...recordOf.keys(), ...perDay.keys()]);
  const days = Array.from(dayKeys)
    .map((k) => {
      const [employeeId, date] = k.split("|");
      return { employeeId, date };
    })
    .filter((d) => nameOf.has(d.employeeId))
    .sort((a, b) =>
      a.date === b.date
        ? (nameOf.get(a.employeeId) || "").localeCompare(nameOf.get(b.employeeId) || "")
        : a.date.localeCompare(b.date),
    );

  // ── Per employee ──
  const summary = workbook.addWorksheet("Breaks & Away - Employees");
  summary.columns = [
    { header: "Employee", key: "name", width: 26 },
    { header: "Employee ID", key: "id", width: 16 },
    { header: "Days with login", key: "days", width: 15 },
    { header: "Average login", key: "avgLogin", width: 14 },
    { header: "Average logout", key: "avgLogout", width: 15 },
    { header: "Number of breaks", key: "breaks", width: 17 },
    { header: "Total break time", key: "breakTime", width: 16 },
    { header: "Number of away-work", key: "away", width: 20 },
    { header: "Total away-work time", key: "awayTime", width: 20 },
  ];
  for (const user of users as any[]) {
    const own = (records as any[]).filter((r) => r.employeeId === user.employeeId);
    const logins = own.filter((r) => r.loginTime).map((r) => istMinutes(r.loginTime));
    const logouts = own.filter((r) => r.logoutTime).map((r) => istMinutes(r.logoutTime));
    const ownEntries = entries.filter((e) => e.employeeId === user.employeeId);
    const breaks = ownEntries.filter((e) => e.kind === "BREAK");
    const away = ownEntries.filter((e) => e.kind === "AWAY");
    summary.addRow({
      name: user.name,
      id: user.employeeId,
      days: logins.length,
      avgLogin: averageClock(logins),
      avgLogout: averageClock(logouts),
      breaks: breaks.length,
      breakTime: hm(minutesOf(breaks)),
      away: away.length,
      awayTime: hm(minutesOf(away)),
    });
  }
  header(summary);

  // ── Per day ──
  const daily = workbook.addWorksheet("Breaks & Away - Daily");
  daily.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Employee", key: "name", width: 26 },
    { header: "Status", key: "status", width: 14 },
    { header: "Login", key: "login", width: 10 },
    { header: "Logout", key: "logout", width: 10 },
    { header: "Breaks", key: "breaks", width: 9 },
    { header: "Break time", key: "breakTime", width: 12 },
    { header: "Break times", key: "breakList", width: 44 },
    { header: "Away work", key: "away", width: 11 },
    { header: "Away-work time", key: "awayTime", width: 15 },
    { header: "Away-work times", key: "awayList", width: 44 },
  ];
  const list = (items: Entry[]) =>
    items.map((e) => `${istTime(e.start)}–${istTime(e.end)} (${hm(e.seconds / 60)})`).join(", ");
  for (const day of days) {
    const record = recordOf.get(key(day.employeeId, day.date));
    const bucket = perDay.get(key(day.employeeId, day.date)) || { breaks: [], away: [] };
    daily.addRow({
      date: day.date,
      name: nameOf.get(day.employeeId),
      status: statusText(record),
      login: istTime(record?.loginTime),
      logout: istTime(record?.logoutTime),
      breaks: bucket.breaks.length,
      breakTime: hm(minutesOf(bucket.breaks)),
      breakList: list(bucket.breaks),
      away: bucket.away.length,
      awayTime: hm(minutesOf(bucket.away)),
      awayList: list(bucket.away),
    });
  }
  header(daily);

  // ── Every entry ──
  const each = workbook.addWorksheet("Breaks & Away - Each Entry");
  each.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Employee", key: "name", width: 26 },
    { header: "Type", key: "type", width: 11 },
    { header: "From", key: "from", width: 10 },
    { header: "To", key: "to", width: 10 },
    { header: "Minutes", key: "minutes", width: 10 },
    { header: "Reason", key: "reason", width: 40 },
    { header: "Recorded by", key: "source", width: 24 },
  ];
  entries
    .filter((e) => nameOf.has(e.employeeId))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .forEach((e) => {
      const row = each.addRow({
        date: e.date,
        name: nameOf.get(e.employeeId),
        type: e.kind === "BREAK" ? "Break" : "Away work",
        from: istTime(e.start),
        to: istTime(e.end),
        minutes: Math.round(e.seconds / 60),
        reason: e.reason,
        source: e.source,
      });
      row.getCell("type").font = { color: { argb: e.kind === "BREAK" ? "FFB45309" : "FF0F766E" } };
    });
  header(each);
}
