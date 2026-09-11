import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  errorResponse,
  successResponse,
} from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import {
  BreakSchedule,
  BREAK_SCHEDULE_DAYS,
} from "../model/break-schedule.model";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeTime = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (timeRegex.test(text)) return text;
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridian = match[3]?.toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) {
    return "";
  }
  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const normalizeDuration = (value: unknown) => {
  const minutes = Number(value || 45);
  if (!Number.isFinite(minutes)) return 45;
  return Math.max(5, Math.min(180, Math.round(minutes)));
};

const normalizeDateKey = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return getKolkataDateKey(parsed);
};

const normalizeDateList = (value: unknown) => {
  const parts = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\n|]+/)
        .map((part) => part.trim());
  return Array.from(new Set(parts.map(normalizeDateKey).filter(Boolean))).sort();
};

const normalizeReasonOptions = (value: unknown) => {
  const parts = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,|\n]/)
        .map((part) => part.trim());
  return Array.from(new Set(parts.filter(Boolean))).slice(0, 20);
};

const normalizeDays = (value: unknown) => {
  if (!value) return BREAK_SCHEDULE_DAYS;
  const parts = Array.isArray(value)
    ? value
    : String(value)
        .split(/[,\s]+/)
        .map((part) => part.trim())
        .filter(Boolean);
  const mapped = parts
    .map((part) => {
      const upper = String(part).trim().toUpperCase();
      return BREAK_SCHEDULE_DAYS.find((day) => day.startsWith(upper.slice(0, 3)));
    })
    .filter(Boolean) as string[];
  return mapped.length ? Array.from(new Set(mapped)) : BREAK_SCHEDULE_DAYS;
};

const getKolkataDateKey = (value: Date | string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
};

const getKolkataDayName = (value: Date | string) => {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(new Date(value));
  return weekday.toUpperCase();
};

const scheduleMatchesDate = (schedule: any, dateKey: string, dayName: string) => {
  const specificDates = Array.isArray(schedule.specificDates)
    ? schedule.specificDates
    : [];
  if (specificDates.length > 0) return specificDates.includes(dateKey);
  if (schedule.startDate && dateKey < schedule.startDate) return false;
  if (schedule.endDate && dateKey > schedule.endDate) return false;
  const activeDays = Array.isArray(schedule.activeDays)
    ? schedule.activeDays
    : BREAK_SCHEDULE_DAYS;
  return activeDays.includes(dayName);
};

