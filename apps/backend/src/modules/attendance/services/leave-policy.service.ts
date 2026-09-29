import { AppError } from "../../../shared/utils/app-error";
import { Holiday } from "../model/holiday.model";
import { LeaveRequest } from "../model/leave-request.model";
import {
  LeaveAllowance,
  LeaveBalanceSnapshot,
  LeaveBlock,
  LeavePolicy,
} from "../model/leave-policy.model";
import { User } from "../../users/model/user.model";
import { datesBetween, toDateKey, todayKey } from "./request-rules.service";

export const HALF_DAY_CODE = "HALF_DAY";

export type LeaveTypeConfig = {
  code: string;
  name: string;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  /** Unpaid types (e.g. Unpaid Leave) never use the paid balance. */
  isPaid: boolean;
  isActive: boolean;
};

type RolloverChange = { from: string; enabled: boolean; at?: Date; byName?: string | null };

/** A monthly / yearly limit that applies from `from` (YYYY-MM) on. */
type LimitChange = {
  from: string;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  at?: Date;
  byName?: string | null;
};

const readLimitHistory = (raw: any): LimitChange[] =>
  (Array.isArray(raw) ? raw : [])
    .map((change: any) => ({
      from: String(change.from),
      monthlyLimit: change.monthlyLimit ?? null,
      yearlyLimit: change.yearlyLimit ?? null,
      at: change.at,
      byName: change.byName || null,
    }))
    .sort((a, b) => a.from.localeCompare(b.from));

/**
 * The limit in force in `month`: the latest change made in or before that
 * month. Months before the first recorded change keep the original limit.
 */
const limitAt = (
  history: LimitChange[],
  month: string,
  key: "monthlyLimit" | "yearlyLimit",
  current: number | null,
) => {
  if (!history.length) return current;
  let value = history[0][key];
  for (const change of history) {
    if (change.from <= month) value = change[key];
  }
  return value;
};

type TypeLimitChange = LimitChange & { code: string };

const readTypeHistory = (raw: any) => {
  const byCode = new Map<string, LimitChange[]>();
  for (const change of Array.isArray(raw) ? raw : []) {
    const code = normalizeTypeCode(change.code);
    if (!code) continue;
    const list = byCode.get(code) || [];
    list.push({
      from: String(change.from),
      monthlyLimit: change.monthlyLimit ?? null,
      yearlyLimit: change.yearlyLimit ?? null,
      at: change.at,
      byName: change.byName || null,
    });
    byCode.set(code, list);
  }
  byCode.forEach((list) => list.sort((a, b) => a.from.localeCompare(b.from)));
  return byCode;
};

/** Records each leave type's limit change from this month on. */
const withTypeLimitChanges = (
  history: Map<string, LimitChange[]>,
  previous: Map<string, { monthlyLimit: number | null; yearlyLimit: number | null }>,
  next: Map<string, { monthlyLimit: number | null; yearlyLimit: number | null }>,
  byName: string | null,
): TypeLimitChange[] => {
  const codes = new Set([...history.keys(), ...previous.keys(), ...next.keys()]);
  const out: TypeLimitChange[] = [];
  for (const code of codes) {
    let list = history.get(code) || [];
    const before = previous.get(code);
    const after = next.get(code);
    // Only a type that existed before and still exists has a change to record;
    // a brand-new type simply uses its limit for every month.
    if (before && after) list = withLimitChange(list, before, after, byName);
    out.push(...list.map((change) => ({ ...change, code })));
  }
  return out;
};

/** Records a limit change from this month on (earlier months unchanged). */
const withLimitChange = (
  history: LimitChange[],
  previous: { monthlyLimit: number | null; yearlyLimit: number | null },
  next: { monthlyLimit: number | null; yearlyLimit: number | null },
  byName: string | null,
) => {
  if (
    previous.monthlyLimit === next.monthlyLimit &&
    previous.yearlyLimit === next.yearlyLimit
  ) {
    return history;
  }
  const from = currentMonth();
  const list = history.length
    ? [...history]
    : [{ from: "0000-00", ...previous, at: new Date(), byName: null }];
  // Several changes in one month: the last one counts.
  const kept = list.filter((change) => change.from !== from);
  kept.push({ from, ...next, at: new Date(), byName });
  return kept.sort((a, b) => a.from.localeCompare(b.from));
};

export type LeavePolicyConfig = {
  types: LeaveTypeConfig[];
  /** Paid leave earned every month, all types together (null = no limit). */
  totalMonthlyLimit: number | null;
  /**
   * Floating paid leave per calendar year (floatingOnTop) or the yearly cap
   * on all paid leave (not on top). Never rolls over.
   */
  totalYearlyLimit: number | null;
  /** true: floating leave is extra, on top of the monthly leave. */
  floatingOnTop: boolean;
  /** Unused monthly leave rolls over to the next month (and year). */
  rolloverEnabled: boolean;
  /** When rollover was switched on/off, by month ("YYYY-MM"). */
  rolloverHistory: RolloverChange[];
  /** First month monthly leave is earned (set when a monthly limit is first saved). */
  accrualStartMonth: string | null;
  /** Limit changes by month; earlier months keep their old limits. */
  limitHistory: LimitChange[];
  /** Each leave type's limit changes by month. */
  typeLimitHistory: Map<string, LimitChange[]>;
};

