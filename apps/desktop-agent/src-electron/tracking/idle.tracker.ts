import { powerMonitor } from "electron";

import crypto from "crypto";

import { eventQueue } from "./event.queue";

import { authStore } from "../store/auth.store";

let isIdle = false;

export const startIdleTracking =
  () => {
    console.log(
      "Idle tracking started"
    );

    setInterval(() => {
      try {
        const idleSeconds =
          powerMonitor.getSystemIdleTime();

        const user =
          authStore.get(
            "user"
          ) as any;

        /*
          User became idle
        */

        if (
          idleSeconds >= 60 &&
          !isIdle
        ) {
          isIdle = true;

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
              "IDLE_START",

            source:
              "DESKTOP_AGENT",

            app:
              "DESKTOP_AGENT",

            title:
              "Idle Tracking",

            timestamp:
              new Date().toISOString(),

            metadata: {
              idleSeconds
            }
          };

          console.log(
            "IDLE_START"
          );

          eventQueue.add(
            event
          );
        }

        /*
          User returned
        */

        if (
          idleSeconds < 60 &&
          isIdle
        ) {
          isIdle = false;

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
              "IDLE_END",

            source:
              "DESKTOP_AGENT",

            app:
              "DESKTOP_AGENT",

            title:
              "Idle Tracking",

            timestamp:
              new Date().toISOString(),

            metadata: {
              idleSeconds
            }
          };

          console.log(
            "IDLE_END"
          );

          eventQueue.add(
            event
          );
        }
      } catch (error) {
        console.error(
          "Idle tracking error:",
          error
        );
      }
    }, 5000);
  };