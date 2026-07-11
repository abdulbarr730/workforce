import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getEmployeeTrendAnalytics } from "../services/get-employee-trend-analytics.service";

export const getEmployeeTrendAnalyticsController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const { employeeId, days } = req.query;

    const result = await getEmployeeTrendAnalytics(
      employeeId as string,
      days ? Number(days) : 30,
    );

    return res.json(
      successResponse(
        result,

        "Employee trend analytics fetched",
      ),
    );
  },
);
