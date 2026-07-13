import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getEmployeeTrendAnalytics } from "../../analytics/services/get-employee-trend-analytics.service";

export const getMyTrendAnalyticsController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const { days } = req.query;

    const user = (req as any).user;

    const result = await getEmployeeTrendAnalytics(
      user.userId,

      Number(days || 7),
    );

    return res.json(
      successResponse(
        result,

        "My trend analytics fetched",
      ),
    );
  },
);
