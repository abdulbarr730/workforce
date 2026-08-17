import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { Holiday } from "../model/holiday.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AppError } from "../../../shared/utils/app-error";
import { notificationService } from "../../../shared/services/notification.service";
import { generateDailyAttendance } from "../services/generate-daily-attendance.service";

const broadcastHolidayChange = (action: string, holiday: unknown) => {
  notificationService.broadcast("holiday_updated", { action, holiday });
};

const refreshAttendanceForDates = async (dates: string[]) => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  for (const date of [...new Set(dates)].filter((value) => value <= today)) {
    await generateDailyAttendance({ date });
  }
};

export const createHolidayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const existingHoliday = await Holiday.findOne({ date: req.body.date });
    if (existingHoliday) {
      throw new AppError("A holiday already exists for this date", 409);
    }

    const holiday = await Holiday.create(req.body);
    await refreshAttendanceForDates([holiday.date]);
    broadcastHolidayChange("created", holiday);
    res
      .status(201)
      .json(successResponse(holiday, "Holiday created successfully"));
  },
);

export const updateHolidayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const previous = await Holiday.findById(req.params.holidayId).lean();
    if (!previous) throw new AppError("Holiday not found", 404);
    if (req.body.date && req.body.date !== previous.date) {
      const duplicate = await Holiday.exists({
        _id: { $ne: req.params.holidayId },
        date: req.body.date,
      });
      if (duplicate) {
        throw new AppError("A holiday already exists for this date", 409);
      }
    }
    const holiday = await Holiday.findByIdAndUpdate(
      req.params.holidayId,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );
    if (!holiday) throw new AppError("Holiday not found", 404);
    await refreshAttendanceForDates([previous.date, holiday.date]);
    broadcastHolidayChange("updated", holiday);
    res
      .status(200)
      .json(successResponse(holiday, "Holiday updated successfully"));
  },
);

export const deleteHolidayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const holiday = await Holiday.findByIdAndDelete(req.params.holidayId);
    if (!holiday) throw new AppError("Holiday not found", 404);
    await refreshAttendanceForDates([holiday.date]);
    broadcastHolidayChange("deleted", holiday);
    res
      .status(200)
      .json(successResponse(holiday, "Holiday deleted successfully"));
  },
);

export const getHolidaysController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const holidays = await Holiday.find().sort({ date: 1 });
    res
      .status(200)
      .json(successResponse(holidays, "Holidays retrieved successfully"));
  },
);
