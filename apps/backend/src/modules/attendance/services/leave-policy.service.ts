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
  /** Unpaid types (e.g. Unpaid Leave) never use the paid balance. */
  isPaid: boolean;
  isActive: boolean;
};

export type LeavePolicyConfig = {
  types: LeaveTypeConfig[];
  /** Paid leave allowed in total across all types (null = no limit). */
  totalMonthlyLimit: number | null;
  totalYearlyLimit: number | null;
};

const type = (
  code: string,
  name: string,
  isPaid = true,
): LeaveTypeConfig => ({
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
  };
}

/**
 * Saves the admin's leave types. A type left out of the list is deleted from
 * the settings (Half Day always stays); leave requests already made with it
 * keep their type name.
 */
export async function saveLeavePolicy(
  input: { types?: unknown; totalMonthlyLimit?: unknown; totalYearlyLimit?: unknown },
  actor: { employeeId?: string; name?: string },
) {
  if (!Array.isArray(input?.types)) {
    throw new AppError("Send the list of leave types.", 400);
  }
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
  await LeavePolicy.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        types,
        totalMonthlyLimit: toLimit(input.totalMonthlyLimit),
        totalYearlyLimit: toLimit(input.totalYearlyLimit),
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
  return {
    types,
    total: {
      monthlyLimit: ownTotalMonthly ?? policy.totalMonthlyLimit,
      yearlyLimit: ownTotalYearly ?? policy.totalYearlyLimit,
      defaultMonthlyLimit: policy.totalMonthlyLimit,
      defaultYearlyLimit: policy.totalYearlyLimit,
      hasOverride: ownTotalMonthly !== null || ownTotalYearly !== null,
    },
  };
}

export async function saveLeaveAllowance(
  employeeId: string,
  input: { limits?: unknown; totalMonthlyLimit?: unknown; totalYearlyLimit?: unknown },
  actor: { employeeId?: string; name?: string },
) {
  const limits = Array.isArray(input?.limits) ? (input.limits as any[]) : [];
  const clean = limits
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
        totalMonthlyLimit: toLimit(input?.totalMonthlyLimit),
        totalYearlyLimit: toLimit(input?.totalYearlyLimit),
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

type Bucket = { paid: number; unpaid: number; pending: number };
const emptyBucket = (): Bucket => ({ paid: 0, unpaid: 0, pending: 0 });
const add = (map: Map<string, Bucket>, key: string, paid: number, unpaid: number, pending: number) => {
  const bucket = map.get(key) || emptyBucket();
  bucket.paid += paid;
  bucket.unpaid += unpaid;
  bucket.pending += pending;
  map.set(key, bucket);
};
const room = (limit: number | null, used: number) =>
  limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);

/**
 * Splits an employee's leave in a year into paid and unpaid days. Requests are
 * taken first come, first served (approved and pending both hold their
 * place); a day is paid while its type's limits and the total limits still
 * have room, otherwise it is unpaid. Unpaid types are always unpaid and do
 * not use the balance. Re-worked whenever asked, so cancelling or rejecting a
 * request gives its paid days back.
 */
