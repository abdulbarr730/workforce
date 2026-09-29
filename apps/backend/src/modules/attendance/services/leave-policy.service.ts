import { AppError } from "../../../shared/utils/app-error";
import { Holiday } from "../model/holiday.model";
import { LeaveRequest } from "../model/leave-request.model";
import {
  LeaveAllowance,
  LeaveBlock,
  LeavePolicy,
} from "../model/leave-policy.model";
import { User } from "../../users/model/user.model";
import { datesBetween, toDateKey } from "./request-rules.service";

export const HALF_DAY_CODE = "HALF_DAY";

export type LeaveTypeConfig = {
  code: string;
  name: string;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  isActive: boolean;
};

// The leave types that existed before types became configurable.
const DEFAULT_TYPES: LeaveTypeConfig[] = [
  { code: "CASUAL", name: "Casual Leave", monthlyLimit: null, yearlyLimit: null, isActive: true },
  { code: "SICK", name: "Sick Leave", monthlyLimit: null, yearlyLimit: null, isActive: true },
  { code: "ANNUAL", name: "Annual Leave", monthlyLimit: null, yearlyLimit: null, isActive: true },
  { code: "EMERGENCY", name: "Emergency Leave", monthlyLimit: null, yearlyLimit: null, isActive: true },
  { code: "UNPAID", name: "Unpaid Leave", monthlyLimit: null, yearlyLimit: null, isActive: true },
  { code: "PAID LEAVE", name: "Paid Leave", monthlyLimit: null, yearlyLimit: null, isActive: true },
  { code: HALF_DAY_CODE, name: "Half Day", monthlyLimit: null, yearlyLimit: null, isActive: true },
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

export async function getLeavePolicy(): Promise<LeaveTypeConfig[]> {
  let policy: any = await LeavePolicy.findOne({ key: "default" }).lean();
  if (!policy) {
    policy = await LeavePolicy.findOneAndUpdate(
      { key: "default" },
      { $setOnInsert: { key: "default", types: DEFAULT_TYPES } },
      { upsert: true, returnDocument: "after" },
    ).lean();
  }
  const types: LeaveTypeConfig[] = (policy?.types || []).map((type: any) => ({
    code: normalizeTypeCode(type.code),
    name: String(type.name || type.code),
    monthlyLimit: toLimit(type.monthlyLimit),
    yearlyLimit: toLimit(type.yearlyLimit),
    isActive: type.isActive !== false,
  }));
  // Half day is part of the attendance rules and always exists.
  if (!types.some((type) => type.code === HALF_DAY_CODE)) {
    types.push({ ...DEFAULT_TYPES[DEFAULT_TYPES.length - 1] });
  }
  return types;
}

/** Validates and saves the admin's list of leave types. Codes are never removed. */
export async function saveLeavePolicy(
  input: unknown,
  actor: { employeeId?: string; name?: string },
) {
  if (!Array.isArray(input)) throw new AppError("Send the list of leave types.", 400);
  const current = await getLeavePolicy();
  const seen = new Set<string>();
  const types: LeaveTypeConfig[] = [];
  for (const raw of input as any[]) {
    const code = normalizeTypeCode(raw?.code || raw?.name);
    const name = String(raw?.name || "").trim();
    if (!code || !name) throw new AppError("Every leave type needs a name.", 400);
    if (seen.has(code)) throw new AppError(`"${name}" is listed twice.`, 400);
    seen.add(code);
    types.push({
      code,
      name,
      monthlyLimit: toLimit(raw?.monthlyLimit),
      yearlyLimit: toLimit(raw?.yearlyLimit),
      isActive: code === HALF_DAY_CODE ? raw?.isActive !== false : raw?.isActive !== false,
    });
  }
  // Types already used by leave requests stay (switched off, not removed).
  for (const old of current) {
    if (!seen.has(old.code)) types.push({ ...old, isActive: false });
  }
  await LeavePolicy.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        types,
        updatedBy: actor.employeeId || null,
        updatedByName: actor.name || null,
      },
    },
    { upsert: true },
  );
  return getLeavePolicy();
}

