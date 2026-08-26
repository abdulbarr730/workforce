import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

type ActivityLog = {
  type: "BREAK" | "OFFLINE" | "IDLE_OFFLINE";
  start: string | Date;
  end: string | Date;
  durationMinutes: number;
  reason: string;
};

export const getActivityLogsController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    
    // Set date boundaries
    const startOfDay = new Date(`${date}T00:00:00.000Z`).toISOString();
    const endOfDay = new Date(`${date}T23:59:59.999Z`).toISOString();

    const events = await ActivityEvent.find({
      employeeId: user.employeeId,
      timestamp: { $gte: startOfDay, $lte: endOfDay },
      type: {
        $in: [
          "BREAK_START",
          "BREAK_END",
          "AWAY_WORK_START",
          "AWAY_WORK_END",
          "IDLE_START",
          "IDLE_END",
          "IDLE_RESPONSE",
        ] as any[],
      },
    }).sort({ timestamp: 1 }).lean();

    // Process events into meaningful logs. Some affected laptops can upload the
    // same idle/break response twice for one interval; keep one visible row and
    // one counted duration for the exact same type/start/end tuple.
    const logs: ActivityLog[] = [];
    const seenLogs = new Set<string>();
    const roundedMinute = (value: string | Date) =>
      Math.round(new Date(value).getTime() / 60000);
    const addLog = (log: ActivityLog) => {
      const key = `${log.type}-${roundedMinute(log.start)}-${roundedMinute(log.end)}-${Math.round(log.durationMinutes)}`;
      if (seenLogs.has(key)) return;
      seenLogs.add(key);
      logs.push(log);
    };
    let currentBreak = null;
    let currentAway = null;
    
    for (const event of events) {
      if (event.type === "BREAK_START") {
        currentBreak = { start: event.timestamp, reason: (event.metadata as any)?.reason || "Break Time" };
      } else if (event.type === "BREAK_END" && currentBreak) {
        addLog({
          type: "BREAK",
          start: currentBreak.start,
          end: event.timestamp,
          durationMinutes: Math.round((new Date(event.timestamp).getTime() - new Date(currentBreak.start).getTime()) / 60000),
          reason: (event.metadata as any)?.reason || currentBreak.reason,
        });
        currentBreak = null;
      } else if (event.type === "AWAY_WORK_START") {
        currentAway = { start: event.timestamp, reason: (event.metadata as any)?.reason || "Offline Work" };
      } else if (event.type === "AWAY_WORK_END" && currentAway) {
        addLog({
          type: "OFFLINE",
          start: currentAway.start,
          end: event.timestamp,
          durationMinutes: Math.round((new Date(event.timestamp).getTime() - new Date(currentAway.start).getTime()) / 60000),
          reason: (event.metadata as any)?.reason || currentAway.reason,
        });
        currentAway = null;
      } else if (event.type === "IDLE_RESPONSE") {
        const metadata = event.metadata as any;
        if (!metadata.isWorking) {
           addLog({
             type: "IDLE_OFFLINE",
             start: metadata.from || event.timestamp,
             end: metadata.to || event.timestamp,
             durationMinutes: metadata.idleMinutes || 0,
             reason: metadata.reason || "Idle (Not Working)",
           });
        }
      }
    }

    return res.status(200).json(successResponse(logs, "Activity logs retrieved"));
  },
);