const type = (code: string, name: string, isPaid = true): LeaveTypeConfig => ({
  code,
  name,
  monthlyLimit: null,
  yearlyLimit: null,
  isPaid,
  isActive: true,
});

// The leave types that existed before types became configurable.
const DEFAULT_TYPES: LeaveTypeConfig[] = [
  type("CASUAL", "Casual Leave"),
  type("SICK", "Sick Leave"),
  type("ANNUAL", "Annual Leave"),
  type("EMERGENCY", "Emergency Leave"),
  type("UNPAID", "Unpaid Leave", false),
  type("PAID LEAVE", "Paid Leave"),
  type(HALF_DAY_CODE, "Half Day"),
];

const WEEKDAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
const DEFAULT_WORKING_DAYS = WEEKDAYS.slice(1); // Mon-Sat

export const normalizeTypeCode = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

const toLimit = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 2) / 2; // whole or half days
};

const toFlag = (value: unknown): boolean | null =>
  value === true || value === "true"
    ? true
    : value === false || value === "false"
      ? false
      : null;

const currentMonth = () => todayKey().slice(0, 7);

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

const cleanType = (raw: any): LeaveTypeConfig => {
  const code = normalizeTypeCode(raw?.code || raw?.name);
  return {
    code,
    name: String(raw?.name || code).trim(),
    monthlyLimit: toLimit(raw?.monthlyLimit),
    yearlyLimit: toLimit(raw?.yearlyLimit),
    isPaid: raw?.isPaid === undefined ? code !== "UNPAID" : raw.isPaid !== false,
    isActive: raw?.isActive !== false,
  };
};

export async function getLeavePolicy(): Promise<LeavePolicyConfig> {
  let policy: any = await LeavePolicy.findOne({ key: "default" }).lean();
  if (!policy) {
    policy = await LeavePolicy.findOneAndUpdate(
      { key: "default" },
      { $setOnInsert: { key: "default", types: DEFAULT_TYPES } },
      { upsert: true, returnDocument: "after" },
    ).lean();
  }
  const types: LeaveTypeConfig[] = (policy?.types || []).map(cleanType);
  // Half day is part of the attendance rules and always exists.
  if (!types.some((item) => item.code === HALF_DAY_CODE)) {
    types.push(type(HALF_DAY_CODE, "Half Day"));
  }
  return {
    types,
    totalMonthlyLimit: toLimit(policy?.totalMonthlyLimit),
    totalYearlyLimit: toLimit(policy?.totalYearlyLimit),
    floatingOnTop: policy?.floatingOnTop === true,
    rolloverEnabled: policy?.rolloverEnabled !== false, // on by default
    rolloverHistory: (policy?.rolloverHistory || []).map((change: any) => ({
      from: String(change.from),
      enabled: change.enabled !== false,
      at: change.at,
      byName: change.byName || null,
    })),
    accrualStartMonth: policy?.accrualStartMonth || null,
    limitHistory: readLimitHistory(policy?.limitHistory),
    typeLimitHistory: readTypeHistory(policy?.typeLimitHistory),
  };
}

/**
 * Saves the admin's leave settings. A type left out of the list is deleted
 * from the settings (Half Day always stays); leave requests already made with
 * it keep their type name. Switching rollover on/off applies from the current
 * month; leave rolled over before that stays.
 */
