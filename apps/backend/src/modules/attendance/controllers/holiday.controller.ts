import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { Holiday } from "../model/holiday.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AppError } from "../../../shared/utils/app-error";

export const createHolidayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const existingHoliday = await Holiday.findOne({ date: req.body.date });
    if (existingHoliday) {
      throw new AppError("A holiday already exists for this date", 409);
    }

    const holiday = await Holiday.create(req.body);
    res
      .status(201)
      .json(successResponse(holiday, "Holiday created successfully"));
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
