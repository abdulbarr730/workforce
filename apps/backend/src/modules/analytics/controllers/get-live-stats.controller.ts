import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { User } from "../../users/model/user.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";

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
    let breakSeconds = 0;
    let offlineWorkSeconds = 0;
    const appMap: Record<string, number> = {};
    let firstEventAt: Date | null = null;
    let lastEventAt: Date | null = null;

    const segments: { start: string; end: string; durationSecs: number; type: string }[] = [];
    let currentActiveSegment: { start: Date; end: Date; durationSecs: number; type: string } | null = null;

    for (const ev of events) {
      const ts = new Date(ev.timestamp);
      // Use recorded durationSeconds if present (new tracker), else assume 5s (legacy)
      const dur = (ev.metadata as any)?.durationSeconds ?? 5;
      const cat = ev.productivityCategory ?? "NEUTRAL";

      if (ev.type === "ACTIVE_WINDOW") {
        if (cat === "PRODUCTIVE") productiveSeconds += dur;
        else if (cat === "UNPRODUCTIVE") unproductiveSeconds += dur;
        else neutralSeconds += dur;

        const app = (ev.metadata as any)?.app;
        if (app) appMap[app] = (appMap[app] || 0) + dur;

        const tsStart = ts;
        const tsEnd = new Date(ts.getTime() + dur * 1000);

        if (!currentActiveSegment) {
          currentActiveSegment = { start: tsStart, end: tsEnd, durationSecs: dur, type: cat };
        } else {
          // If category matches and time gap is <= 120 seconds, coalesce
          const timeDiffSecs = (tsStart.getTime() - currentActiveSegment.end.getTime()) / 1000;
          if (currentActiveSegment.type === cat && timeDiffSecs <= 120) {
            currentActiveSegment.end = tsEnd;
            currentActiveSegment.durationSecs += dur;
          } else {
            segments.push({
              start: currentActiveSegment.start.toISOString(),
              end: currentActiveSegment.end.toISOString(),
              durationSecs: currentActiveSegment.durationSecs,
              type: currentActiveSegment.type,
            });
            currentActiveSegment = { start: tsStart, end: tsEnd, durationSecs: dur, type: cat };
          }
        }
      }

      if (ev.type === "IDLE_START" || ev.type === "IDLE_END") {
        let idleDur = (ev.metadata as any)?.idleDurationSecs ?? (ev.metadata as any)?.idleSeconds ?? 5;
        
        // If the idle period started before today, it's an overnight sleep. Ignore it for today's stats.
        const idleStartTime = new Date(ts.getTime() - idleDur * 1000);
        const startOfDayUTC = new Date(`${date}T00:00:00.000Z`);
        if (idleStartTime < startOfDayUTC) {
          idleDur = 0;
        }
        
        idleSeconds += idleDur;
      }

      if (ev.type === "IDLE_RESPONSE") {
        const mins = (ev.metadata as any)?.idleMinutes ?? 0;
        let dur = mins * 60;
        
        // If the idle period started before today, ignore it.
        const idleStartTime = new Date(ts.getTime() - dur * 1000);
        const startOfDayUTC = new Date(`${date}T00:00:00.000Z`);
        
        if (idleStartTime < startOfDayUTC) {
           dur = 0;
        }

        // Close the active segment if one exists
        if (currentActiveSegment) {
          segments.push({
            start: currentActiveSegment.start.toISOString(),
            end: currentActiveSegment.end.toISOString(),
            durationSecs: currentActiveSegment.durationSecs,
            type: currentActiveSegment.type,
          });
          currentActiveSegment = null;
        }

        if (dur > 0) {
          const type = (ev.metadata as any)?.isWorking ? 'OFFLINE' : 'BREAK';
          // Ensure we don't push a segment that goes before startOfDayUTC
          const actualStartTime = idleStartTime < startOfDayUTC ? startOfDayUTC : idleStartTime;
          segments.push({
            start: actualStartTime.toISOString(),
            end: ts.toISOString(),
            durationSecs: dur,
            type,
          });
        }

        // This duration was previously added via IDLE_START/END, so we must subtract it 
        // from idleSeconds to recategorize it without double counting.
        idleSeconds -= dur;

        if ((ev.metadata as any)?.isWorking) {
          offlineWorkSeconds += dur;
        } else {
          breakSeconds += dur;
        }
      }

      if (!firstEventAt || ts < firstEventAt) firstEventAt = ts;
      if (!lastEventAt || ts > lastEventAt) lastEventAt = ts;
    }

    if (currentActiveSegment) {
      segments.push({
        start: currentActiveSegment.start.toISOString(),
        end: currentActiveSegment.end.toISOString(),
        durationSecs: currentActiveSegment.durationSecs,
        type: currentActiveSegment.type,
      });
    }

    const totalTrackedSeconds = productiveSeconds + unproductiveSeconds + neutralSeconds + offlineWorkSeconds + idleSeconds + breakSeconds;
    const focusScore =
      totalTrackedSeconds === 0
        ? 0
        : Math.round((productiveSeconds / totalTrackedSeconds) * 100);

    const topApps = Object.entries(appMap)
      .map(([app, seconds]) => ({ app, seconds }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 10);



    const sessions = await WorkSession.find({
      employeeId,
      loginAt: {
        $gte: new Date(`${date}T00:00:00.000Z`),
        $lte: new Date(`${date}T23:59:59.999Z`),
      },
    }).sort({ loginAt: 1 });

    const exactLoginTime = sessions.length > 0 ? sessions[0].loginAt : null;
    let exactLogoutTime = sessions.length > 0 && sessions[sessions.length - 1].logoutAt ? sessions[sessions.length - 1].logoutAt : null;

    const eod = await EodReport.findOne({ employeeId, date }).lean();
    
    const todayStr = new Date().toISOString().split("T")[0];
    if (!exactLogoutTime) {
      if (eod?.submittedAt) {
        exactLogoutTime = eod.submittedAt;
      } else if (date < todayStr && lastEventAt) {
        exactLogoutTime = lastEventAt;
      }
    }

    let expectedLogoutTime = null;
    if (exactLoginTime) {
      const user = await User.findOne({ employeeId }).lean();

      // Mirror the exact logic from assign-shift.controller.ts for unassigned policies
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'short'
      });
      const parts = formatter.formatToParts(new Date(exactLoginTime));
      const getPart = (type: string) => parts.find(p => p.type === type)?.value;
      const hourStr = getPart("hour") || "00";
      const minStr = getPart("minute") || "00";
      const weekday = getPart("weekday") || "Mon";
      const timeVal = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);

      let shiftEndTimeStr = "18:30";
      if (timeVal >= (12 * 60 + 30)) {
        shiftEndTimeStr = weekday === "Sat" ? "17:00" : "18:30";
      } else if (weekday === "Sat") {
        shiftEndTimeStr = "17:00";
      } else if (weekday === "Sun") {
        shiftEndTimeStr = "00:00";
      } else {
        if (timeVal <= (10 * 60)) {
          shiftEndTimeStr = "18:30";
        } else if (timeVal <= (10 * 60 + 30)) {
          shiftEndTimeStr = "19:00";
        } else {
          shiftEndTimeStr = "19:30";
        }
      }

      const dateStr = new Date(exactLoginTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      expectedLogoutTime = new Date(`${dateStr}T${shiftEndTimeStr}:00+05:30`);

      // Override if explicitly assigned
      if ((user as any)?.assignedShiftPolicyId) {
        const policy = await ShiftPolicy.findById((user as any).assignedShiftPolicyId).lean();
        if (policy) {
          if ((policy as any).shiftEndTime) {
            const dateStr = new Date(exactLoginTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            expectedLogoutTime = new Date(`${dateStr}T${(policy as any).shiftEndTime}:00+05:30`);
          } else if ((policy as any).minimumWorkMinutes) {
            expectedLogoutTime = new Date(new Date(exactLoginTime).getTime() + (policy as any).minimumWorkMinutes * 60000);
          }
        }
      }
    }

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
          breakSeconds,
          offlineWorkSeconds,
          focusScore,
          topApps,
          sessionStart: firstEventAt,
          lastSeen: lastEventAt,
          exactLoginTime,
          exactLogoutTime,
          expectedLogoutTime,
          eventCount: events.length,
          segments,
        },
        "Live stats fetched"
      )
    );
  }
);
