import { dialog, powerMonitor } from "electron";
import crypto from "crypto";
import { eventQueue } from "./event.queue";
import { authStore } from "../store/auth.store";
import { getDeviceId, getDeviceMeta } from "./device-info";
import { sessionId } from "./session.manager";
import { trackingState } from "./tracking-state";

// Idle kicks in after 2 minutes of no input
const IDLE_THRESHOLD_SECS = 120;

let isIdle = false;
let idleStartTime: Date | null = null;

function makeBase(): object {
  const user = authStore.get("user") as any;
  return {
    eventId: crypto.randomUUID(),
    employeeId: user?.employeeId || "UNKNOWN_EMPLOYEE",
    companyId: user?.companyId || "prosync",
    deviceId: getDeviceId(),
    sessionId,
    source: "DESKTOP_AGENT",
    timestamp: new Date().toISOString(),
  };
}

async function askWasWorking(idleDurationSecs: number, from: Date, to: Date) {
  const mins = Math.max(1, Math.round(idleDurationSecs / 60));
  try {
    const { response } = await dialog.showMessageBox({
      type: "question",
      title: "Were you working?",
      message: `You were away for ${mins} minute${mins !== 1 ? "s" : ""}.`,
      detail:
        `Away from ${from.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ` +
        `to ${to.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.\n\n` +
        `Were you doing work-related activities during this time?`,
      buttons: ["Yes, mark as work time", "No, it was a break"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (response === 0) {
      // User says they were working → send override event
      eventQueue.add({
        ...makeBase(),
        type: "IDLE_OVERRIDE",
        metadata: {
          idleMinutes: mins,
          from: from.toISOString(),
          to: to.toISOString(),
          markedAsWorking: true,
          ...getDeviceMeta(),
        },
      });
      console.log(`[Idle] IDLE_OVERRIDE: ${mins}m marked as work time`);
    } else {
      console.log(`[Idle] ${mins}m confirmed as break`);
    }
  } catch (err) {
    console.error("[Idle] Prompt error:", err);
  }
}

export const startIdleTracking = () => {
  console.log("[Idle] Tracking started");

  setInterval(async () => {
    try {
      const idleSeconds = powerMonitor.getSystemIdleTime();
      const meta = getDeviceMeta();

      // Transition: active → idle
      if (idleSeconds >= IDLE_THRESHOLD_SECS && !isIdle) {
        isIdle = true;
        idleStartTime = new Date(Date.now() - idleSeconds * 1000);
        trackingState.isIdle = true;

        eventQueue.add({
          ...makeBase(),
          type: "IDLE_START",
          metadata: { idleSeconds, idleThresholdSecs: IDLE_THRESHOLD_SECS, ...meta },
        });
        console.log(`[Idle] IDLE_START (idle for ${idleSeconds}s)`);
      }

      // Transition: idle → active
      if (idleSeconds < IDLE_THRESHOLD_SECS && isIdle) {
        isIdle = false;
        trackingState.isIdle = false;
        const returnTime = new Date();
        const idleDuration = idleStartTime
          ? Math.round((returnTime.getTime() - idleStartTime.getTime()) / 1000)
          : idleSeconds;

        eventQueue.add({
          ...makeBase(),
          type: "IDLE_END",
          metadata: { idleDurationSecs: idleDuration, ...meta },
        });
        console.log(`[Idle] IDLE_END (was idle ${idleDuration}s)`);

        // Only prompt if idle was meaningful (>= 2 min)
        if (idleDuration >= IDLE_THRESHOLD_SECS && idleStartTime) {
          await askWasWorking(idleDuration, idleStartTime, returnTime);
        }
        idleStartTime = null;
      }
    } catch (err) {
      console.error("[Idle] Error:", err);
    }
  }, 5000);
};