export async function saveLeavePolicy(
  input: {
    types?: unknown;
    totalMonthlyLimit?: unknown;
    totalYearlyLimit?: unknown;
    floatingOnTop?: unknown;
    rolloverEnabled?: unknown;
  },
  actor: { employeeId?: string; name?: string },
) {
  if (!Array.isArray(input?.types)) {
    throw new AppError("Send the list of leave types.", 400);
  }
  const current = await getLeavePolicy();
  const seen = new Set<string>();
  const types: LeaveTypeConfig[] = [];
  for (const raw of input.types as any[]) {
    const clean = cleanType(raw);
    if (!clean.code || !String(raw?.name || "").trim()) {
      throw new AppError("Every leave type needs a name.", 400);
    }
    if (seen.has(clean.code)) {
      throw new AppError(`"${clean.name}" is listed twice.`, 400);
    }
    seen.add(clean.code);
    types.push(clean);
  }
  if (!seen.has(HALF_DAY_CODE)) types.push(type(HALF_DAY_CODE, "Half Day"));

  const totalMonthlyLimit = toLimit(input.totalMonthlyLimit);
  const rolloverFlag = toFlag(input.rolloverEnabled);
  const rolloverEnabled = rolloverFlag === null ? current.rolloverEnabled : rolloverFlag;
  const rolloverHistory = [...current.rolloverHistory];
  if (rolloverEnabled !== current.rolloverEnabled) {
    const from = currentMonth();
    // Several switches in one month: the last one counts.
    const kept = rolloverHistory.filter((change) => change.from !== from);
    kept.push({ from, enabled: rolloverEnabled, at: new Date(), byName: actor.name || null });
    rolloverHistory.splice(0, rolloverHistory.length, ...kept);
  }

  await LeavePolicy.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        types,
        totalMonthlyLimit,
        totalYearlyLimit: toLimit(input.totalYearlyLimit),
        floatingOnTop: toFlag(input.floatingOnTop) === true,
        rolloverEnabled,
        rolloverHistory,
        typeLimitHistory: withTypeLimitChanges(
          current.typeLimitHistory,
          new Map(current.types.map((t) => [t.code, { monthlyLimit: t.monthlyLimit, yearlyLimit: t.yearlyLimit }])),
          new Map(types.map((t) => [t.code, { monthlyLimit: t.monthlyLimit, yearlyLimit: t.yearlyLimit }])),
          actor.name || null,
        ),
        limitHistory: withLimitChange(
          current.limitHistory,
          { monthlyLimit: current.totalMonthlyLimit, yearlyLimit: current.totalYearlyLimit },
          { monthlyLimit: totalMonthlyLimit, yearlyLimit: toLimit(input.totalYearlyLimit) },
          actor.name || null,
        ),
        // Monthly leave is earned from the month a monthly limit is first set.
        accrualStartMonth:
          current.accrualStartMonth || (totalMonthlyLimit !== null ? currentMonth() : null),
        updatedBy: actor.employeeId || null,
        updatedByName: actor.name || null,
      },
    },
    { upsert: true },
  );
  return getLeavePolicy();
}

/** The policy with the employee's own limits applied (blank = default). */
export async function getEffectiveLimits(employeeId: string) {
  const [policy, allowance] = await Promise.all([
    getLeavePolicy(),
    LeaveAllowance.findOne({ employeeId }).lean(),
  ]);
  const own: any = allowance || {};
  const overrides = new Map(
    (own.limits || []).map((limit: any) => [normalizeTypeCode(limit.code), limit]),
  );
  const types = policy.types.map((item) => {
    const override: any = overrides.get(item.code);
    const monthly = toLimit(override?.monthlyLimit);
    const yearly = toLimit(override?.yearlyLimit);
    return {
      ...item,
      defaultMonthlyLimit: item.monthlyLimit,
      defaultYearlyLimit: item.yearlyLimit,
      monthlyLimit: monthly ?? item.monthlyLimit,
      yearlyLimit: yearly ?? item.yearlyLimit,
      hasOverride: monthly !== null || yearly !== null,
    };
  });
  const ownTotalMonthly = toLimit(own.totalMonthlyLimit);
  const ownTotalYearly = toLimit(own.totalYearlyLimit);
  const ownFloating = toFlag(own.floatingOnTop);
  const ownHistory = readLimitHistory(own.limitHistory);
  const ownTypeHistory = readTypeHistory(own.typeLimitHistory);
  const typeCurrent = new Map(policy.types.map((t) => [t.code, t]));
  // A leave type's limits as they were in a given month (own limit wins).
  const typeLimitAt = (code: string, month: string, key: "monthlyLimit" | "yearlyLimit") => {
    const override: any = overrides.get(code);
    return (
      limitAt(ownTypeHistory.get(code) || [], month, key, toLimit(override?.[key])) ??
      limitAt(
        policy.typeLimitHistory.get(code) || [],
        month,
        key,
        typeCurrent.get(code)?.[key] ?? null,
      )
    );
  };
  // Limits as they were in a given month (a person's own limit wins).
  const monthlyAt = (month: string) =>
    limitAt(ownHistory, month, "monthlyLimit", ownTotalMonthly) ??
    limitAt(policy.limitHistory, month, "monthlyLimit", policy.totalMonthlyLimit);
  const yearlyAt = (month: string) =>
    limitAt(ownHistory, month, "yearlyLimit", ownTotalYearly) ??
    limitAt(policy.limitHistory, month, "yearlyLimit", policy.totalYearlyLimit);
  const opening =
    own.opening && /^\d{4}-\d{2}$/.test(String(own.opening.asOfMonth || ""))
      ? {
          asOfMonth: String(own.opening.asOfMonth),
          monthlyCarried: toLimit(own.opening.monthlyCarried) ?? 0,
          floatingLeft: toLimit(own.opening.floatingLeft),
          setByName: own.opening.setByName || null,
          setAt: own.opening.setAt || null,
        }
      : null;
  return {
    policy,
    opening,
    monthlyAt,
    yearlyAt,
    typeLimitAt,
    ownLimitHistory: ownHistory,
    types,
    total: {
      monthlyLimit: ownTotalMonthly ?? policy.totalMonthlyLimit,
      yearlyLimit: ownTotalYearly ?? policy.totalYearlyLimit,
      floatingOnTop: ownFloating ?? policy.floatingOnTop,
      defaultMonthlyLimit: policy.totalMonthlyLimit,
      defaultYearlyLimit: policy.totalYearlyLimit,
      defaultFloatingOnTop: policy.floatingOnTop,
      ownFloatingOnTop: ownFloating,
      hasOverride:
        ownTotalMonthly !== null || ownTotalYearly !== null || ownFloating !== null,
    },
  };
}