/** Type limits merged with the employee's own overrides. */
export async function getEffectiveLimits(employeeId: string) {
  const [types, allowance] = await Promise.all([
    getLeavePolicy(),
    LeaveAllowance.findOne({ employeeId }).lean(),
  ]);
  const overrides = new Map(
    ((allowance as any)?.limits || []).map((limit: any) => [
      normalizeTypeCode(limit.code),
      limit,
    ]),
  );
  return types.map((type) => {
    const override: any = overrides.get(type.code);
    return {
      ...type,
      defaultMonthlyLimit: type.monthlyLimit,
      defaultYearlyLimit: type.yearlyLimit,
      // A number overrides the type's default; blank (null) keeps the default.
      monthlyLimit:
        toLimit(override?.monthlyLimit) ?? type.monthlyLimit,
      yearlyLimit:
        toLimit(override?.yearlyLimit) ?? type.yearlyLimit,
      hasOverride:
        toLimit(override?.monthlyLimit) !== null ||
        toLimit(override?.yearlyLimit) !== null,
    };
  });
}

export async function saveLeaveAllowance(
  employeeId: string,
  limits: unknown,
  actor: { employeeId?: string; name?: string },
) {
  if (!Array.isArray(limits)) throw new AppError("Send the list of limits.", 400);
  const clean = (limits as any[])
    .map((limit) => ({
      code: normalizeTypeCode(limit?.code),
      monthlyLimit: toLimit(limit?.monthlyLimit),
      yearlyLimit: toLimit(limit?.yearlyLimit),
    }))
    .filter((limit) => limit.code);
  await LeaveAllowance.findOneAndUpdate(
    { employeeId },
    {
      $set: {
        limits: clean,
        updatedBy: actor.employeeId || null,
        updatedByName: actor.name || null,
      },
    },
    { upsert: true },
  );
  return getEffectiveLimits(employeeId);
}

/**
 * The days of a leave that count against limits: working days only (the
 * employee's weekly offs and company holidays are free). A half day is 0.5.
 * Returns each counted date so a leave spanning two months is split fairly.
 */
export async function countedLeaveDates(
  employeeId: string,
  type: string,
  startDate: string,
  endDate: string,
  context?: { workingDays?: string[]; holidays?: Set<string> },
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
  const isHalf = normalizeTypeCode(type) === HALF_DAY_CODE;
  return dates
    .filter((date) => {
      const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
      return working.includes(weekday) && !holidays.has(date);
    })
    .map((date) => ({ date, days: isHalf ? 0.5 : 1 }))
    .slice(0, isHalf ? 1 : undefined);
}

type Usage = { approved: number; pending: number };

/** Monthly and yearly leave used / pending / left per type for one employee. */
export async function getLeaveBalance(
  employeeId: string,
  month: string, // YYYY-MM
  options: { excludeLeaveId?: string } = {},
) {
  const year = month.slice(0, 4);
  const limits = await getEffectiveLimits(employeeId);
  const leaves = await LeaveRequest.find({
    employeeId,
    status: { $in: ["APPROVED", "PENDING"] },
    startDate: { $lte: `${year}-12-31~` },
    endDate: { $gte: `${year}-01-01` },
  })
    .select("type startDate endDate status")
    .lean();

  const user: any = await User.findOne({ employeeId }).select("workingDays").lean();
  const holidays = new Set(
    (
      await Holiday.find({
        date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
        isActive: true,
        workingEmployeeIds: { $ne: employeeId },
      })
        .select("date")
        .lean()
    ).map((holiday: any) => String(holiday.date).slice(0, 10)),
  );

  const monthUse = new Map<string, Usage>();
  const yearUse = new Map<string, Usage>();
  // monthUseByMonth[code][YYYY-MM] (used for request checks across months)
  const byMonth = new Map<string, Map<string, number>>();
  for (const leave of leaves as any[]) {
    if (options.excludeLeaveId && String(leave._id) === options.excludeLeaveId) continue;
    const code = normalizeTypeCode(leave.type);
    const dates = await countedLeaveDates(
      employeeId,
      code,
      leave.startDate,
      leave.endDate,
      { workingDays: user?.workingDays, holidays },
    );
    const bucket = leave.status === "APPROVED" ? "approved" : "pending";
    for (const { date, days } of dates) {
      if (!date.startsWith(year)) continue;
      const y = yearUse.get(code) || { approved: 0, pending: 0 };
      y[bucket] += days;
      yearUse.set(code, y);
      const monthKey = date.slice(0, 7);
      const perMonth = byMonth.get(code) || new Map<string, number>();
      perMonth.set(monthKey, (perMonth.get(monthKey) || 0) + days);
      byMonth.set(code, perMonth);
      if (monthKey === month) {
        const m = monthUse.get(code) || { approved: 0, pending: 0 };
        m[bucket] += days;
        monthUse.set(code, m);
      }
    }
  }

  const types = limits.map((type) => {
    const m = monthUse.get(type.code) || { approved: 0, pending: 0 };
    const y = yearUse.get(type.code) || { approved: 0, pending: 0 };
    const left = (limit: number | null, used: Usage) =>
      limit === null ? null : Math.max(0, limit - used.approved - used.pending);
    return {
      code: type.code,
      name: type.name,
      isActive: type.isActive,
      hasOverride: type.hasOverride,
      monthlyLimit: type.monthlyLimit,
      yearlyLimit: type.yearlyLimit,
      month: { ...m, left: left(type.monthlyLimit, m) },
      year: { ...y, left: left(type.yearlyLimit, y) },
    };
  });
  return { employeeId, month, year, types, byMonth };
}

