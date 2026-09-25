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
import { scheduleDerivedRecompute } from "./derived-recompute.queue";
import {
  agentSendsInputProof,
  windowEventProvesPresence,
} from "./presence-proof.service";
import { invalidateLiveStatsCache } from "../../analytics/controllers/get-live-stats.controller";
import { announceEmployeeLogin } from "../../notifications/services/login-notification.service";

interface IngestEventsInput {
  events: any[];
}

const isMacEvent = (event: any) => {
  const platform = String(event?.metadata?.platform || "").toLowerCase();
  const os = String(event?.metadata?.os || "").toLowerCase();
  return (
    platform === "darwin" ||
    platform.includes("mac") ||
    os.includes("mac") ||
    os.includes("darwin")
  );
};

const isSessionPresenceEvent = (event: any, inputProofCapable: boolean) => {
  if ([EventType.USER_ACTIVITY, EventType.LOGIN].includes(event.type)) {
    return true;
  }
  // macOS can report a frontmost app while the laptop is sleeping/locked, and
  // current agents flush ACTIVE_WINDOW every 5 min on an untouched unlocked PC
  // (this opened false sessions just after midnight). Only agents that cannot
  // send USER_ACTIVITY fall back to ACTIVE_WINDOW as presence.
  if (event.type === EventType.ACTIVE_WINDOW) {
    return windowEventProvesPresence(event, inputProofCapable);
  }
  return false;
};

const minutesLabel = (value: unknown) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "the planned";
  return `${minutes} min`;
};

const notifyBreakEvents = async (events: any[]) => {
  const breakEvents = events.filter((event) =>
    [
      EventType.BREAK_START,
      EventType.BREAK_EXCEEDED,
      EventType.BREAK_END,
    ].includes(event.type),
  );
  if (breakEvents.length === 0) return;

  const { User } = await import("../../users/model/user.model");
  const { AdminNotification } =
    await import("../../notifications/model/admin-notification.model");
  const { createAdminAuditNotification } =
    await import("../../notifications/services/admin-notification.service");
  const { dispatchTeamsBreakNotification } =
    await import("../../notifications/services/teams-notification.service");
  const { dispatchDiscordBreakNotification } =
    await import("../../notifications/services/discord-notification.service");

  const employeeIds = Array.from(
    new Set(breakEvents.map((event) => event.employeeId).filter(Boolean)),
  );
  const users = await User.find({ employeeId: { $in: employeeIds } })
    .select("employeeId name role")
    .lean();
  const userByEmployeeId = new Map(
    users.map((user: any) => [String(user.employeeId), user]),
  );

  for (const event of breakEvents) {
    const metadata = event.metadata || {};
    const user = userByEmployeeId.get(String(event.employeeId));
    const employeeName =
      user?.name || metadata.employeeName || event.employeeId || "Employee";
    const entityId =
      event.eventId ||
      `${event.employeeId}-${event.deviceId}-${event.type}-${event.timestamp}`;
    const kind = `break_${String(event.type).toLowerCase()}`;
    const alreadyNotified = await AdminNotification.exists({
      kind,
      entityType: "BREAK",
      entityId,
    });
    if (alreadyNotified) continue;

    const eventDate = event.timestamp
      ? getBusinessDate(new Date(event.timestamp))
      : null;
    const plannedMinutes =
      metadata.plannedDurationMinutes ?? metadata.durationMinutes;
    const actualMinutes =
      event.type === EventType.BREAK_END ? metadata.durationMinutes : null;
    const exceededSeconds = Number(metadata.exceededBySeconds || 0);
    const exceededMinutes =
      exceededSeconds > 0 ? Math.ceil(exceededSeconds / 60) : 0;
    const scheduleText = metadata.scheduleId ? "scheduled" : "manual";
    const reason = String(metadata.reason || "").trim();

    let title = `${employeeName} started break`;
    let message = `${employeeName} started a ${scheduleText} ${minutesLabel(
      plannedMinutes,
    )} break.`;

    if (event.type === EventType.BREAK_EXCEEDED) {
      title = `${employeeName}'s break is in minus`;
      message = `${employeeName}'s break crossed the planned ${minutesLabel(
        plannedMinutes,
      )} time.`;
    }

    if (event.type === EventType.BREAK_END) {
      title =
        exceededMinutes > 0
          ? `${employeeName} returned late from break`
          : `${employeeName} returned from break`;
      message = `${employeeName} came back from break after ${
        actualMinutes ? `${actualMinutes} min` : "the tracked duration"
      }${
        exceededMinutes > 0
          ? `, ${exceededMinutes} min over the planned limit`
          : ""
      }.`;
    }

    await createAdminAuditNotification({
      kind,
      title,
      message,
      employeeId: event.employeeId,
      employeeName,
      entityType: "BREAK",
      entityId,
      entityDate: eventDate,
      reason,
      before: null,
      after: {
        type: event.type,
        timestamp: event.timestamp,
        scheduleId: metadata.scheduleId || null,
        plannedDurationMinutes: plannedMinutes || null,
        actualDurationMinutes: actualMinutes || null,
        exceededBySeconds: exceededSeconds,
      },
      deepLink: "/dashboard/break-scheduler",
      changedBy: {
        employeeId: event.employeeId,
        name: employeeName,
        role: user?.role || "EMPLOYEE",
      },
    });

    await dispatchTeamsBreakNotification({
      title,
      message,
      employeeName,
      eventType: event.type,
      reason,
    });
    await dispatchDiscordBreakNotification({
      title,
      message,
      employeeName,
      eventType: event.type,
      reason,
    });
  }
};

