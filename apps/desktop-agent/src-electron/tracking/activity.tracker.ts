import { activeWindow } from "active-win";

import crypto from "crypto";

import { eventQueue } from "./event.queue";

import { authStore } from "../store/auth.store";

let trackingInterval:
  NodeJS.Timeout | null =
    null;

export const startTracking =
  () => {
    if (
      trackingInterval
    ) {
      return;
    }

    console.log(
      "Tracking started"
    );

    trackingInterval =
      setInterval(
        async () => {
          try {
            const result =
              await activeWindow();

            if (!result) {
              return;
            }

            const user =
              authStore.get(
                "user"
              ) as any;

            /*
              Generate enterprise-grade
              tracking event
            */

            const event = {
              eventId:
                crypto.randomUUID(),

              employeeId:
                user?._id ||

                "UNKNOWN_EMPLOYEE",

              companyId:
                user?.companyId ||

                "UNKNOWN_COMPANY",

              deviceId:
                "DESKTOP_WINDOWS",

              sessionId:
                "ACTIVE_SESSION",

              type:
                "ACTIVE_WINDOW",

              source:
                "DESKTOP_AGENT",

              timestamp:
                new Date().toISOString(),

              app:
                result.owner
                  .name,

              title:
                result.title,

              metadata: {
                url:
                  "url" in result
                    ? result.url
                    : undefined
              }
            };

            console.log(
              event
            );

            eventQueue.add(
              event
            );

            console.log(
              `Queue Size: ${eventQueue.getAll().length}`
            );
          } catch (error) {
            console.error(
              "Tracking error:",
              error
            );
          }
        },

        5000
      );
  };

export const stopTracking =
  () => {
    if (
      trackingInterval
    ) {
      clearInterval(
        trackingInterval
      );

      trackingInterval =
        null;
    }

    console.log(
      "Tracking stopped"
    );
  };