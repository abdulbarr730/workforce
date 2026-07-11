import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getEmployeeDailyAnalytics } from "../services/get-employee-daily-analytics.service";

export const getEmployeeDailyAnalyticsController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const {
      companyId,

      employeeId,

      date,
    } = req.query;

    const analytics = await getEmployeeDailyAnalytics(
      employeeId as string,

      date as string,
    );

    return res.json(
      successResponse(
        analytics,

        "Employee analytics fetched",
      ),
    );
  },
);
