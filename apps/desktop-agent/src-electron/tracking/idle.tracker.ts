import { powerMonitor } from "electron";
import crypto from "crypto";
import { eventQueue } from "./event.queue";
import { authStore } from "../store/auth.store";
import { getDeviceId, getDeviceMeta } from "./device-info";
import { sessionId } from "./session.manager";

let isIdle = false;

export const startIdleTracking = () => {
  console.log("Idle tracking started");

  setInterval(() => {
    try {
      const idleSeconds = powerMonitor.getSystemIdleTime();
      const user = authStore.get("user") as any;
      const meta = getDeviceMeta();

      const baseEvent = {
        eventId: crypto.randomUUID(),
        employeeId: user?.employeeId || "UNKNOWN_EMPLOYEE",
        companyId: user?.companyId || "prosync",
        deviceId: getDeviceId(),
        sessionId,
        source: "DESKTOP_AGENT",
        timestamp: new Date().toISOString(),
      };

      // User became idle
      if (idleSeconds >= 60 && !isIdle) {
        isIdle = true;
        eventQueue.add({
          ...baseEvent,
          type: "IDLE_START",
          metadata: { idleSeconds, ...meta },
        });
        console.log("IDLE_START");
      }

      // User returned
      if (idleSeconds < 60 && isIdle) {
        isIdle = false;
        eventQueue.add({
          ...baseEvent,
          type: "IDLE_END",
          metadata: { idleSeconds, ...meta },
        });
        console.log("IDLE_END");
      }
    } catch (error) {
      console.error("Idle tracking error:", error);
    }
  }, 5000);
};
