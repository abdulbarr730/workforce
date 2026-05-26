import crypto from "crypto";
import { app, powerMonitor } from "electron";
import { eventQueue } from "./event.queue";
import { authStore } from "../store/auth.store";
import { getDeviceId, getDeviceMeta } from "./device-info";

export const sessionId = crypto.randomUUID();

const createSessionEvent = (type: string) => {
  const user = authStore.get("user") as any;
  const meta = getDeviceMeta();

  return {
    eventId: crypto.randomUUID(),
    employeeId: user?.employeeId || "UNKNOWN_EMPLOYEE",
    companyId: user?.companyId || "prosync",
    deviceId: getDeviceId(),
    sessionId,
    type,
    source: "DESKTOP_AGENT",
    timestamp: new Date().toISOString(),
    metadata: { ...meta },
  };
};

export const startSessionTracking = () => {
  // Session started
  eventQueue.add(createSessionEvent("SESSION_START"));
  console.log("SESSION_START");

  // Heartbeat every minute
  setInterval(() => {
    eventQueue.add(createSessionEvent("HEARTBEAT"));
    console.log("HEARTBEAT");
  }, 60000);

  // System lock
  powerMonitor.on("lock-screen", () => {
    eventQueue.add(createSessionEvent("SYSTEM_SLEEP"));
    console.log("SYSTEM_SLEEP");
  });

  // System unlock
  powerMonitor.on("unlock-screen", () => {
    eventQueue.add(createSessionEvent("SYSTEM_WAKE"));
    console.log("SYSTEM_WAKE");
  });

  // App close
  app.on("before-quit", () => {
    eventQueue.add(createSessionEvent("SESSION_END"));
    console.log("SESSION_END");
  });
};
