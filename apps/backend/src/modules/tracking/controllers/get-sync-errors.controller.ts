import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { FailedEvent } from "../models/failed-event.model";
import { ActivityEvent } from "../model/activity-event.model";

export const getSyncErrorsController = asyncHandler(
  async (req: Request, res: Response) => {
    // Fetch the latest 200 failed events
    const errors = await FailedEvent.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // Fetch the latest 50 logout events
    const logouts = await ActivityEvent.find({ type: "LOGOUT" })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

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
