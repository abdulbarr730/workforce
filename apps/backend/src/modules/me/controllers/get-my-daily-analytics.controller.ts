import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getEmployeeDailyAnalytics } from "../../analytics/services/get-employee-daily-analytics.service";

export const getMyDailyAnalyticsController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const { date } = req.query;

    const user = (req as any).user;

    const analytics = await getEmployeeDailyAnalytics(
      user.userId,

      date as string,
    );

    return res.json(
      successResponse(
        analytics,

        "My analytics fetched",
      ),
    );
  },
);
