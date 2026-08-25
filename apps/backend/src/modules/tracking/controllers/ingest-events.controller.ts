import { Response } from "express";
import { ZodError } from "zod";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import {
  ingestEventsSchema,
  singleEventSchema,
} from "../validators/ingest-events.validator";
import { ingestEvents } from "../services/ingest-events.service";
import { FailedEvent } from "../models/failed-event.model";
import { User } from "../../users/model/user.model";
import { notificationService } from "../../../shared/services/notification.service";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const ingestEventsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    try {
      const validatedData = ingestEventsSchema.parse({
        body: req.body,
      });

      console.log(
        `Received batch of ${validatedData.body.events.length} tracking events`,
      );

      const validEvents: any[] = [];
      const failedEventsToSave: any[] = [];

      // EVENT ISOLATION LOOP
      for (const rawEvent of validatedData.body.events) {
        // 1. First attempt to coerce common issues
        if (rawEvent && typeof rawEvent === "object") {
          if (!rawEvent.timestamp) {
            rawEvent.timestamp = new Date().toISOString();
          }
          if (!rawEvent.eventId) {
            rawEvent.eventId = `recovered-${Date.now()}-${Math.random()}`;
          }
        }

        // 2. Safely parse against strict rules
        const parseResult = singleEventSchema.safeParse(rawEvent);

        if (parseResult.success) {
          validEvents.push({
            ...parseResult.data,
            employeeId: req.user?.employeeId || parseResult.data.employeeId,
          });
        } else {
          console.error(
            "Event failed strict validation, pushing to Sync Errors log",
          );
          failedEventsToSave.push({
            rawPayload: rawEvent,
            rejectionReason: JSON.stringify(parseResult.error.issues),
            employeeId: rawEvent?.employeeId || "Unknown",
            deviceId: rawEvent?.deviceId || "Unknown",
            deviceTimestamp: rawEvent?.timestamp || new Date().toISOString(),
          });
        }
      }

      // 3. Save irreparably broken events to the Dead Letter Queue
      if (failedEventsToSave.length > 0) {
        await FailedEvent.insertMany(failedEventsToSave).catch((e) => {
          console.error("Could not save failed events to DB:", e);
        });
      }

      // -- Broadcast Login / Logout events via SSE --
      try {
        const authEvents = validEvents.filter(e => e.type === "LOGIN" || e.type === "LOGOUT");
        if (authEvents.length > 0) {
          const empIds = [...new Set(authEvents.map(e => e.employeeId))];
          const users = await User.find({ employeeId: { $in: empIds } }, "employeeId name").lean();
          const userMap = new Map(users.map(u => [u.employeeId, u.name]));

          for (const ev of authEvents) {
            const empName = userMap.get(ev.employeeId) || ev.employeeId;
            if (ev.type === "LOGIN") {
              notificationService.broadcast("auth_event", {
                title: "User Logged In",
                message: `${empName} (${ev.employeeId}) has logged in.`,
                employeeId: ev.employeeId,
                type: "LOGIN"
              });
            } else if (ev.type === "LOGOUT") {
              const reason = ev.metadata?.reason || "Explicit Logout";
              notificationService.broadcast("auth_event", {
                title: reason === "AUTH_FAILURE" ? "Authentication Failure" : "User Logged Out",
                message: reason === "AUTH_FAILURE" 
                  ? `${empName} (${ev.employeeId}) was logged out due to auth failure.`
                  : `${empName} (${ev.employeeId}) has logged out.`,
                employeeId: ev.employeeId,
                type: "LOGOUT",
                reason
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to broadcast auth events", err);
      }

      // 4. Process the valid events normally
      let result = null;
      if (validEvents.length > 0) {
        result = await ingestEvents({ events: validEvents });
        result = {
          ...result,
          rejectedCount: failedEventsToSave.length,
          rejectedEventIds: failedEventsToSave.map(
            (event) => event.rawPayload?.eventId || "UNKNOWN",
          ),
        };
        console.log(
          `Successfully ingested ${validEvents.length} valid events.`,
        );
      }

      // 5. ALWAYS return 201 so the desktop agent clears its queue!
      return res
        .status(201)
        .json(successResponse(result, "Batch processed successfully"));
    } catch (error) {
      if (error instanceof ZodError) {
        // This only triggers if the base array structure is invalid
        return res
          .status(400)
          .json({
            success: false,
            message: "Invalid payload structure",
            errors: error.issues,
          });
      }

      // Even on server error, return 201 to unblock agent queue?
      // No, 500 should still be retried because it's a true network/DB failure.
      console.error("Tracking ingestion failed:", error);
      return res.status(500).json({
        success: false,
        message: "Tracking ingestion failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);
