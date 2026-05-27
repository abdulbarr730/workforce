import crypto from "crypto";

import {
  app,
  powerMonitor
} from "electron";

import {
  EventType
} from "@workforce/shared-types";

import { eventQueue }
  from "./event.queue";

import {
  createTrackingEvent
} from "./event.factory";

// Session ID moved to trackingState to avoid circular dependencies

export const startSessionTracking =
  () => {
    eventQueue.push(
      createTrackingEvent(
        EventType.SESSION_START
      )
    );

    console.log(
      "[Session] SESSION_START"
    );

    setInterval(() => {
      eventQueue.push(
        createTrackingEvent(
          EventType.HEARTBEAT
        )
      );
    }, 60000);

    powerMonitor.on(
      "lock-screen",

      () => {
        eventQueue.push(
          createTrackingEvent(
            EventType.SYSTEM_SLEEP
          )
        );
      }
    );

    powerMonitor.on(
      "unlock-screen",

      () => {
        eventQueue.push(
          createTrackingEvent(
            EventType.SYSTEM_WAKE
          )
        );
      }
    );

    powerMonitor.on(
      "suspend",

      () => {
        eventQueue.push(
          createTrackingEvent(
            EventType.SYSTEM_SLEEP
          )
        );
      }
    );

    powerMonitor.on(
      "resume",

      () => {
        eventQueue.push(
          createTrackingEvent(
            EventType.SYSTEM_WAKE
          )
        );
      }
    );

    app.on(
      "before-quit",

      () => {
        eventQueue.push(
          createTrackingEvent(
            EventType.SESSION_END
          )
        );
      }
    );
  };