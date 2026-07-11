import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getTeamAnalytics } from "../services/get-team-analytics.service";

import { getManagerDepartment } from "../../departments/services/get-manager-department.service";

export const getTeamAnalyticsController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const { date, threshold } = req.query;

    const thresholdMins = threshold ? parseInt(threshold as string, 10) : 30;

    const user = (req as any).user;

    /*
        HR/Admin
        can access everything
      */

    if (
      user.role === "SUPER_ADMIN" ||
      user.role === "ADMIN" ||
      user.role === "HR"
    ) {
      const result = await getTeamAnalytics(
        date as string,
        undefined,
        thresholdMins,
      );

      return res.json(
        successResponse(
          result,

          "Team analytics fetched",
        ),
      );
    }

    /*
        Manager:
        only own department
      */

    if (user.role === "MANAGER") {
      const department = await getManagerDepartment(user.userId);

      if (!department) {
        return res.status(404).json({
          success: false,

          message: "Manager department not found",
        });
      }

      const result = await getTeamAnalytics(
        date as string,

        department._id.toString(),

        thresholdMins,
      );

      return res.json(
        successResponse(
          result,

          "Department analytics fetched",
        ),
      );
    }

    return res.status(403).json({
      success: false,

      message: "Forbidden",
    });
  },
);
