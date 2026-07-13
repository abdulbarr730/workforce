import { ActivityEvent } from "../model/activity-event.model";
import { resolveProductivityRule } from "../../productivity-rules/services/resolve-productivity-rule.service";
import { upsertDeviceFromEvent } from "../../devices/services/upsert-device-from-event.service";
import { generateDailyAnalytics } from "../../analytics/services/generate-daily-analytics.service";

interface IngestEventsInput {
  events: any[];
}

export const ingestEvents = async (payload: IngestEventsInput) => {
  try {
    // 0. Upsert Devices
    await Promise.all(payload.events.map((ev) => upsertDeviceFromEvent(ev)));

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
    const logoutEvents = enrichedEvents.filter((e) => e.eventType === "LOGOUT");
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

    // 2.6 Intercept START_TRACKING events to create a new WorkSession if one doesn't exist
    const startEvents = enrichedEvents.filter(
      (e) => e.eventType === "START_TRACKING",
    );
    if (startEvents.length > 0) {
      const { WorkSession } =
        await import("../../work-sessions/model/work-session.model");
      const { User } = await import("../../users/model/user.model");

      await Promise.all(
        startEvents.map(async (start) => {
          // Check if an active session already exists
          const activeSession = await WorkSession.findOne({
            employeeId: start.employeeId,
            logoutAt: null,
            status: "ACTIVE",
          });

          if (!activeSession) {
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
        }),
      );
    }

    // 3. Trigger Analytics Generation asynchronously for the affected employees/dates
    const syncTasks = new Map<
      string,
      { companyId: string; employeeId: string; date: string }
    >();
    enrichedEvents.forEach((e) => {
      if (!e.timestamp) return;
      const dateStr = new Date(e.timestamp).toISOString().split("T")[0];
      const key = `${e.companyId}-${e.employeeId}-${dateStr}`;
      if (!syncTasks.has(key)) {
        syncTasks.set(key, {
          companyId: e.companyId,
          employeeId: e.employeeId,
          date: dateStr,
        });
      }
    });

    Array.from(syncTasks.values()).forEach((task) => {
      generateDailyAnalytics(task.companyId, task.employeeId, task.date).catch(
        (err) => {
          console.error("Failed to generate daily analytics on ingest:", err);
        },
      );
    });

    return {
      success: true,
      insertedCount: result.upsertedCount,
      duplicatesIgnored: result.matchedCount,
      failedCount: 0,
      failedEvents: [],
    };
  } catch (error: any) {
    const writeErrors = error?.writeErrors || [];
    const failedEvents = writeErrors.map((err: any) => ({
      eventId: err.err?.op?.q?.eventId || "UNKNOWN",
      reason: err.errmsg || "Insert failed",
    }));

    return {
      success: true,
      insertedCount: payload.events.length - failedEvents.length,
      failedCount: failedEvents.length,
      failedEvents,
    };
  }
};
