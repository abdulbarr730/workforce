import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { generateDailyAnalytics } from "../services/generate-daily-analytics.service";

export const generateDailyAnalyticsController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const {
      companyId,

      employeeId,

      date,
    } = req.body;

    const result = await generateDailyAnalytics(
      companyId,

      employeeId,

      date,
    );

    return res.json(
      successResponse(
        result,

        "Daily analytics generated",
      ),
    );
  },
);
