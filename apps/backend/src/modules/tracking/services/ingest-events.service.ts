import { ActivityEvent } from "../model/activity-event.model";
import { resolveProductivityRule } from "../../productivity-rules/services/resolve-productivity-rule.service";
import { upsertDeviceFromEvent } from "../../devices/services/upsert-device-from-event.service";
import { generateDailyAnalytics } from "../../analytics/services/generate-daily-analytics.service";
import { EventType } from "../../../_shared/types";
import {
  getBusinessDate,
  getBusinessDayBounds,
} from "../../attendance/services/shift-schedule.service";
import { FailedEvent } from "../models/failed-event.model";

interface IngestEventsInput {
  events: any[];
}

export const ingestEvents = async (payload: IngestEventsInput) => {
  try {
    // 0. Upsert Devices. Device-page attachment is important, but it is
    // metadata around telemetry; it must never block the agent queue.
    await Promise.all(
      payload.events.map(async (ev) => {
        try {
          await upsertDeviceFromEvent(ev);
        } catch (err) {
          console.error(
            `[Tracking] Stored telemetry path continues after device upsert failed for ${ev?.employeeId || "unknown"} / ${ev?.deviceId || "unknown"}:`,
            err,
          );
          await FailedEvent.create({
            rawPayload: ev,
            rejectionReason:
              err instanceof Error
                ? `Device upsert failed: ${err.message}`
                : "Device upsert failed",
            employeeId: ev?.employeeId || "Unknown",
            deviceId: ev?.deviceId || "Unknown",
            deviceTimestamp: ev?.timestamp || new Date().toISOString(),
          }).catch((logErr) => {
            console.error("Could not save device upsert failure:", logErr);
          });
        }
      }),
    );

    // 1. Enrich events
    // WARNING: If resolveProductivityRule does not use an in-memory or Redis cache,
    // this map will DDoS your own database. Ensure rule lookups are cached.
    const enrichedEvents = await Promise.all(
      payload.events.map(async (event) => {
        const metadata = event.metadata || {};
        const rule = await resolveProductivityRule({
          companyId: event.companyId,
          employeeId: event.employeeId,
          appName: metadata.app || "UNKNOWN_APP",
          title: metadata.title,
        });

        return {
          ...event,
          productivityCategory: rule.productivityCategory,
          productivityScore: rule.productivityScore,
          matchedRuleId: (rule as any)._id || null,
        };
      }),
    );

    // 2. Use bulkWrite for Idempotency
    // If the agent resends the same eventId, $setOnInsert ignores it. No duplicates.
    const operations = enrichedEvents.map((event) => ({
      updateOne: {
        filter: { eventId: event.eventId },
        update: { $setOnInsert: event },
        upsert: true,
      },
    }));

    const result = await ActivityEvent.bulkWrite(operations as any, {
      ordered: false,
    });

    // 2.5 Intercept LOGOUT events to close WorkSessions immediately
    const logoutEvents = enrichedEvents.filter((e) => e.type === "LOGOUT");
    if (logoutEvents.length > 0) {
      const { WorkSession } =
        await import("../../work-sessions/model/work-session.model");
      await Promise.all(
        logoutEvents.map(async (logout) => {
          await WorkSession.findOneAndUpdate(
            { employeeId: logout.employeeId, logoutAt: null },
            {
              $set: {
                logoutAt: new Date(logout.timestamp),
                status: "COMPLETED",
              },
            },
            { sort: { createdAt: -1 } },
          );
        }),
      );
    }

    // 2.6 Create/repair WorkSessions from proof of real human presence.
    // SESSION_START can be emitted by a midnight relaunch or boot before the
    // employee has actually unlocked/used the laptop, so it must not become
    // the official login time by itself.
    const presenceEventTypes = [
      EventType.USER_ACTIVITY,
      EventType.ACTIVE_WINDOW,
      EventType.LOGIN,
    ];
    const presenceEvents = enrichedEvents.filter((e) =>
      presenceEventTypes.includes(e.type),
    );
    if (presenceEvents.length > 0) {
      const { WorkSession } =
        await import("../../work-sessions/model/work-session.model");
      const { User } = await import("../../users/model/user.model");

      for (const start of presenceEvents.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      )) {
          const eventBusinessDate = getBusinessDate(new Date(start.timestamp));
          const { start: sessionDayStart, end: sessionDayEnd } =
            getBusinessDayBounds(eventBusinessDate);

          // Old releases could leave prior-day sessions open. Do not let those
          // stale rows swallow today's telemetry or become today's login time.
          await WorkSession.updateMany(
            {
              employeeId: start.employeeId,
              logoutAt: null,
              status: "ACTIVE",
              loginAt: { $lt: sessionDayStart },
            },
            {
              $set: {
                logoutAt: sessionDayStart,
                status: "COMPLETED",
              },
            },
          );

          // Check if an active session already exists for this business day.
          const activeSession = await WorkSession.findOne({
            employeeId: start.employeeId,
            logoutAt: null,
            status: "ACTIVE",
            loginAt: { $gte: sessionDayStart, $lte: sessionDayEnd },
          }).sort({ loginAt: -1 });

          if (activeSession) {
            const previousPresence = await ActivityEvent.exists({
              employeeId: start.employeeId,
              invalidated: { $ne: true },
              type: { $in: presenceEventTypes },
              timestamp: {
                $gte: activeSession.loginAt,
                $lt: new Date(start.timestamp),
              },
            });

            if (!previousPresence) {
              activeSession.loginAt = new Date(start.timestamp);
              await activeSession.save();
            }
          } else {
            const hasCompletedSessionToday = await WorkSession.exists({
              employeeId: start.employeeId,
              status: "COMPLETED",
              loginAt: { $gte: sessionDayStart, $lte: sessionDayEnd },
            });

            if (hasCompletedSessionToday && start.type !== EventType.LOGIN) {
              continue;
            }

            // Fetch user to get name and department
            const user = await User.findOne({ employeeId: start.employeeId });
            if (user) {
              await WorkSession.create({
                employeeId: user.employeeId,
                employeeName: user.name,
                departmentId: user.departmentId || null,
                departmentName: user.departmentName || null,
                loginAt: new Date(start.timestamp),
                todoList: [],
              });
            }
          }
      }
    }

    // 3. Trigger Analytics Generation asynchronously for the affected employees/dates
    const syncTasks = new Map<
      string,
      { companyId: string; employeeId: string; date: string }
    >();
    enrichedEvents.forEach((e) => {
      if (!e.timestamp) return;
      const dateStr = getBusinessDate(new Date(e.timestamp));
      const key = `${e.companyId}-${e.employeeId}-${dateStr}`;
      if (!syncTasks.has(key)) {
        syncTasks.set(key, {
          companyId: e.companyId,
          employeeId: e.employeeId,
          date: dateStr,
        });
      }
    });

    await Promise.all(
      Array.from(syncTasks.values()).map(async (task) => {
        // Analytics and attendance are derived data. A repair failure must not
        // make the desktop agent keep retrying an otherwise stored telemetry batch.
        generateDailyAnalytics(task.companyId, task.employeeId, task.date).catch(
          (err) => {
            console.error(
              `Failed to generate daily analytics on ingest for ${task.employeeId} ${task.date}:`,
              err,
            );
          },
        );

        try {
          const { User } = await import("../../users/model/user.model");
          const { computeAttendanceFromEvents } = await import(
            "../../attendance/services/compute-attendance.service"
          );

          const user = await User.findOne({
            employeeId: task.employeeId,
            isActive: true,
          }).lean();
          if (!user) {
            console.warn(
              `[Tracking] Stored telemetry but skipped attendance repair: active employee not found for ${task.employeeId}.`,
            );
            return;
          }
          await computeAttendanceFromEvents({
            employeeId: task.employeeId,
            date: task.date,
            shiftPolicyId: user.assignedShiftPolicyId || "",
          });
        } catch (err) {
          console.error(
            `Stored telemetry but failed attendance repair for ${task.employeeId} ${task.date}:`,
            err,
          );
        }
      }),
    );

    return {
      success: true,
      insertedCount: result.upsertedCount,
      duplicatesIgnored: result.matchedCount,
      failedCount: 0,
      failedEvents: [],
    };
  } catch (error) {
    // Events are idempotent. Returning an error keeps the agent's local queue;
    // the retry safely reuses the same event IDs and reruns attendance repair.
    throw error;
  }
};
