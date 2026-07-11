import crypto from "crypto";

import { app, powerMonitor } from "electron";

import { EventType } from "@workforce/shared-types";

import { eventQueue } from "./event.queue";

import { createTrackingEvent } from "./event.factory";

import { triggerAwayPrompt } from "./idle.tracker";
import { trackingState } from "./tracking-state";

// Session ID moved to trackingState to avoid circular dependencies

let lockTime: Date | null = null;

export const startSessionTracking = () => {
  eventQueue.push(createTrackingEvent(EventType.SESSION_START));

  console.log("[Session] SESSION_START");

  setInterval(() => {
    eventQueue.push(createTrackingEvent(EventType.HEARTBEAT));
  }, 60000);

  powerMonitor.on(
    "lock-screen",

    () => {
      lockTime = new Date();
      eventQueue.push(createTrackingEvent(EventType.SYSTEM_SLEEP));
    },
  );

  powerMonitor.on(
    "unlock-screen",

    () => {
      if (lockTime) {
        const todayStr = new Date().toISOString().split("T")[0];
        const lockDayStr = lockTime.toISOString().split("T")[0];
        if (todayStr === lockDayStr) {
          const lockDurationMins = (Date.now() - lockTime.getTime()) / 60000;
          if (lockDurationMins >= trackingState.idleTimeoutSecs / 60) {
            triggerAwayPrompt(lockTime);
          }
        }
        lockTime = null;
      }
      eventQueue.push(createTrackingEvent(EventType.SYSTEM_WAKE));
    },
  );

  powerMonitor.on(
    "suspend",

    () => {
      lockTime = new Date();
      eventQueue.push(createTrackingEvent(EventType.SYSTEM_SLEEP));
    },
  );

  powerMonitor.on(
    "resume",

    () => {
      if (lockTime) {
        const todayStr = new Date().toISOString().split("T")[0];
        const lockDayStr = lockTime.toISOString().split("T")[0];
        if (todayStr === lockDayStr) {
          const lockDurationMins = (Date.now() - lockTime.getTime()) / 60000;
          if (lockDurationMins >= trackingState.idleTimeoutSecs / 60) {
            triggerAwayPrompt(lockTime);
          }
        }
        lockTime = null;
      }
      eventQueue.push(createTrackingEvent(EventType.SYSTEM_WAKE));
    },
  );

  app.on(
    "before-quit",

    () => {
      eventQueue.push(createTrackingEvent(EventType.SESSION_END));
    },
  );
};
