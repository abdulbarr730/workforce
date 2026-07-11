import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

export const getActivityFeedController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId =
      (req.query.employeeId as string | undefined) || req.user?.employeeId;
    const date =
      (req.query.date as string) || new Date().toISOString().split("T")[0];
    const limit = parseInt(req.query.limit as string) || 2000;

    if (!employeeId) {
      return res
        .status(400)
        .json({ success: false, message: "employeeId required" });
    }

    const events = await ActivityEvent.find({
      employeeId,
      type: {
        $in: [
          "ACTIVE_WINDOW",
          "IDLE_START",
          "IDLE_END",
          "SESSION_START",
          "SESSION_END",
          "IDLE_OVERRIDE",
          "IDLE_RESPONSE",
          "SYSTEM_SLEEP",
          "SYSTEM_WAKE",
          "APP_CRASH",
          "TRACKING_STOPPED",
        ] as any[],
      },
      timestamp: {
        $gte: new Date(`${date}T00:00:00.000Z`),
        $lte: new Date(`${date}T23:59:59.999Z`),
      },
      invalidated: { $ne: true },
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const feed = events.map((ev) => ({
      type: ev.type,
      timestamp: ev.timestamp,
      app: (ev.metadata as any)?.app,
      title: (ev.metadata as any)?.title,
      url: (ev.metadata as any)?.url,
      domain: (ev.metadata as any)?.domain,
      isBrowser: (ev.metadata as any)?.isBrowser,
      screenLabel: (ev.metadata as any)?.screenLabel,
      durationSeconds: (ev.metadata as any)?.durationSeconds,
      productivityCategory: ev.productivityCategory,
      metadata: ev.metadata, // Include full metadata for IDLE_RESPONSE logic in frontend
    }));

    return res.json(successResponse(feed, "Activity feed fetched"));
  },
);
