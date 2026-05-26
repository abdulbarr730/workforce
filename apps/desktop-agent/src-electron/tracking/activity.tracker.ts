import { activeWindow } from "active-win";
import crypto from "crypto";
import { eventQueue } from "./event.queue";
import { authStore } from "../store/auth.store";
import { getDeviceId, getDeviceMeta } from "./device-info";
import { sessionId } from "./session.manager";

let trackingInterval: NodeJS.Timeout | null = null;

export const startTracking = () => {
  if (trackingInterval) return;

  console.log("Tracking started");

  trackingInterval = setInterval(async () => {
    try {
      const result = await activeWindow();
      if (!result) return;

      const user = authStore.get("user") as any;
      const meta = getDeviceMeta();

      const event = {
        eventId: crypto.randomUUID(),
        employeeId: user?.employeeId || "UNKNOWN_EMPLOYEE",
        companyId: user?.companyId || "prosync",
        deviceId: getDeviceId(),
        sessionId,
        type: "ACTIVE_WINDOW",
        source: "DESKTOP_AGENT",
        timestamp: new Date().toISOString(),
        metadata: {
          app: result.owner.name,
          title: result.title,
          url: "url" in result ? result.url : undefined,
          ...meta,
        },
      };

      eventQueue.add(event);
      console.log(`Tracked: ${result.owner.name} | Queue: ${eventQueue.size()}`);
    } catch (error) {
      console.error("Tracking error:", error);
    }
  }, 5000);
};

export const stopTracking = () => {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  console.log("Tracking stopped");
};