export async function saveLeaveAllowance(
  employeeId: string,
  input: {
    limits?: unknown;
    totalMonthlyLimit?: unknown;
    totalYearlyLimit?: unknown;
    floatingOnTop?: unknown; // true / false / null (= company setting)
    /** Starting balance; null removes it, undefined leaves it unchanged. */
    opening?: { asOfMonth?: unknown; monthlyCarried?: unknown; floatingLeft?: unknown } | null;
  },
  actor: { employeeId?: string; name?: string },
) {
  let opening: Record<string, unknown> | null | undefined;
  if (input?.opening === null) {
    opening = null;
  } else if (input?.opening) {
    const asOfMonth = String(input.opening.asOfMonth || "");
    if (!/^\d{4}-\d{2}$/.test(asOfMonth)) {
      throw new AppError("Choose the month the starting balance applies from.", 400);
    }
    opening = {
      asOfMonth,
      monthlyCarried: toLimit(input.opening.monthlyCarried) ?? 0,
      floatingLeft: toLimit(input.opening.floatingLeft),
      setBy: actor.employeeId || null,
      setByName: actor.name || null,
      setAt: new Date(),
    };
  }
  const existing: any = await LeaveAllowance.findOne({ employeeId }).lean();
  const nextOwn = {
    monthlyLimit: toLimit(input?.totalMonthlyLimit),
    yearlyLimit: toLimit(input?.totalYearlyLimit),
  };
  const ownLimitHistory = withLimitChange(
    readLimitHistory(existing?.limitHistory),
    {
      monthlyLimit: toLimit(existing?.totalMonthlyLimit),
      yearlyLimit: toLimit(existing?.totalYearlyLimit),
    },
    nextOwn,
    actor.name || null,
  );
  const limits = Array.isArray(input?.limits) ? (input.limits as any[]) : [];
  const clean = limits
    .map((limit) => ({
      code: normalizeTypeCode(limit?.code),
      monthlyLimit: toLimit(limit?.monthlyLimit),
      yearlyLimit: toLimit(limit?.yearlyLimit),
    }))
    .filter((limit) => limit.code);
  // Per-type own limits: a missing entry means "use the default" (null).
  const policyNow = await getLeavePolicy();
  const ownTypeBefore = new Map(
    (existing?.limits || []).map((l: any) => [
      normalizeTypeCode(l.code),
      { monthlyLimit: toLimit(l.monthlyLimit), yearlyLimit: toLimit(l.yearlyLimit) },
    ]),
  );
  const ownTypeAfter = new Map(clean.map((l) => [l.code, { monthlyLimit: l.monthlyLimit, yearlyLimit: l.yearlyLimit }]));
  const blank = { monthlyLimit: null, yearlyLimit: null };
  const allCodes = policyNow.types.map((t) => t.code);
  const typeLimitHistory = withTypeLimitChanges(
    readTypeHistory(existing?.typeLimitHistory),
    new Map(allCodes.map((code) => [code, (ownTypeBefore.get(code) as any) || blank])),
    new Map(allCodes.map((code) => [code, ownTypeAfter.get(code) || blank])),
    actor.name || null,
  );
  await LeaveAllowance.findOneAndUpdate(
    { employeeId },
    {
      $set: {
        limits: clean,
        typeLimitHistory,
        totalMonthlyLimit: nextOwn.monthlyLimit,
        totalYearlyLimit: nextOwn.yearlyLimit,
        limitHistory: ownLimitHistory,
        floatingOnTop: toFlag(input?.floatingOnTop),
        ...(opening !== undefined ? { opening } : {}),
        updatedBy: actor.employeeId || null,
        updatedByName: actor.name || null,
      },
    },
    { upsert: true },
  );
  return getEffectiveLimits(employeeId);
}

type DayContext = { workingDays?: string[]; holidays?: Set<string> };

/**
 * The days of a leave that count: working days only (the employee's weekly
 * offs and company holidays are free). A half day is 0.5.
 */
export async function countedLeaveDates(
  employeeId: string,
  typeCode: string,
  startDate: string,
  endDate: string,
  context?: DayContext,
): Promise<Array<{ date: string; days: number }>> {
  const start = toDateKey(startDate);
  const end = toDateKey(endDate) || start;
  if (!start) return [];
  const dates = datesBetween(start, end);
  const workingDays =
    context?.workingDays ||
    ((await User.findOne({ employeeId }).select("workingDays").lean()) as any)
      ?.workingDays;
  const working =
    Array.isArray(workingDays) && workingDays.length
      ? workingDays
      : DEFAULT_WORKING_DAYS;
  const holidays =
    context?.holidays ||
    new Set(
      (
        await Holiday.find({
          date: { $gte: start, $lte: end },
          isActive: true,
          workingEmployeeIds: { $ne: employeeId },
        })
          .select("date")
          .lean()
      ).map((holiday: any) => String(holiday.date).slice(0, 10)),
    );
  const isHalf = normalizeTypeCode(typeCode) === HALF_DAY_CODE;
  return dates
    .filter((date) => {
      const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
      return working.includes(weekday) && !holidays.has(date);
    })
    .map((date) => ({ date, days: isHalf ? 0.5 : 1 }))
    .slice(0, isHalf ? 1 : undefined);
}

