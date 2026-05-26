import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

export const getLiveStatsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.userId;
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

    const events = await ActivityEvent.find({
      employeeId,
      timestamp: {
        $gte: new Date(`${date}T00:00:00.000Z`),
        $lte: new Date(`${date}T23:59:59.999Z`),
      },
      invalidated: { $ne: true },
    })
      .sort({ timestamp: 1 })
      .lean();

    let productiveSeconds = 0;
    let unproductiveSeconds = 0;
    let neutralSeconds = 0;
    let idleSeconds = 0;
    const appMap: Record<string, number> = {};
    let firstEventAt: Date | null = null;
    let lastEventAt: Date | null = null;

    for (const ev of events) {
      const cat = ev.productivityCategory ?? "NEUTRAL";
      if (cat === "PRODUCTIVE") productiveSeconds += 5;
      else if (cat === "UNPRODUCTIVE") unproductiveSeconds += 5;
      else neutralSeconds += 5;

      if (ev.type === "IDLE_START" || ev.type === "IDLE_END") idleSeconds += 5;

      const app = (ev.metadata as any)?.app;
      if (app && ev.type === "ACTIVE_WINDOW") {
        appMap[app] = (appMap[app] || 0) + 5;
      }

      const ts = new Date(ev.timestamp);
      if (!firstEventAt || ts < firstEventAt) firstEventAt = ts;
      if (!lastEventAt || ts > lastEventAt) lastEventAt = ts;
    }

    const totalTrackedSeconds = productiveSeconds + unproductiveSeconds + neutralSeconds;
    const focusScore =
      totalTrackedSeconds === 0
        ? 0
        : Math.round((productiveSeconds / totalTrackedSeconds) * 100);

    const topApps = Object.entries(appMap)
      .map(([app, seconds]) => ({ app, seconds }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 8);

    return res.json(
      successResponse(
        {
          date,
          totalTrackedSeconds,
          productiveSeconds,
          unproductiveSeconds,
          neutralSeconds,
          idleSeconds,
          focusScore,
          topApps,
          sessionStart: firstEventAt,
          lastSeen: lastEventAt,
          eventCount: events.length,
        },
        "Live stats fetched"
      )
    );
  }
);
