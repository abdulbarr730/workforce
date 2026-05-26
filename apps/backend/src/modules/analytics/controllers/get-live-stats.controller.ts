import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

export const getLiveStatsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // Admin can pass ?employeeId=EMP001; employees use their own JWT employeeId
    const employeeId =
      (req.query.employeeId as string | undefined) || req.user?.employeeId;
    const date =
      (req.query.date as string) || new Date().toISOString().split("T")[0];

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "employeeId required" });
    }

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
      // Use recorded durationSeconds if present (new tracker), else assume 5s (legacy)
      const dur = (ev.metadata as any)?.durationSeconds ?? 5;
      const cat = ev.productivityCategory ?? "NEUTRAL";

      if (ev.type === "ACTIVE_WINDOW") {
        if (cat === "PRODUCTIVE") productiveSeconds += dur;
        else if (cat === "UNPRODUCTIVE") unproductiveSeconds += dur;
        else neutralSeconds += dur;

        const app = (ev.metadata as any)?.app;
        if (app) appMap[app] = (appMap[app] || 0) + dur;
      }

      if (ev.type === "IDLE_START" || ev.type === "IDLE_END") {
        const idleDur = (ev.metadata as any)?.idleDurationSecs ?? (ev.metadata as any)?.idleSeconds ?? 5;
        idleSeconds += idleDur;
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
      .slice(0, 10);

    return res.json(
      successResponse(
        {
          date,
          employeeId,
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