type LeaveLike = {
  _id?: unknown;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt?: Date | string;
};

/** Paid days are split by where they came from: monthly or floating leave. */
type Bucket = { paid: number; monthly: number; floating: number; unpaid: number; pending: number };
const emptyBucket = (): Bucket => ({ paid: 0, monthly: 0, floating: 0, unpaid: 0, pending: 0 });
type DaySplit = { monthly: number; floating: number; unpaid: number };
const addTo = (bucket: Bucket, split: DaySplit, pending: number) => {
  bucket.monthly += split.monthly;
  bucket.floating += split.floating;
  bucket.paid += split.monthly + split.floating;
  bucket.unpaid += split.unpaid;
  bucket.pending += pending;
};
const add = (map: Map<string, Bucket>, key: string, split: DaySplit, pending: number) => {
  const bucket = map.get(key) || emptyBucket();
  addTo(bucket, split, pending);
  map.set(key, bucket);
};
const room = (limit: number | null, used: number) =>
  limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);
const halfDays = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value * 2) / 2) : value;

export type LeaveSplit = { paid: number; monthly: number; floating: number; unpaid: number };

/** Whether a month's unused leave rolls over, given when rollover changed. */
const rolloverFor = (policy: LeavePolicyConfig, month: string) => {
  const history = [...policy.rolloverHistory].sort((a, b) => a.from.localeCompare(b.from));
  let enabled = history.length ? !history[0].enabled : policy.rolloverEnabled; // before first change
  for (const change of history) {
    if (change.from <= month) enabled = change.enabled;
  }
  return enabled;
};

/**
 * Works out an employee's leave month by month up to the end of `targetYear`:
 * which days are paid from monthly leave, which from floating leave, and which
 * are unpaid.
 *  - Monthly leave: `monthlyLimit` days are earned each month from the later
 *    of the policy start and the employee's joining month. With rollover on,
 *    unused days carry to the next month and into the next year; with it off
 *    (from the month it was switched off) that month's unused days lapse but
 *    days carried earlier stay. This month's days are used before carried ones.
 *  - Floating leave (floatingOnTop): extra yearly days, used after monthly
 *    leave; resets every calendar year (no rollover).
 *  - Not on top: the yearly number caps all paid leave in the year.
 *  - Each type's own monthly/yearly limits always apply.
 * Within a month, requests are taken first come, first served (approved and
 * pending both hold their place). Unpaid types are always unpaid. Re-worked
 * whenever asked, so cancelling or rejecting a request gives its days back.
 */