const resolveEmployee = async (row: any) => {
  const employeeId = String(row.employeeId || row.empId || "").trim();
  const employeeName = String(row.employeeName || row.name || "").trim();
  if (employeeId) {
    return User.findOne({
      employeeId,
      isActive: true,
      deletedAt: null,
    }).lean();
  }
  if (employeeName) {
    return User.findOne({
      name: new RegExp(`^${employeeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      isActive: true,
      deletedAt: null,
    }).lean();
  }
  return null;
};

const buildSchedulePayload = async (row: any, actorId?: string) => {
  const employee = await resolveEmployee(row);
  if (!employee) {
    return {
      error: `Employee not found: ${row.employeeId || row.employeeName || row.name || "blank"}`,
    };
  }

  const startTime = normalizeTime(row.startTime || row.time || row.breakTime);
  if (!startTime) {
    return { error: `Invalid break time for ${employee.name}` };
  }

  return {
    payload: {
      employeeId: employee.employeeId,
      employeeName: employee.name,
      startTime,
      durationMinutes: normalizeDuration(row.durationMinutes || row.duration),
      templateName: String(row.templateName || row.template || "").trim(),
      startDate: normalizeDateKey(row.startDate || row.fromDate || row.from),
      endDate: normalizeDateKey(row.endDate || row.toDate || row.to),
      specificDates: normalizeDateList(row.specificDates || row.dates),
      message: String(row.message || "").trim(),
      reasonOptions: normalizeReasonOptions(row.reasonOptions || row.reasons),
      requireReasonOnReturn: Boolean(
        row.requireReasonOnReturn ?? row.reasonRequired ?? row.mandatoryReason,
      ),
      activeDays: normalizeDays(row.activeDays || row.days),
      isActive: row.isActive === undefined ? true : Boolean(row.isActive),
      updatedBy: actorId || null,
    },
  };
};

export const listBreakSchedulesController = asyncHandler(
  async (_req: Request, res: Response) => {
    const schedules = await BreakSchedule.find({})
      .sort({ employeeName: 1, startTime: 1 })
      .lean();
    res.json(successResponse(schedules, "Break schedules fetched"));
  },
);

export const getMyBreakSchedulesTodayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }
    const now = new Date();
    const dateKey = getKolkataDateKey(now);
    const day = getKolkataDayName(now);
    const schedules = await BreakSchedule.find({
      employeeId,
      isActive: true,
    })
      .sort({ startTime: 1 })
      .lean();
    res.json(
      successResponse(
        schedules.filter((schedule) => scheduleMatchesDate(schedule, dateKey, day)),
        "Today's breaks fetched",
      ),
    );
  },
);

export const createBreakScheduleController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const rawEmployeeIds = Array.isArray(req.body?.employeeIds)
      ? req.body.employeeIds
      : [];
    const employeeIds = Array.from(
      new Set(
        rawEmployeeIds
          .map((id: unknown) => String(id || "").trim())
          .filter(Boolean),
      ),
    );

    if (employeeIds.length > 1) {
      const created = [];
      const errors = [];
      for (const employeeId of employeeIds) {
        const built = await buildSchedulePayload(
          { ...req.body, employeeId },
          (req.user as any)?.employeeId,
        );
        if (built.error || !built.payload) {
          errors.push({ employeeId, error: built.error || "Invalid row" });
          continue;
        }
        created.push({
          ...built.payload,
          createdBy: (req.user as any)?.employeeId || null,
        });
      }
      const inserted = created.length
        ? await BreakSchedule.insertMany(created, { ordered: false })
        : [];
      return res.status(201).json(
        successResponse(
          { insertedCount: inserted.length, errors, schedules: inserted },
          "Break template applied to employees",
        ),
      );
    }

    const built = await buildSchedulePayload(
      { ...req.body, employeeId: employeeIds[0] || req.body.employeeId },
      (req.user as any)?.employeeId,
    );
    if (built.error || !built.payload) {
      return res.status(400).json(errorResponse(built.error || "Invalid row"));
    }
    const schedule = await BreakSchedule.create({
      ...built.payload,
      createdBy: (req.user as any)?.employeeId || null,
    });
    res.status(201).json(successResponse(schedule, "Break schedule created"));
  },
);

export const bulkImportBreakSchedulesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json(errorResponse("No rows provided"));
    }

    const created = [];
    const errors = [];
    for (let index = 0; index < rows.length; index++) {
      const built = await buildSchedulePayload(
        rows[index],
        (req.user as any)?.employeeId,
      );
      if (built.error || !built.payload) {
        errors.push({ row: index + 1, error: built.error || "Invalid row" });
        continue;
      }
      created.push({
        ...built.payload,
        createdBy: (req.user as any)?.employeeId || null,
      });
    }

    const inserted = created.length
      ? await BreakSchedule.insertMany(created, { ordered: false })
      : [];
    res.status(201).json(
      successResponse(
        { insertedCount: inserted.length, errors },
        "Break schedules imported",
      ),
    );
  },
);

export const updateBreakScheduleController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const existing = await BreakSchedule.findById(req.params.id);
    if (!existing) {
      return res.status(404).json(errorResponse("Break schedule not found"));
    }

    const built = await buildSchedulePayload(
      {
        employeeId: req.body.employeeId ?? existing.employeeId,
        employeeName: req.body.employeeName ?? existing.employeeName,
        startTime: req.body.startTime ?? existing.startTime,
        durationMinutes: req.body.durationMinutes ?? existing.durationMinutes,
        templateName: req.body.templateName ?? existing.templateName,
        startDate: req.body.startDate ?? existing.startDate,
        endDate: req.body.endDate ?? existing.endDate,
        specificDates: req.body.specificDates ?? existing.specificDates,
        message: req.body.message ?? existing.message,
        reasonOptions: req.body.reasonOptions ?? existing.reasonOptions,
        requireReasonOnReturn:
          req.body.requireReasonOnReturn ?? existing.requireReasonOnReturn,
        activeDays: req.body.activeDays ?? existing.activeDays,
        isActive: req.body.isActive ?? existing.isActive,
      },
      (req.user as any)?.employeeId,
    );
    if (built.error || !built.payload) {
      return res.status(400).json(errorResponse(built.error || "Invalid row"));
    }

    existing.set(built.payload);
    await existing.save();
    res.json(successResponse(existing, "Break schedule updated"));
  },
);

export const deleteBreakScheduleController = asyncHandler(
  async (req: Request, res: Response) => {
    await BreakSchedule.findByIdAndDelete(req.params.id);
    res.json(successResponse({ id: req.params.id }, "Break schedule deleted"));
  },
);

export const getBreakUsageReportController = asyncHandler(
  async (req: Request, res: Response) => {
    const range = String(req.query.range || "week");
    const durationFilter = String(req.query.durationFilter || "ALL");
    const employeeId = String(req.query.employeeId || "");
    const customStartDate = normalizeDateKey(req.query.startDate);
    const customEndDate = normalizeDateKey(req.query.endDate);
    const minMinutes = Number(req.query.minMinutes || "");
    const maxMinutes = Number(req.query.maxMinutes || "");
    const now = new Date();
    let start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (customStartDate) {
      start = new Date(`${customStartDate}T00:00:00.000+05:30`);
    } else if (range === "month") {
      start.setDate(1);
    } else if (range === "today") {
      // already start of today
    } else {
      const day = start.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + mondayOffset);
    }
    let end = new Date(now);
    end.setHours(23, 59, 59, 999);
    if (customEndDate) {
      end = new Date(`${customEndDate}T23:59:59.999+05:30`);
    } else if (customStartDate) {
      end = new Date(`${customStartDate}T23:59:59.999+05:30`);
    }

    const userFilter: any = {
      isActive: true,
      deletedAt: null,
      role: { $nin: ["SUPER_ADMIN", "ADMIN"] },
    };
    if (employeeId) userFilter.employeeId = employeeId;

    const users = await User.find(userFilter)
      .select("employeeId name departmentName")
      .lean();
    const userById = new Map(users.map((user: any) => [user.employeeId, user]));
    const employeeIds = users.map((user: any) => user.employeeId);
    const events = await ActivityEvent.find({
      employeeId: { $in: employeeIds },
      timestamp: { $gte: start, $lte: end },
      type: { $in: ["BREAK_START", "BREAK_END"] as any[] },
      invalidated: { $ne: true },
    })
      .sort({ employeeId: 1, timestamp: 1 })
      .lean();

    const activeBreakByEmployee = new Map<string, any>();
    let rows = [];
    for (const event of events) {
      if (event.type === "BREAK_START") {
        activeBreakByEmployee.set(event.employeeId, event);
        continue;
      }
      const startEvent = activeBreakByEmployee.get(event.employeeId);
      if (!startEvent) continue;
      activeBreakByEmployee.delete(event.employeeId);
      const actualSeconds = Math.max(
        0,
        Math.round(
          (new Date(event.timestamp).getTime() -
            new Date(startEvent.timestamp).getTime()) /
            1000,
        ),
      );
      const plannedMinutes = Number((startEvent.metadata as any)?.durationMinutes || 45);
      const plannedSeconds =
        Number.isFinite(plannedMinutes) && plannedMinutes > 0
          ? Math.round(plannedMinutes * 60)
          : 45 * 60;
      const date = getKolkataDateKey(startEvent.timestamp as any);
      // Use the actual planned duration from the break event. Scheduled breaks
      // can be 45 minutes even when the employee's attendance status is
      // currently half-day, and manual half-day breaks already send 20 minutes
      // from the agent. Do not overwrite event intent from attendance status.
      const dailyAllowanceSeconds = plannedSeconds;
      const exceededBySeconds = Math.max(0, actualSeconds - plannedSeconds);
      const user = userById.get(event.employeeId) as any;
      rows.push({
        employeeId: event.employeeId,
        employeeName: user?.name || event.employeeId,
        departmentName: user?.departmentName || null,
        date,
        start: startEvent.timestamp,
        end: event.timestamp,
        actualSeconds,
        plannedSeconds,
        dailyAllowanceSeconds,
        exceeded: exceededBySeconds > 0,
        exceededBySeconds,
        reason: (event.metadata as any)?.reason || null,
      });
    }

    rows = rows.filter((row) => {
      const minutes = row.actualSeconds / 60;
      if (durationFilter === "GT_45") return minutes > 45;
      if (durationFilter === "LT_30") return minutes < 30;
      if (durationFilter === "LT_10") return minutes < 10;
      if (durationFilter === "EXCEEDED") return row.exceeded;
      if (Number.isFinite(minMinutes) && minMinutes > 0 && minutes < minMinutes) {
        return false;
      }
      if (Number.isFinite(maxMinutes) && maxMinutes > 0 && minutes > maxMinutes) {
        return false;
      }
      return true;
    });

    const byEmployee = new Map<string, any>();
    const byEmployeeDate = new Map<string, any>();
    for (const row of rows) {
      const current =
        byEmployee.get(row.employeeId) ||
        ({
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          breaks: 0,
          exceeded: 0,
          totalSeconds: 0,
          exceededBySeconds: 0,
        } as any);
      current.breaks += 1;
      current.exceeded += row.exceeded ? 1 : 0;
      current.totalSeconds += row.actualSeconds;
      current.exceededBySeconds += row.exceededBySeconds;
      byEmployee.set(row.employeeId, current);

      const dayKey = `${row.employeeId}:${row.date}`;
      const day =
        byEmployeeDate.get(dayKey) ||
        ({
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          date: row.date,
          breaks: 0,
          totalSeconds: 0,
          allowanceSeconds: 0,
          exceededAllowanceSeconds: 0,
        } as any);
      day.breaks += 1;
      day.totalSeconds += row.actualSeconds;
      day.allowanceSeconds += row.dailyAllowanceSeconds;
      day.exceededAllowanceSeconds = Math.max(
        0,
        day.totalSeconds - day.allowanceSeconds,
      );
      byEmployeeDate.set(dayKey, day);
    }

    res.json(
      successResponse(
        {
          range,
          start: start.toISOString(),
          end: end.toISOString(),
          rows,
          summary: {
            totalBreaks: rows.length,
            exceededBreaks: rows.filter((row) => row.exceeded).length,
            exceededAllowanceDays: Array.from(byEmployeeDate.values()).filter(
              (row: any) => row.exceededAllowanceSeconds > 0,
            ).length,
            employees: Array.from(byEmployee.values()),
            employeeDays: Array.from(byEmployeeDate.values()),
          },
        },
        "Break usage report fetched",
      ),
    );
  },
);
