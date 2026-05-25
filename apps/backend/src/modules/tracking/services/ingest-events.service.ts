import { ActivityEvent } from "../model/activity-event.model";

import { resolveProductivityRule } from "../../productivity-rules/services/resolve-productivity-rule.service";
import { upsertDeviceFromEvent } from "../../devices/services/upsert-device-from-event.service";

interface IngestEventsInput {
  events: any[];
}

export const ingestEvents =
  async (
    payload: IngestEventsInput
  ) => {
    try {
      /*
        Enrich events with
        productivity intelligence
      */

      const enrichedEvents =
        await Promise.all(
          payload.events.map(
            async (event) => {
              const metadata =
                event.metadata || {};

              const rule =
                await resolveProductivityRule(
                  {
                    companyId:
                      event.companyId,

                    employeeId:
                      event.employeeId,

                    appName:
                      metadata.app ||

                      "UNKNOWN_APP",

                    title:
                      metadata.title
                  }
                );

              return {
                ...event,

                productivityCategory:
                  rule.productivityCategory,

                productivityScore:
                  rule.productivityScore,

                matchedRuleId:
                  (rule as any)._id || null
              };
            }
          )
        );

      /*
        Bulk insert

        ordered: false
        allows partial success
      */

      /*
        Upsert devices from event metadata
        (deduped by deviceId — use latest event per device)
      */
      const latestByDevice = new Map<string, any>();
      for (const e of enrichedEvents as any[]) {
        if (!e?.deviceId) continue;
        const prev = latestByDevice.get(e.deviceId);
        const prevTs = prev?.timestamp ? new Date(prev.timestamp).getTime() : 0;
        const curTs = e.timestamp ? new Date(e.timestamp).getTime() : 0;
        if (!prev || curTs >= prevTs) latestByDevice.set(e.deviceId, e);
      }
      await Promise.all(
        Array.from(latestByDevice.values()).map((e) =>
          upsertDeviceFromEvent(e).catch(() => null)
        )
      );

      const insertedEvents =
        await ActivityEvent.insertMany(
          enrichedEvents,

          {
            ordered: false
          }
        );

      return {
        success: true,

        insertedCount:
          insertedEvents.length,

        failedCount: 0,

        failedEvents: []
      };
    } catch (error: any) {
      /*
        Mongo BulkWriteError

        Some events may fail
        while others succeed
      */

      const writeErrors =
        error?.writeErrors || [];

      const failedEvents =
        writeErrors.map(
          (err: any) => ({
            eventId:
              err.err?.op
                ?.eventId ||

              "UNKNOWN",

            reason:
              err.errmsg ||
              "Insert failed"
          })
        );

      const insertedCount =
        payload.events.length -
        failedEvents.length;

      console.error(
        "Tracking ingestion partial failure:",
        failedEvents
      );

      return {
        success: true,

        insertedCount,

        failedCount:
          failedEvents.length,

        failedEvents
      };
    }
  };