import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  errorResponse,
  successResponse,
} from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
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
  const minutes = Number(value || 30);
  if (!Number.isFinite(minutes)) return 30;
  return Math.max(5, Math.min(180, Math.round(minutes)));
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
      message: String(row.message || "").trim(),
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
    const day = BREAK_SCHEDULE_DAYS[new Date().getDay()];
    const schedules = await BreakSchedule.find({
      employeeId,
      isActive: true,
      activeDays: day,
    })
      .sort({ startTime: 1 })
      .lean();
    res.json(successResponse(schedules, "Today's breaks fetched"));
  },
);

export const createBreakScheduleController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const built = await buildSchedulePayload(
      req.body,
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
        message: req.body.message ?? existing.message,
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