/** Active blocks that stop this employee requesting leave on these dates. */
export async function findBlocksFor(
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  const blocks = await LeaveBlock.find({
    isActive: true,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
    $or: [{ scope: "ALL" }, { scope: "EMPLOYEES", employeeIds: employeeId }],
  }).lean();
  return blocks;
}

const fmt = (days: number) => (days === 1 ? "1 day" : `${days} days`);

/**
 * Checks a new/edited leave request against the leave type list, blocked
 * days and the employee's monthly/yearly limits (approved + pending count).
 */
export async function assertLeaveAllowed(params: {
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  excludeLeaveId?: string;
}) {
  const code = normalizeTypeCode(params.type);
  const types = await getLeavePolicy();
  const type = types.find((item) => item.code === code);
  if (!type || !type.isActive) {
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

  const requested = await countedLeaveDates(
    params.employeeId,
    code,
    params.startDate,
    params.endDate,
  );
  if (!requested.length) {
    throw new AppError(
      "These dates are all weekly offs or holidays - no leave is needed.",
      400,
    );
  }

  const years = Array.from(new Set(requested.map((d) => d.date.slice(0, 4))));
  for (const year of years) {
    const balance = await getLeaveBalance(params.employeeId, `${year}-01`, {
      excludeLeaveId: params.excludeLeaveId,
    });
    const limit = balance.types.find((item) => item.code === code);
    if (!limit) continue;
    const inYear = requested.filter((d) => d.date.startsWith(year));
    const newYearDays = inYear.reduce((sum, d) => sum + d.days, 0);
    if (limit.yearlyLimit !== null) {
      const used = limit.year.approved + limit.year.pending;
      if (used + newYearDays > limit.yearlyLimit) {
        throw new AppError(
          `${type.name}: your yearly limit is ${fmt(limit.yearlyLimit)} and ${fmt(used)} ${used === 1 ? "is" : "are"} already used or pending in ${year}. This request needs ${fmt(newYearDays)}.`,
          400,
        );
      }
    }
    if (limit.monthlyLimit !== null) {
      const perMonth = balance.byMonth.get(code) || new Map<string, number>();
      const months = Array.from(new Set(inYear.map((d) => d.date.slice(0, 7))));
      for (const monthKey of months) {
        const used = perMonth.get(monthKey) || 0;
        const newDays = inYear
          .filter((d) => d.date.startsWith(monthKey))
          .reduce((sum, d) => sum + d.days, 0);
        if (used + newDays > limit.monthlyLimit) {
          throw new AppError(
            `${type.name}: your monthly limit is ${fmt(limit.monthlyLimit)} and ${fmt(used)} ${used === 1 ? "is" : "are"} already used or pending in ${monthKey}. This request needs ${fmt(newDays)}.`,
            400,
          );
        }
      }
    }
  }
  return { type, days: requested.reduce((sum, d) => sum + d.days, 0) };
}