const refreshDerivedData = async (task: {
  companyId: string;
  employeeId: string;
  date: string;
}) => {
  await generateDailyAnalytics(
    task.companyId,
    task.employeeId,
    task.date,
  ).catch((err) => {
    console.error(
      `Failed to generate daily analytics on ingest for ${task.employeeId} ${task.date}:`,
      err,
    );
  });

  try {
    const { User } = await import("../../users/model/user.model");
    const { computeAttendanceFromEvents } =
      await import("../../attendance/services/compute-attendance.service");

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
};

const INPUT_NEIGHBOUR_WINDOW_MS = 10 * 60 * 1000;
const INPUT_NEIGHBOUR_MIN_GAP_MS = 30_000;

/**
 * Returns when confirmed presence began for this event, or null if it is an
 * unconfirmed lone USER_ACTIVITY. LOGIN (explicit sign-in) and legacy
 * ACTIVE_WINDOW presence need no confirmation.
 */
const confirmedPresenceStart = async (
  event: any,
  batchEvents: any[],
): Promise<Date | null> => {
  const at = new Date(event.timestamp);
  if (event.type !== EventType.USER_ACTIVITY) return at;

  const isNeighbour = (other: any) => {
    if (String(other.employeeId) !== String(event.employeeId)) return false;
    if (![EventType.USER_ACTIVITY, EventType.LOGIN].includes(other.type)) {
      return false;
    }
    const gap = Math.abs(new Date(other.timestamp).getTime() - at.getTime());
    return (
      gap >= INPUT_NEIGHBOUR_MIN_GAP_MS && gap <= INPUT_NEIGHBOUR_WINDOW_MS
    );
  };

  const neighbourTimes = batchEvents
    .filter(isNeighbour)
    .map((other) => new Date(other.timestamp).getTime());

  if (neighbourTimes.length === 0) {
    const stored = await ActivityEvent.findOne({
      employeeId: event.employeeId,
      invalidated: { $ne: true },
      type: { $in: [EventType.USER_ACTIVITY, EventType.LOGIN] },
      $or: [
        {
          timestamp: {
            $gte: new Date(at.getTime() - INPUT_NEIGHBOUR_WINDOW_MS),
            $lte: new Date(at.getTime() - INPUT_NEIGHBOUR_MIN_GAP_MS),
          },
        },
        {
          timestamp: {
            $gte: new Date(at.getTime() + INPUT_NEIGHBOUR_MIN_GAP_MS),
            $lte: new Date(at.getTime() + INPUT_NEIGHBOUR_WINDOW_MS),
          },
        },
      ],
    })
      .select("timestamp")
      .sort({ timestamp: 1 })
      .lean();
    if (!stored) return null;
    neighbourTimes.push(new Date(stored.timestamp).getTime());
  }

  return new Date(Math.min(at.getTime(), ...neighbourTimes));
};

const LIVE_STATS_STATE_EVENTS = new Set([
  "LOGIN",
  "LOGOUT",
  "BREAK_START",
  "BREAK_END",
  "IDLE_RESPONSE",
  "AWAY_WORK_START",
  "AWAY_WORK_END",
]);

const DEVICE_METADATA_KEYS = [
  "hostname",
  "os",
  "platform",
  "agentVersion",
  "hardwareFingerprint",
];

// A 50-event batch used to run ~4 device queries per event. The device row
// only needs the latest state per device, plus LOGIN (which clears a pending
// sign-out) applied first, so collapse the batch to at most two events per
// device. Device identity fields are merged from the whole batch so none are
// lost if the latest event omits them.
const pickDeviceUpsertEvents = (events: any[]) => {
  const byDevice = new Map<string, any[]>();
  for (const event of events) {
    if (!event?.deviceId) continue;
    const list = byDevice.get(event.deviceId) || [];
    list.push(event);
    byDevice.set(event.deviceId, list);
  }

  const selected: any[][] = [];
  for (const deviceEvents of byDevice.values()) {
    const ordered = [...deviceEvents].sort(
      (a, b) =>
        new Date(a.timestamp || 0).getTime() -
        new Date(b.timestamp || 0).getTime(),
    );
    const latest = ordered[ordered.length - 1];
    const deviceMetadata: Record<string, unknown> = {};
    for (const event of ordered) {
      for (const key of DEVICE_METADATA_KEYS) {
        if (event.metadata?.[key]) deviceMetadata[key] = event.metadata[key];
      }
    }
    const withDeviceMetadata = (event: any) => ({
      ...event,
      metadata: { ...deviceMetadata, ...(event.metadata || {}) },
    });

    const lastLogin = [...ordered].reverse().find((e) => e.type === "LOGIN");
    selected.push(
      lastLogin && lastLogin !== latest
        ? [withDeviceMetadata(lastLogin), withDeviceMetadata(latest)]
        : [withDeviceMetadata(latest)],
    );
  }
  return selected;
};

export const ingestEvents = async (payload: IngestEventsInput) => {
  try {
    // 0. Upsert Devices. Device-page attachment is important, but it is
    // metadata around telemetry; it must never block the agent queue.
    await Promise.all(
      pickDeviceUpsertEvents(payload.events).map(async (deviceEvents) => {
        // Per device, apply in order (LOGIN before the latest event).
        for (const ev of deviceEvents) {
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

    // State changes the employee expects to see immediately bypass the short
    // live-stats cache; ordinary window pulses just wait out the TTL.
    const stateChangeEmployeeIds = new Set(
      enrichedEvents
        .filter((event) => LIVE_STATS_STATE_EVENTS.has(String(event.type)))
        .map((event) => String(event.employeeId)),
    );
    stateChangeEmployeeIds.forEach((employeeId) =>
      invalidateLiveStatsCache(employeeId),
    );

    await notifyBreakEvents(enrichedEvents).catch((err) => {
      console.error(
        "[Tracking] Stored break telemetry but notification failed:",
        err,
      );
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
    const inputProofByEmployee = new Map<string, boolean>();
    for (const employeeId of new Set(
      enrichedEvents.map((event) => String(event.employeeId)),
    )) {
      inputProofByEmployee.set(
        employeeId,
        await agentSendsInputProof(employeeId, enrichedEvents),
      );
    }
    const inputProofCapable = (event: any) =>
      inputProofByEmployee.get(String(event.employeeId)) === true;
    // Presence types that can prove a human was at this employee's machine.
    const presenceTypesFor = (event: any) =>
      isMacEvent(event) || inputProofCapable(event)
        ? [EventType.USER_ACTIVITY, EventType.LOGIN]
        : presenceEventTypes;
    const presenceEvents = enrichedEvents.filter((event) =>
      isSessionPresenceEvent(event, inputProofCapable(event)),
    );
    if (presenceEvents.length > 0) {
      const { WorkSession, COUNTED_SESSION_FILTER } =
        await import("../../work-sessions/model/work-session.model");
      const { User } = await import("../../users/model/user.model");

      for (const start of presenceEvents.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      )) {
        const eventBusinessDate = getBusinessDate(new Date(start.timestamp));
        const { start: sessionDayStart, end: sessionDayEnd } =
          getBusinessDayBounds(eventBusinessDate);

        // Old releases could leave prior-day sessions open. Close each stale
        // row at the last real presence before the new day, not at midnight.
        const staleSessions = await WorkSession.find({
          employeeId: start.employeeId,
          logoutAt: null,
          status: "ACTIVE",
          loginAt: { $lt: sessionDayStart },
        });
        for (const staleSession of staleSessions) {
          const stalePresenceTypes = presenceTypesFor(start);
          const lastPresence = await ActivityEvent.findOne({
            employeeId: start.employeeId,
            invalidated: { $ne: true },
            type: { $in: stalePresenceTypes },
            timestamp: {
              $gte: staleSession.loginAt,
              $lt: sessionDayStart,
            },
          })
            .sort({ timestamp: -1 })
            .lean();
          staleSession.logoutAt = lastPresence
            ? new Date(lastPresence.timestamp)
            : staleSession.loginAt;
          staleSession.status = "COMPLETED";
          await staleSession.save();
        }

        // Check if an active session already exists for this business day.
        const activeSession = await WorkSession.findOne({
          employeeId: start.employeeId,
          logoutAt: null,
          status: "ACTIVE",
          loginAt: { $gte: sessionDayStart, $lte: sessionDayEnd },
        }).sort({ loginAt: -1 });

        // Real use produces USER_ACTIVITY about once a minute. A lone one
        // (e.g. a Mac waking briefly at night) must not open or split a
        // session; once a second input confirms it, the session starts at the
        // first of the pair.
        const confirmedAt = await confirmedPresenceStart(start, enrichedEvents);
        if (!confirmedAt) continue;

        if (activeSession) {
          const previousPresenceTypes = presenceTypesFor(start);
          const previousPresence = await ActivityEvent.findOne({
            employeeId: start.employeeId,
            invalidated: { $ne: true },
            type: { $in: previousPresenceTypes },
            timestamp: {
              $gte: activeSession.loginAt,
              $lt: confirmedAt,
            },
          })
            .sort({ timestamp: -1 })
            .lean();

          if (!previousPresence) {
            activeSession.loginAt = confirmedAt;
            await activeSession.save();
            continue;
          }

          const currentTimestamp = confirmedAt;
          const lastPresenceAt = new Date(previousPresence.timestamp);
          const inactiveMinutes =
            (currentTimestamp.getTime() - lastPresenceAt.getTime()) / 60000;

          if (inactiveMinutes >= 120) {
            activeSession.logoutAt = lastPresenceAt;
            activeSession.status = "COMPLETED";
            await activeSession.save();

            const user = await User.findOne({ employeeId: start.employeeId });
            if (user) {
              await WorkSession.create({
                employeeId: user.employeeId,
                employeeName: user.name,
                departmentId: user.departmentId || null,
                departmentName: user.departmentName || null,
                loginAt: currentTimestamp,
                todoList: [],
              });
            }
          }
        } else {
          const hadSessionToday = await WorkSession.exists({
            employeeId: start.employeeId,
            ...COUNTED_SESSION_FILTER,
            loginAt: { $gte: sessionDayStart, $lte: sessionDayEnd },
          });

          // Fetch user to get name and department
          const user = await User.findOne({ employeeId: start.employeeId });
          if (user) {
            await WorkSession.create({
              employeeId: user.employeeId,
              employeeName: user.name,
              departmentId: user.departmentId || null,
              departmentName: user.departmentName || null,
              loginAt: confirmedAt,
              todoList: [],
            });
            // The agent only sends LOGIN on an explicit sign-in, which most
            // employees do rarely; announce the day's first real session so
            // every employee's login reaches Discord.
            // Skip stale backlog uploads (agent was offline for hours).
            const isRecent =
              Date.now() - confirmedAt.getTime() < 3 * 60 * 60 * 1000;
            if (!hadSessionToday && isRecent) {
              announceEmployeeLogin({
                employeeId: user.employeeId,
                employeeName: user.name,
                at: confirmedAt,
              }).catch((err) =>
                console.error("[Tracking] Login announcement failed:", err),
              );
            }
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

    // Analytics and attendance are derived data. They are refreshed off the
    // request path (debounced per employee/day) so a telemetry batch is never
    // held up — or retried by the agent — because of a recompute.
    for (const task of syncTasks.values()) {
      scheduleDerivedRecompute(
        `${task.companyId}|${task.employeeId}|${task.date}`,
        () => refreshDerivedData(task),
      );
    }

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
