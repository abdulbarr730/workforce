import { AttendanceRecord } from "../model/attendance-record.model";
import { AttendanceShortfallAdjustment } from "../model/attendance-shortfall-adjustment.model";
import { ShiftPolicy } from "../model/shift-policy.model";
import { User } from "../../users/model/user.model";
import { getBusinessDate } from "./shift-schedule.service";

const NON_WORKING_STATUSES = new Set(["LEAVE", "HOLIDAY", "WEEKEND"]);
const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

type MonthlyShortfallInput = {
  month: string;
  employeeId?: string;
};

const asMinutes = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

const activeDayForDate = (date: string) =>
  DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];

export async function getMonthlyShortfall(input: MonthlyShortfallInput) {
  const employeeFilter: Record<string, unknown> = {
    role: { $nin: ["SUPER_ADMIN", "ADMIN"] },
    isActive: true,
  };
  if (input.employeeId) employeeFilter.employeeId = input.employeeId;

  const [users, records, policies, adjustments] = await Promise.all([
    User.find(employeeFilter)
      .select(
        "employeeId name departmentId departmentName assignedShiftPolicyId assignedShiftPolicyName",
      )
      .lean(),
    AttendanceRecord.find({
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      date: { $regex: `^${input.month}` },
      deleted: { $ne: true },
    })
      .sort({ date: 1 })
      .lean(),
    ShiftPolicy.find({ isActive: true }).lean(),
    AttendanceShortfallAdjustment.find({
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      month: input.month,
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const recordsByEmployee = new Map<string, any[]>();
  records.forEach((record: any) => {
    const employeeRecords = recordsByEmployee.get(record.employeeId) || [];
    employeeRecords.push(record);
    recordsByEmployee.set(record.employeeId, employeeRecords);
  });

  const adjustmentsByEmployee = new Map<string, any[]>();
  adjustments.forEach((adjustment: any) => {
    const employeeAdjustments =
      adjustmentsByEmployee.get(adjustment.employeeId) || [];
    employeeAdjustments.push(adjustment);
    adjustmentsByEmployee.set(adjustment.employeeId, employeeAdjustments);
  });

  const policyById = new Map(
    policies.map((policy: any) => [String(policy._id), policy]),
  );
  const defaultPolicyByDay = new Map<string, any>();
  const fallbackPolicyByDay = new Map<string, any>();
  policies.forEach((policy: any) => {
    (policy.activeDays || []).forEach((day: string) => {
      if (!fallbackPolicyByDay.has(day)) fallbackPolicyByDay.set(day, policy);
      if (policy.isDefault && !defaultPolicyByDay.has(day)) {
        defaultPolicyByDay.set(day, policy);
      }
    });
  });
  const currentBusinessDate = getBusinessDate();
  const now = Date.now();

  const summaries = users.map((user: any) => {
    const employeeRecords = recordsByEmployee.get(user.employeeId) || [];
    const employeeAdjustments =
      adjustmentsByEmployee.get(user.employeeId) || [];
    let requiredMinutes = 0;
    let workedMinutes = 0;
    let deficitDays = 0;
    let excludedOpenDays = 0;

    const daily = employeeRecords.map((record: any) => {
      const isOpenCurrentShift =
        record.date === currentBusinessDate &&
        !record.logoutTime &&
        (!record.expectedLogoutTime ||
          now < new Date(record.expectedLogoutTime).getTime());

      const creditedMinutes = Math.max(
        asMinutes(record.totalWorkedMinutes),
        asMinutes(record.productiveMinutes) +
          asMinutes(record.awayWorkingMinutes),
      );

      if (isOpenCurrentShift) {
        excludedOpenDays += 1;
        return {
          date: record.date,
          attendanceStatus: record.attendanceStatus,
          shiftAssigned: record.shiftAssigned || "",
          requiredMinutes: 0,
          workedMinutes: creditedMinutes,
          shortfallMinutes: 0,
          creditMinutes: 0,
          excludedAsOpenShift: true,
        };
      }

      const activeDay = activeDayForDate(record.date);
      const assignedPolicy = user.assignedShiftPolicyId
        ? policyById.get(String(user.assignedShiftPolicyId))
        : null;
      const policy = assignedPolicy?.activeDays?.includes(activeDay)
        ? assignedPolicy
        : defaultPolicyByDay.get(activeDay) ||
          fallbackPolicyByDay.get(activeDay);

      const isNonWorking =
        NON_WORKING_STATUSES.has(record.attendanceStatus) ||
        /weekend work/i.test(String(record.shiftAssigned || ""));
      const dayRequiredMinutes = isNonWorking
        ? 0
        : asMinutes(record.requiredWorkMinutes) ||
          asMinutes(policy?.minimumWorkMinutes) ||
          480;
      const dayShortfall = Math.max(0, dayRequiredMinutes - creditedMinutes);
      const dayCredit = Math.max(0, creditedMinutes - dayRequiredMinutes);

      requiredMinutes += dayRequiredMinutes;
      workedMinutes += creditedMinutes;
      if (dayShortfall > 0) deficitDays += 1;

      return {
        date: record.date,
        attendanceStatus: record.attendanceStatus,
        shiftAssigned: record.shiftAssigned || "",
        requiredMinutes: dayRequiredMinutes,
        workedMinutes: creditedMinutes,
        shortfallMinutes: dayShortfall,
        creditMinutes: dayCredit,
        excludedAsOpenShift: false,
      };
    });

    const rawShortfallMinutes = Math.max(0, requiredMinutes - workedMinutes);
    const surplusMinutes = Math.max(0, workedMinutes - requiredMinutes);
    const totalResetMinutes = employeeAdjustments.reduce(
      (total: number, adjustment: any) =>
        total + asMinutes(adjustment.appliedMinutes),
      0,
    );
    const coveredByResetMinutes = Math.min(
      rawShortfallMinutes,
      totalResetMinutes,
    );
    const shortfallMinutes = Math.max(
      0,
      rawShortfallMinutes - totalResetMinutes,
    );

    return {
      employeeId: user.employeeId,
      employeeName: user.name,
      departmentId: user.departmentId || null,
      departmentName: user.departmentName || "Unassigned",
      assignedShiftPolicyName: user.assignedShiftPolicyName || null,
      month: input.month,
      requiredMinutes,
      workedMinutes,
      rawShortfallMinutes,
      coveredByResetMinutes,
      totalResetMinutes,
      shortfallMinutes,
      surplusMinutes,
      deficitDays,
      recordedDays: employeeRecords.length,
      excludedOpenDays,
      daily,
      resetHistory: employeeAdjustments.map((adjustment: any) => ({
        id: String(adjustment._id),
        appliedMinutes: asMinutes(adjustment.appliedMinutes),
        reason: adjustment.reason,
        resetByEmployeeId: adjustment.resetByEmployeeId,
        resetByName: adjustment.resetByName,
        createdAt: adjustment.createdAt,
      })),
    };
  });

  summaries.sort(
    (left, right) =>
      right.shortfallMinutes - left.shortfallMinutes ||
      left.employeeName.localeCompare(right.employeeName),
  );

  return {
    month: input.month,
    generatedAt: new Date(),
    totals: {
      employees: summaries.length,
      employeesWithShortfall: summaries.filter(
        (summary) => summary.shortfallMinutes > 0,
      ).length,
      requiredMinutes: summaries.reduce(
        (total, summary) => total + summary.requiredMinutes,
        0,
      ),
      workedMinutes: summaries.reduce(
        (total, summary) => total + summary.workedMinutes,
        0,
      ),
      shortfallMinutes: summaries.reduce(
        (total, summary) => total + summary.shortfallMinutes,
        0,
      ),
      coveredByResetMinutes: summaries.reduce(
        (total, summary) => total + summary.coveredByResetMinutes,
        0,
      ),
    },
    employees: summaries,
  };
}
