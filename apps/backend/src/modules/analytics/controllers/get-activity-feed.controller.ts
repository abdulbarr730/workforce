import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { DeviceError } from "../../devices/model/device-error.model";

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

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const [events, desktopAgentEvents] = await Promise.all([
      ActivityEvent.find({
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
          $gte: dayStart,
          $lte: dayEnd,
        },
        invalidated: { $ne: true },
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean(),
      DeviceError.find({
        employeeId,
        errorType: /^desktop_lifecycle_/,
        createdAt: { $gte: dayStart, $lte: dayEnd },
      })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
    ]);

    const systemDedupWindowMs = 60_000;
    const seenSystemBuckets = new Set<string>();
    const activityFeed = events.flatMap((ev) => {
      const isNoisySystemEvent = [
        "SYSTEM_SLEEP",
        "SYSTEM_WAKE",
        "TRACKING_STOPPED",
      ].includes(String(ev.type));
      if (isNoisySystemEvent) {
        const bucket =
          Math.floor(new Date(ev.timestamp).getTime() / systemDedupWindowMs) *
          systemDedupWindowMs;
        const dedupKey = `${ev.employeeId}:${ev.deviceId}:${ev.type}:${bucket}`;
        if (seenSystemBuckets.has(dedupKey)) return [];
        seenSystemBuckets.add(dedupKey);
      }

      return [
        {
          id: String(ev._id),
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
          metadata: ev.metadata,
        },
      ];
    });

    const agentFeed = desktopAgentEvents.map((event) => {
      const type = String(event.errorType)
        .replace("desktop_lifecycle_", "DESKTOP_AGENT_")
        .toUpperCase();
      return {
        id: String(event._id),
        type,
        timestamp: event.createdAt,
        app: "Workforce Agent",
        title: event.errorMessage,
        durationSeconds: null,
        productivityCategory: "NEUTRAL",
        metadata: {
          deviceId: event.deviceId,
          stackTrace: event.stackTrace,
          source: "desktop-agent-lifecycle",
        },
      };
    });

    const feed = [...activityFeed, ...agentFeed]
      .sort(
        (a, b) =>
          new Date(b.timestamp as any).getTime() -
          new Date(a.timestamp as any).getTime(),
      )
      .slice(0, limit);

    return res.json(successResponse(feed, "Activity feed fetched"));
  },
);