export async function allocateLeave(
  employeeId: string,
  targetYear: string,
  options: { extra?: LeaveLike; excludeLeaveId?: string } = {},
) {
  const limits = await getEffectiveLimits(employeeId);
  const { policy } = limits;
  const typeByCode = new Map(limits.types.map((item) => [item.code, item]));
  const { monthlyAt, yearlyAt } = limits;
  const everHadMonthly =
    limits.total.monthlyLimit !== null ||
    Boolean(policy.accrualStartMonth) ||
    policy.limitHistory.some((c) => c.monthlyLimit !== null) ||
    limits.ownLimitHistory.some((c) => c.monthlyLimit !== null);
  const onTop = limits.total.floatingOnTop;

  const user: any = await User.findOne({ employeeId })
    .select("workingDays createdAt")
    .lean();
  const joinMonth = user?.createdAt
    ? new Date(user.createdAt).toISOString().slice(0, 7)
    : null;
  // Carry-over only builds up from here. An admin-entered starting balance
  // decides the start (leave before it is already counted in that balance).
  const opening = limits.opening;
  const accrualStart =
    opening?.asOfMonth ??
    (!everHadMonthly
      ? null
      : [policy.accrualStartMonth || `${targetYear}-01`, joinMonth || "0000-00"].sort()[1]);
  const firstYear = Math.min(
    Number(targetYear),
    accrualStart ? Number(accrualStart.slice(0, 4)) : Number(targetYear),
  );
  const rangeStart = `${firstYear}-01-01`;
  const rangeEnd = `${targetYear}-12-31`;

  const leaves = (await LeaveRequest.find({
    employeeId,
    status: { $in: ["APPROVED", "PENDING"] },
    startDate: { $lte: `${rangeEnd}~` },
    endDate: { $gte: rangeStart },
  })
    .select("type startDate endDate status createdAt")
    .lean()) as unknown as LeaveLike[];
  const list = leaves
    .filter((leave) => !options.excludeLeaveId || String(leave._id) !== options.excludeLeaveId)
    .sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
    );
  const extra = options.extra ? { ...options.extra, createdAt: new Date() } : null;
  if (extra) list.push(extra);

  const holidays = new Set(
    (
      await Holiday.find({
        date: { $gte: rangeStart, $lte: rangeEnd },
        isActive: true,
        workingEmployeeIds: { $ne: employeeId },
      })
        .select("date")
        .lean()
    ).map((holiday: any) => String(holiday.date).slice(0, 10)),
  );
  const context = { workingDays: user?.workingDays, holidays };

  // Every counted day, grouped by month, in request order.
  type Item = { leave: LeaveLike; order: number; code: string; date: string; days: number; pending: number };
  const byMonth = new Map<string, Item[]>();
  for (let order = 0; order < list.length; order += 1) {
    const leave = list[order];
    const code = normalizeTypeCode(leave.type);
    const dates = await countedLeaveDates(employeeId, code, leave.startDate, leave.endDate, context);
    for (const { date, days } of dates) {
      if (date < rangeStart || date > rangeEnd) continue;
      const month = date.slice(0, 7);
      const items = byMonth.get(month) || [];
      items.push({ leave, order, code, date, days, pending: leave.status === "PENDING" ? 1 : 0 });
      byMonth.set(month, items);
    }
  }

  const typeMonth = new Map<string, Bucket>(); // `${code}|${YYYY-MM}`
  const typeYear = new Map<string, Bucket>(); // `${code}|${YYYY}`
  const totalMonth = new Map<string, Bucket>(); // YYYY-MM
  const totalYear = new Map<string, Bucket>(); // YYYY
  const monthInfo = new Map<string, MonthInfo>();
  const perLeave = new Map<string, LeaveSplit>();
  let extraResult = { paid: 0, monthly: 0, floating: 0, unpaid: 0, days: 0 };
  const credit = (leave: LeaveLike, split: DaySplit) => {
    const key = leave === extra ? "__extra__" : String(leave._id);
    const current = perLeave.get(key) || { paid: 0, monthly: 0, floating: 0, unpaid: 0 };
    current.monthly += split.monthly;
    current.floating += split.floating;
    current.paid += split.monthly + split.floating;
    current.unpaid += split.unpaid;
    perLeave.set(key, current);
  };

  let carry = 0;
  let openingUsed = 0; // yearly/floating days already used before the opening month
  for (let month = `${firstYear}-01`; month <= `${targetYear}-12`; month = nextMonth(month)) {
    const year = month.slice(0, 4);
    // The limits in force this month (a change applies from its month on).
    const M = monthlyAt(month);
    const F = yearlyAt(month);
    if (opening && month === opening.asOfMonth) {
      // Start from the admin's numbers.
      carry = opening.monthlyCarried;
      if (opening.floatingLeft !== null && F !== null) {
        const usedBefore = Math.max(0, F - opening.floatingLeft);
        openingUsed = usedBefore;
        const seed = totalYear.get(year) || emptyBucket();
        if (onTop) seed.floating += usedBefore;
        seed.paid += usedBefore;
        totalYear.set(year, seed);
      }
    }
    const beforeOpening = Boolean(opening && month < opening.asOfMonth);
    const earning = M !== null && accrualStart !== null && month >= accrualStart;
    let fresh = M === null ? 0 : earning ? M : 0;
    const carriedIn = carry;
    const items = (byMonth.get(month) || []).sort(
      (a, b) => a.order - b.order || a.date.localeCompare(b.date),
    );
    for (const item of items) {
      const config = typeByCode.get(item.code);
      const isPaidType = config ? config.isPaid : true;
      const split: DaySplit = { monthly: 0, floating: 0, unpaid: item.days };
      if (beforeOpening) {
        // Already reflected in the starting balance: shown as paid, uses nothing.
        if (isPaidType) {
          split.monthly = item.days;
          split.unpaid = 0;
        }
        const pendingDays = item.pending * item.days;
        add(typeMonth, `${item.code}|${month}`, split, pendingDays);
        add(totalMonth, month, split, pendingDays);
        credit(item.leave, split);
        continue;
      }
      if (isPaidType) {
        const tm = typeMonth.get(`${item.code}|${month}`) || emptyBucket();
        const ty = typeYear.get(`${item.code}|${year}`) || emptyBucket();
        const ay = totalYear.get(year) || emptyBucket();
        const typeRoom = Math.min(
          room(limits.typeLimitAt(item.code, month, "monthlyLimit"), tm.paid),
          room(limits.typeLimitAt(item.code, month, "yearlyLimit"), ty.paid),
        );
        const monthlyAvail = M === null ? Number.POSITIVE_INFINITY : fresh + carry;
        if (onTop) {
          split.monthly = halfDays(Math.min(item.days, typeRoom, monthlyAvail));
          split.floating = halfDays(
            Math.min(item.days - split.monthly, typeRoom - split.monthly, room(F, ay.floating)),
          );
        } else {
          split.monthly = halfDays(
            Math.min(item.days, typeRoom, monthlyAvail, room(F, ay.paid)),
          );
        }
        split.unpaid = item.days - split.monthly - split.floating;
        if (M !== null) {
          // This month's leave first, then what was carried over.
          const fromFresh = Math.min(split.monthly, fresh);
          fresh -= fromFresh;
          carry -= split.monthly - fromFresh;
        }
      }
      const pendingDays = item.pending * item.days;
      add(typeMonth, `${item.code}|${month}`, split, pendingDays);
      add(typeYear, `${item.code}|${year}`, split, pendingDays);
      add(totalMonth, month, split, pendingDays);
      add(totalYear, year, split, pendingDays);
      credit(item.leave, split);
    }
    const left = M === null ? 0 : fresh + carry;
    const rolls = earning && rolloverFor(policy, month);
    const rolledOver = rolls ? fresh : 0;
    monthInfo.set(month, { carriedIn, left, rolledOver, monthlyLimit: M, yearlyLimit: F });
    carry += rolledOver;
  }

  // Stored balances only describe real requests, not a preview.
  if (!extra) {
    void saveSnapshots(employeeId, targetYear, {
      onTop,
      openingMonth: opening?.asOfMonth ?? null,
      openingUsed,
      totalMonth,
      totalYear,
      monthInfo,
    }).catch(() => undefined);
  }

  const extraSplit = perLeave.get("__extra__");
  if (extraSplit) {
    extraResult = { ...extraSplit, days: extraSplit.paid + extraSplit.unpaid };
    perLeave.delete("__extra__");
  }
  return { limits, typeMonth, typeYear, totalMonth, totalYear, monthInfo, perLeave, extraResult };
}

