import crypto from "crypto";

import { app, powerMonitor } from "electron";

import { eventQueue } from "./event.queue";

import { authStore } from "../store/auth.store";

export const sessionId =
  crypto.randomUUID();

const createSessionEvent =
  (type: string) => {
    const user =
      authStore.get(
        "user"
      ) as any;

    return {
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

      sessionId,

      type,

      source:
        "DESKTOP_AGENT",

      timestamp:
        new Date().toISOString(),

      metadata: {}
    };
  };

export const startSessionTracking =
  () => {
    /*
      Session started
    */

    eventQueue.add(
      createSessionEvent(
        "SESSION_START"
      )
    );

    console.log(
      "SESSION_START"
    );

    /*
      Heartbeat every minute
    */

    setInterval(() => {
      eventQueue.add(
        createSessionEvent(
          "HEARTBEAT"
        )
      );

      console.log(
        "HEARTBEAT"
      );
    }, 60000);

    /*
      System lock
    */

    powerMonitor.on(
      "lock-screen",

      () => {
        eventQueue.add(
          createSessionEvent(
            "SYSTEM_LOCK"
          )
        );

        console.log(
          "SYSTEM_LOCK"
        );
      }
    );

    /*
      System unlock
    */

    powerMonitor.on(
      "unlock-screen",

      () => {
        eventQueue.add(
          createSessionEvent(
            "SYSTEM_UNLOCK"
          )
        );

        console.log(
          "SYSTEM_UNLOCK"
        );
      }
    );

    /*
      App close
    */

    app.on(
      "before-quit",

      () => {
        eventQueue.add(
          createSessionEvent(
            "SESSION_END"
          )
        );

        console.log(
          "SESSION_END"
        );
      }
    );
  };