export async function allocateLeaveYear(
  employeeId: string,
  year: string,
  options: { extra?: LeaveLike; excludeLeaveId?: string } = {},
) {
  const limits = await getEffectiveLimits(employeeId);
  const typeByCode = new Map(limits.types.map((item) => [item.code, item]));
  const leaves = (await LeaveRequest.find({
    employeeId,
    status: { $in: ["APPROVED", "PENDING"] },
    startDate: { $lte: `${year}-12-31~` },
    endDate: { $gte: `${year}-01-01` },
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
  const context = { workingDays: user?.workingDays, holidays };

  const typeMonth = new Map<string, Bucket>(); // `${code}|${YYYY-MM}`
  const typeYear = new Map<string, Bucket>(); // code
  const totalMonth = new Map<string, Bucket>(); // YYYY-MM
  const totalYear = emptyBucket();
  const perLeave = new Map<string, { paid: number; unpaid: number }>();
  let extraResult = { paid: 0, unpaid: 0, days: 0 };

  for (const leave of list) {
    const code = normalizeTypeCode(leave.type);
    const config = typeByCode.get(code);
    const isPaidType = config ? config.isPaid : true;
    const pending = leave.status === "PENDING" ? 1 : 0;
    const dates = (
      await countedLeaveDates(employeeId, code, leave.startDate, leave.endDate, context)
    ).filter((d) => d.date.startsWith(year));
    let paidTotal = 0;
    let unpaidTotal = 0;
    for (const { date, days } of dates) {
      const month = date.slice(0, 7);
      let paid = 0;
      if (isPaidType) {
        const tm = typeMonth.get(`${code}|${month}`) || emptyBucket();
        const ty = typeYear.get(code) || emptyBucket();
        const am = totalMonth.get(month) || emptyBucket();
        const available = Math.min(
          room(config?.monthlyLimit ?? null, tm.paid),
          room(config?.yearlyLimit ?? null, ty.paid),
          room(limits.total.monthlyLimit, am.paid),
          room(limits.total.yearlyLimit, totalYear.paid),
        );
        paid = Math.min(days, Math.floor(available * 2) / 2);
      }
      const unpaid = days - paid;
      add(typeMonth, `${code}|${month}`, paid, unpaid, pending * days);
      add(typeYear, code, paid, unpaid, pending * days);
      if (isPaidType || unpaid) add(totalMonth, month, paid, unpaid, pending * days);
      totalYear.paid += paid;
      totalYear.unpaid += unpaid;
      totalYear.pending += pending * days;
      paidTotal += paid;
      unpaidTotal += unpaid;
    }
    if (leave === extra) {
      extraResult = { paid: paidTotal, unpaid: unpaidTotal, days: paidTotal + unpaidTotal };
    } else if (leave._id) {
      perLeave.set(String(leave._id), { paid: paidTotal, unpaid: unpaidTotal });
    }
  }
  return { limits, typeMonth, typeYear, totalMonth, totalYear, perLeave, extraResult };
}

/**
 * Monthly and yearly leave per employee: total paid balance first (used /
 * left), then the split by type, with unpaid and pending days.
 */
export async function getLeaveBalance(employeeId: string, month: string) {
  const year = month.slice(0, 4);
  const allocation = await allocateLeaveYear(employeeId, year);
  const { limits } = allocation;
  const view = (bucket: Bucket, limit: number | null) => ({
    paid: bucket.paid,
    unpaid: bucket.unpaid,
    pending: bucket.pending,
    left: limit === null ? null : Math.max(0, limit - bucket.paid),
  });
  const monthTotal = allocation.totalMonth.get(month) || emptyBucket();
  return {
    employeeId,
    month,
    year,
    total: {
      monthlyLimit: limits.total.monthlyLimit,
      yearlyLimit: limits.total.yearlyLimit,
      hasOverride: limits.total.hasOverride,
      month: view(monthTotal, limits.total.monthlyLimit),
      year: view(allocation.totalYear, limits.total.yearlyLimit),
    },
    types: limits.types.map((item) => ({
      code: item.code,
      name: item.name,
      isPaid: item.isPaid,
      isActive: item.isActive,
      hasOverride: item.hasOverride,
      monthlyLimit: item.monthlyLimit,
      yearlyLimit: item.yearlyLimit,
      month: view(
        allocation.typeMonth.get(`${item.code}|${month}`) || emptyBucket(),
        item.monthlyLimit,
      ),
      year: view(allocation.typeYear.get(item.code) || emptyBucket(), item.yearlyLimit),
    })),
  };
}

/** Paid / unpaid days of each given leave (for admin lists and exports). */
export async function paidSplitFor(leaves: Array<{ _id: unknown; employeeId: string; startDate: string }>) {
  const result = new Map<string, { paid: number; unpaid: number }>();
  const groups = new Map<string, { employeeId: string; year: string }>();
  for (const leave of leaves) {
    const year = toDateKey(leave.startDate).slice(0, 4);
    if (year) groups.set(`${leave.employeeId}|${year}`, { employeeId: leave.employeeId, year });
  }
  for (const { employeeId, year } of groups.values()) {
    const allocation = await allocateLeaveYear(employeeId, year);
    allocation.perLeave.forEach((split, id) => {
      const current = result.get(id);
      result.set(id, current
        ? { paid: current.paid + split.paid, unpaid: current.unpaid + split.unpaid }
        : split);
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

/** How many of the requested days would be paid / unpaid right now. */
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
  const years = Array.from(new Set(datesBetween(start, end).map((d) => d.slice(0, 4))));
  let paid = 0;
  let unpaid = 0;
  for (const year of years) {
    const { extraResult } = await allocateLeaveYear(params.employeeId, year, {
      excludeLeaveId: params.excludeLeaveId,
      extra: {
        type: params.type,
        startDate: start,
        endDate: end,
        status: "PENDING",
      },
    });
    paid += extraResult.paid;
    unpaid += extraResult.unpaid;
  }
  if (paid + unpaid === 0) {
    throw new AppError(
      "These dates are all weekly offs or holidays - no leave is needed.",
      400,
    );
  }
  return { days: paid + unpaid, paidDays: paid, unpaidDays: unpaid };
}