type MonthInfo = {
  carriedIn: number;
  left: number;
  rolledOver: number;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
};

/** Saves the worked-out balance of each month of the year up to now. */
async function saveSnapshots(
  employeeId: string,
  year: string,
  data: {
    onTop: boolean;
    openingMonth: string | null;
    openingUsed: number;
    totalMonth: Map<string, Bucket>;
    totalYear: Map<string, Bucket>;
    monthInfo: Map<string, MonthInfo>;
  },
) {
  const lastMonth = currentMonth() < `${year}-12` ? currentMonth() : `${year}-12`;
  if (lastMonth < `${year}-01`) return;
  // Year-to-date: what was used before the opening balance, then each month
  // from the opening month on (earlier months are already inside the opening).
  const monthsOfYear = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const openingInYear = Boolean(data.openingMonth && data.openingMonth.startsWith(year));
  let ytd = openingInYear ? data.openingUsed : 0;
  const ops = [];
  for (const month of monthsOfYear) {
    if (month > lastMonth) break;
    const bucket = data.totalMonth.get(month) || emptyBucket();
    const info = data.monthInfo.get(month) || {
      carriedIn: 0,
      left: 0,
      rolledOver: 0,
      monthlyLimit: null,
      yearlyLimit: null,
    };
    const M = info.monthlyLimit;
    const F = info.yearlyLimit;
    const counted = !data.openingMonth || month >= data.openingMonth;
    if (counted) ytd += data.onTop ? bucket.floating : bucket.paid;
    ops.push({
      updateOne: {
        filter: { employeeId, month },
        update: {
          $set: {
            monthlyLimit: M,
            carriedIn: M === null ? 0 : info.carriedIn,
            monthlyUsed: bucket.monthly,
            monthlyLeft: M === null ? null : info.left,
            rolledOver: info.rolledOver,
            floatingOnTop: data.onTop,
            yearlyLimit: F,
            floatingUsed: bucket.floating,
            yearUsedToDate: Math.max(0, ytd),
            yearLeft: F === null ? null : Math.max(0, F - Math.max(0, ytd)),
            paidDays: bucket.paid,
            unpaidDays: bucket.unpaid,
            pendingDays: bucket.pending,
            computedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await LeaveBalanceSnapshot.bulkWrite(ops, { ordered: false });
}

/**
 * Monthly and yearly leave per employee: total paid leave first (earned this
 * month, carried over, used, left), then the split by type, with unpaid and
 * pending days.
 */
export async function getLeaveBalance(employeeId: string, month: string) {
  const year = month.slice(0, 4);
  const allocation = await allocateLeave(employeeId, year);
  const { limits } = allocation;
  const view = (bucket: Bucket, limit: number | null, used = bucket.paid) => ({
    paid: bucket.paid,
    monthly: bucket.monthly,
    floating: bucket.floating,
    unpaid: bucket.unpaid,
    pending: bucket.pending,
    left: limit === null ? null : Math.max(0, limit - used),
  });
  const monthTotal = allocation.totalMonth.get(month) || emptyBucket();
  const yearTotal = allocation.totalYear.get(year) || emptyBucket();
  const info = allocation.monthInfo.get(month);
  const onTop = limits.total.floatingOnTop;
  // The limits in force in the month being looked at.
  const M = limits.monthlyAt(month);
  const F = limits.yearlyAt(month);
  return {
    employeeId,
    month,
    year,
    total: {
      monthlyLimit: M,
      yearlyLimit: F,
      floatingOnTop: onTop,
      rolloverEnabled: limits.policy.rolloverEnabled,
      hasOverride: limits.total.hasOverride,
      opening: limits.opening,
      month: {
        ...view(monthTotal, M, monthTotal.monthly),
        // Monthly leave available this month = this month's + carried over.
        carriedIn: M === null ? 0 : info?.carriedIn ?? 0,
        left: M === null ? null : info?.left ?? M,
      },
      year: view(
        yearTotal,
        F,
        onTop ? yearTotal.floating : yearTotal.paid,
      ),
    },
    types: limits.types.map((item) => ({
      code: item.code,
      name: item.name,
      isPaid: item.isPaid,
      isActive: item.isActive,
      hasOverride: item.hasOverride,
      monthlyLimit: limits.typeLimitAt(item.code, month, "monthlyLimit"),
      yearlyLimit: limits.typeLimitAt(item.code, month, "yearlyLimit"),
      month: view(
        allocation.typeMonth.get(`${item.code}|${month}`) || emptyBucket(),
        limits.typeLimitAt(item.code, month, "monthlyLimit"),
      ),
      year: view(
        allocation.typeYear.get(`${item.code}|${year}`) || emptyBucket(),
        limits.typeLimitAt(item.code, month, "yearlyLimit"),
      ),
    })),
  };
}

/** Monthly / floating / unpaid days of each given leave (admin lists, exports, payroll). */
export async function paidSplitFor(
  leaves: Array<{ _id: unknown; employeeId: string; startDate: string; endDate?: string }>,
) {
  const wanted = new Set(leaves.map((leave) => String(leave._id)));
  const lastYear = new Map<string, number>();
  for (const leave of leaves) {
    const end = Number((toDateKey(leave.endDate) || toDateKey(leave.startDate)).slice(0, 4));
    if (!end) continue;
    lastYear.set(leave.employeeId, Math.max(lastYear.get(leave.employeeId) || 0, end));
  }
  const result = new Map<string, LeaveSplit>();
  for (const [employeeId, year] of lastYear) {
    const allocation = await allocateLeave(employeeId, String(year));
    allocation.perLeave.forEach((split, id) => {
      if (wanted.has(id)) result.set(id, split);
    });
  }
  return result;
}

/** Active blocks that stop this employee requesting leave on these dates. */
export async function findBlocksFor(
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  return LeaveBlock.find({
    isActive: true,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
    $or: [{ scope: "ALL" }, { scope: "EMPLOYEES", employeeIds: employeeId }],
  }).lean();
}

/**
 * Checks a new/edited leave request: the type must exist and be available and
 * no day may be blocked. Going over the balance is allowed: those days are
 * unpaid. Returns how many days will be paid and unpaid.
 */
export async function assertLeaveAllowed(params: {
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  excludeLeaveId?: string;
}) {
  const code = normalizeTypeCode(params.type);
  const policy = await getLeavePolicy();
  const config = policy.types.find((item) => item.code === code);
  if (!config || !config.isActive) {
    throw new AppError("This leave type is not available. Choose another type.", 400);
  }

  const blocks = await findBlocksFor(params.employeeId, params.startDate, params.endDate);
  if (blocks.length) {
    const block: any = blocks[0];
    const when =
      block.startDate === block.endDate
        ? block.startDate
        : `${block.startDate} to ${block.endDate}`;
    throw new AppError(
      `Leave cannot be requested on ${when}${block.reason ? ` (${block.reason})` : ""}.`,
      400,
    );
  }

  return previewLeave(params);
}

/** How many of the requested days would be paid (monthly / floating) or unpaid now. */
export async function previewLeave(params: {
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  excludeLeaveId?: string;
}) {
  const start = toDateKey(params.startDate);
  const end = toDateKey(params.endDate) || start;
  if (!start) throw new AppError("Choose a valid start date.", 400);
  const { extraResult } = await allocateLeave(params.employeeId, end.slice(0, 4), {
    excludeLeaveId: params.excludeLeaveId,
    extra: { type: params.type, startDate: start, endDate: end, status: "PENDING" },
  });
  if (extraResult.days === 0) {
    throw new AppError(
      "These dates are all weekly offs or holidays - no leave is needed.",
      400,
    );
  }
  return {
    days: extraResult.days,
    paidDays: extraResult.paid,
    monthlyDays: extraResult.monthly,
    floatingDays: extraResult.floating,
    unpaidDays: extraResult.unpaid,
  };
}

let snapshotTimer: NodeJS.Timeout | null = null;

/**
 * Keeps the stored monthly leave balances current for every active employee
 * (every 6 hours, one employee at a time so the server stays light).
 */
export function startLeaveBalanceSnapshotJob() {
  if (snapshotTimer) return;
  const run = async () => {
    try {
      const users = await User.find({ isActive: true }).select("employeeId").lean();
      const year = currentMonth().slice(0, 4);
      for (const user of users as any[]) {
        if (!user.employeeId) continue;
        await allocateLeave(user.employeeId, year).catch(() => undefined);
      }
    } catch (error) {
      console.error("[Leave] Balance snapshot job failed:", error);
    }
  };
  setTimeout(() => void run(), 5 * 60 * 1000); // shortly after start
  snapshotTimer = setInterval(() => void run(), 6 * 60 * 60 * 1000);
}
