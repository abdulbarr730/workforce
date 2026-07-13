import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { User } from "../../users/model/user.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";

export const getLiveStatsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // Admin can pass ?employeeId=EMP001; employees use their own JWT employeeId
    const employeeId =
      (req.query.employeeId as string | undefined) || req.user?.employeeId;
    const date =
      (req.query.date as string) || new Date().toISOString().split("T")[0];

    if (!employeeId) {
      return res
        .status(400)
        .json({ success: false, message: "employeeId required" });
    }

    const startOfDayKolkata = new Date(`${date}T00:00:00+05:30`);
    const endOfDayKolkata = new Date(`${date}T23:59:59.999+05:30`);

    const sessions = await WorkSession.find({
      employeeId,
      loginAt: {
        $gte: startOfDayKolkata,
        $lte: endOfDayKolkata,
      },
    }).sort({ loginAt: 1 });

    const eod = await EodReport.findOne({ employeeId, date }).lean();

    const events = await ActivityEvent.find({
      employeeId,
      timestamp: {
        $gte: startOfDayKolkata,
        $lte: endOfDayKolkata,
      },
      invalidated: { $ne: true },
    })
      .sort({ timestamp: 1 })
      .lean();

    const loginEvent = events.find((e) => e.type === "LOGIN");
    const firstActivityEvent = events[0];
    const exactLoginTime =
      sessions.length > 0 && sessions[0].loginAt
        ? sessions[0].loginAt
        : loginEvent
          ? loginEvent.timestamp
          : firstActivityEvent
            ? firstActivityEvent.timestamp
            : null;

    const logoutEvent = [...events].reverse().find((e) => e.type === "LOGOUT");
    let exactLogoutTime = logoutEvent
      ? logoutEvent.timestamp
      : sessions.length > 0 && sessions[sessions.length - 1].logoutAt
        ? sessions[sessions.length - 1].logoutAt
        : null;

    let productiveSeconds = 0;
    let unproductiveSeconds = 0;
    let neutralSeconds = 0;
    let idleSeconds = 0;
    let breakSeconds = 0;
    let offlineWorkSeconds = 0;
    const appMap: Record<string, number> = {};
    let firstEventAt: Date | null = null;
    let lastEventAt: Date | null = null;

    const segments: {
      start: string;
      end: string;
      durationSecs: number;
      type: string;
    }[] = [];
    let currentActiveSegment: {
      start: Date;
      end: Date;
      durationSecs: number;
      type: string;
    } | null = null;

    for (const ev of events) {
      const ts = new Date(ev.timestamp);
      // Use recorded durationSeconds if present (new tracker), else assume 5s (legacy)
      const dur = (ev.metadata as any)?.durationSeconds ?? 5;
      const cat = ev.productivityCategory ?? "NEUTRAL";

      if (ev.type === "ACTIVE_WINDOW") {
        // Tracker sends event at the END of its window visibility.
        // The event timestamp `ts` is when it ends.
        const tsEnd = ts;
        let tsStart = new Date(ts.getTime() - dur * 1000);
        let actualDur = dur;

        const effectiveStartTime = exactLoginTime || startOfDayKolkata;
        if (tsStart < effectiveStartTime) {
          actualDur = Math.max(
            0,
            (tsEnd.getTime() - effectiveStartTime.getTime()) / 1000,
          );
          tsStart = effectiveStartTime;
        }

        if (cat === "PRODUCTIVE") productiveSeconds += actualDur;
        else if (cat === "UNPRODUCTIVE") unproductiveSeconds += actualDur;
        else neutralSeconds += actualDur;

        const app = (ev.metadata as any)?.app;
        if (app) appMap[app] = (appMap[app] || 0) + actualDur;

        if (!currentActiveSegment) {
          currentActiveSegment = {
            start: tsStart,
            end: tsEnd,
            durationSecs: actualDur,
            type: cat,
          };
        } else {
          // If category matches and time gap is <= 120 seconds, coalesce
          const timeDiffSecs =
            (tsStart.getTime() - currentActiveSegment.end.getTime()) / 1000;
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
            currentActiveSegment = {
              start: tsStart,
              end: tsEnd,
              durationSecs: dur,
              type: cat,
            };
          }
        }
      }

      if (ev.type === "IDLE_START") {
        let idleDur = (ev.metadata as any)?.idleSeconds ?? 300;

        const effectiveStartTime = exactLoginTime || startOfDayKolkata;
        let idleStartTime = new Date(ts.getTime() - idleDur * 1000);

        if (idleStartTime < effectiveStartTime) {
          idleDur = Math.max(
            0,
            (ts.getTime() - effectiveStartTime.getTime()) / 1000,
          );
        }

        idleSeconds += idleDur;
      }

      if (ev.type === "IDLE_END") {
        let idleDur =
          (ev.metadata as any)?.idleDurationSecs ??
          (ev.metadata as any)?.idleSeconds ??
          5;

        const effectiveStartTime = exactLoginTime || startOfDayKolkata;
        let idleStartTime = new Date(ts.getTime() - idleDur * 1000);

        if (idleStartTime < effectiveStartTime) {
          idleDur = (ts.getTime() - effectiveStartTime.getTime()) / 1000;
          idleStartTime = effectiveStartTime;
        }

        idleSeconds += idleDur;
      }

      if (ev.type === "IDLE_RESPONSE") {
        const isWorkingRaw = (ev.metadata as any)?.isWorking;
        const isWorking = isWorkingRaw === true || isWorkingRaw === "true";

        // We want to reclassify the *entire* last idle duration that was accumulated.
        // IDLE_RESPONSE usually follows IDLE_END, so we can reclassify up to the last IDLE_END duration.
        // If idleMinutes is missing, we reclassify the entire idleSeconds buffer.
        let dur = 0;
        if ((ev.metadata as any)?.idleMinutes) {
          dur = (ev.metadata as any).idleMinutes * 60;
        } else {
          // Fallback to whatever is currently in idleSeconds to reclassify it
          dur = idleSeconds;
        }

        const effectiveStartTime = exactLoginTime || startOfDayKolkata;
        let idleStartTime = new Date(ts.getTime() - dur * 1000);
        if (idleStartTime < effectiveStartTime) {
          dur = Math.max(
            0,
            (ts.getTime() - effectiveStartTime.getTime()) / 1000,
          );
          idleStartTime = effectiveStartTime;
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
          const type = (ev.metadata as any)?.isWorking ? "OFFLINE" : "BREAK";
          // Ensure we don't push a segment that goes before startOfDayKolkata
          const actualStartTime = idleStartTime;
          segments.push({
            start: actualStartTime.toISOString(),
            end: ts.toISOString(),
            durationSecs: dur,
            type,
          });
        }

        if (dur > 0) {
          if (isWorking) {
            offlineWorkSeconds += dur;
          } else {
            breakSeconds += dur;
          }

          // Remove this duration from the idleSeconds buffer so we don't double count it
          // We use Math.max to prevent it from going negative
          idleSeconds = Math.max(0, idleSeconds - dur);
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

    // Deduct idle/break/offline time from active buckets proportionally to prevent double-counting
    const totalDeduction = idleSeconds + breakSeconds + offlineWorkSeconds;
    const totalActive =
      productiveSeconds + unproductiveSeconds + neutralSeconds;

    if (totalDeduction > 0 && totalActive > 0) {
      const pRatio = productiveSeconds / totalActive;
      const uRatio = unproductiveSeconds / totalActive;
      const nRatio = neutralSeconds / totalActive;

      const pDeduct = Math.min(
        productiveSeconds,
        Math.round(totalDeduction * pRatio),
      );
      const uDeduct = Math.min(
        unproductiveSeconds,
        Math.round(totalDeduction * uRatio),
      );
      const nDeduct = Math.min(
        neutralSeconds,
        Math.round(totalDeduction * nRatio),
      );

      productiveSeconds -= pDeduct;
      unproductiveSeconds -= uDeduct;
      neutralSeconds -= nDeduct;
    }

    const totalTrackedSeconds =
      productiveSeconds +
      unproductiveSeconds +
      neutralSeconds +
      offlineWorkSeconds +
      idleSeconds +
      breakSeconds;
    const focusScore =
      totalTrackedSeconds === 0
        ? 0
        : Math.round(100 - (unproductiveSeconds / totalTrackedSeconds) * 100);

    const topApps = Object.entries(appMap)
      .map(([app, seconds]) => ({ app, seconds }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 10);

    if (
      !exactLogoutTime &&
      date < new Date().toISOString().split("T")[0] &&
      lastEventAt
    ) {
      exactLogoutTime = lastEventAt;
    }

    const attendanceRec = await AttendanceRecord.findOne({
      employeeId,
      date,
    }).lean();
    let expectedLogoutTime = (attendanceRec as any)?.expectedLogoutTime || null;

    if (!expectedLogoutTime && exactLoginTime) {
      const user = await User.findOne({ employeeId }).lean();

      // Mirror the exact logic from assign-shift.controller.ts for unassigned policies
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        weekday: "short",
      });
      const parts = formatter.formatToParts(new Date(exactLoginTime));
      const getPart = (type: string) =>
        parts.find((p) => p.type === type)?.value;
      const hourStr = getPart("hour") || "00";
      const minStr = getPart("minute") || "00";
      const weekday = getPart("weekday") || "Mon";
      const timeVal = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);

      const dayMap: Record<string, string> = {
        Sun: "SUNDAY",
        Mon: "MONDAY",
        Tue: "TUESDAY",
        Wed: "WEDNESDAY",
        Thu: "THURSDAY",
        Fri: "FRIDAY",
        Sat: "SATURDAY",
      };
      const activeDay = dayMap[weekday];

      let policy = null;
      if ((user as any)?.assignedShiftPolicyId) {
        policy = await ShiftPolicy.findOne({
          _id: (user as any).assignedShiftPolicyId,
          activeDays: { $in: [activeDay as any] },
          isActive: true,
        }).lean();
      }
      if (!policy) {
        policy =
          (await ShiftPolicy.findOne({
            activeDays: { $in: [activeDay as any] },
            isDefault: true,
            isActive: true,
          }).lean()) ||
          (await ShiftPolicy.findOne({
            activeDays: { $in: [activeDay as any] },
            isActive: true,
          }).lean());
      }

      const isHalfDay = (attendanceRec as any)?.attendanceStatus === "HALF_DAY";

      if (policy && !isHalfDay) {
        if ((policy as any).shiftEndTime) {
          let finalShiftEndTime = (policy as any).shiftEndTime;
          if ((policy as any).loginCutoffTime) {
            const [ch, cm] = ((policy as any).loginCutoffTime as string).split(
              ":",
            );
            const cutoffMins = Number(ch) * 60 + Number(cm);
            if (timeVal > cutoffMins) {
              let [eh, em] = finalShiftEndTime.split(":").map(Number);
              em += 30;
              if (em >= 60) {
                eh += 1;
                em -= 60;
              }
              finalShiftEndTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
            }
          }
          const dateStr = new Date(exactLoginTime).toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
          });
          expectedLogoutTime = new Date(
            `${dateStr}T${finalShiftEndTime}:00+05:30`,
          );
        } else if ((policy as any).minimumWorkMinutes) {
          expectedLogoutTime = new Date(
            new Date(exactLoginTime).getTime() +
              (policy as any).minimumWorkMinutes * 60000,
          );
        }
      } else if (!policy && !isHalfDay) {
        let shiftEndTimeStr = "18:30";
        if (timeVal >= 12 * 60 + 30) {
          shiftEndTimeStr = weekday === "Sat" ? "17:00" : "18:30";
        } else if (weekday === "Sat") {
          shiftEndTimeStr = "17:00";
        } else if (weekday === "Sun") {
          shiftEndTimeStr = "00:00";
        } else {
          if (timeVal <= 10 * 60) {
            shiftEndTimeStr = "18:30";
          } else if (timeVal <= 10 * 60 + 30) {
            shiftEndTimeStr = "19:00";
          } else {
            shiftEndTimeStr = "19:30";
          }
        }
        const dateStr = new Date(exactLoginTime).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        });
        expectedLogoutTime = new Date(`${dateStr}T${shiftEndTimeStr}:00+05:30`);
      }
    }

    return res.json(
      successResponse(
        {
          date,
          employeeId,
          totalTrackedSeconds: Math.round(totalTrackedSeconds),
          productiveSeconds: Math.round(productiveSeconds),
          unproductiveSeconds: Math.round(unproductiveSeconds),
          neutralSeconds: Math.round(neutralSeconds),
          idleSeconds: Math.round(idleSeconds),
          breakSeconds: Math.round(breakSeconds),
          offlineWorkSeconds: Math.round(offlineWorkSeconds),
          focusScore,
          topApps,
          sessionStart: firstEventAt,
          lastSeen: lastEventAt,
          exactLoginTime,
          exactLogoutTime,
          expectedLogoutTime,
          eventCount: events.length,
          segments,
          shiftAssigned: (attendanceRec as any)?.shiftAssigned,
          attendanceStatus: (attendanceRec as any)?.attendanceStatus,
        },
        "Live stats fetched",
      ),
    );
  },
);
