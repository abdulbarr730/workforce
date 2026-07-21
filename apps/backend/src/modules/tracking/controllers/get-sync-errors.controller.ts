import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { FailedEvent } from "../models/failed-event.model";
import { ActivityEvent } from "../model/activity-event.model";

import { User } from "../../users/model/user.model";

export const getSyncErrorsController = asyncHandler(
  async (req: Request, res: Response) => {
    // Fetch the latest 200 failed events
    const rawErrors = await FailedEvent.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // Fetch the latest 50 logout events that are due to AUTH_FAILURE
    const rawLogouts = await ActivityEvent.find({ 
      type: "LOGOUT" as any,
      "metadata.reason": "AUTH_FAILURE" 
    })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    // Collect all employee IDs to fetch names
    const employeeIds = [
      ...new Set([
        ...rawErrors.map(e => e.employeeId),
        ...rawLogouts.map(l => l.employeeId)
      ])
    ];

    const users = await User.find({ employeeId: { $in: employeeIds } }, "employeeId name").lean();
    const userMap = new Map(users.map(u => [u.employeeId, u.name]));

    const errors = rawErrors.map(e => ({
      ...e,
      employeeName: userMap.get(e.employeeId) || e.employeeId
    }));

    const logouts = rawLogouts.map(l => ({
      ...l,
      employeeName: userMap.get(l.employeeId) || l.employeeId
    }));

    return res
      .status(200)
      .json(
        successResponse(
          { errors, logouts },
          "Fetched sync errors successfully",
        ),
      );
  },
);
