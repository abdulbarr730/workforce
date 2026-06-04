import { dialog, powerMonitor, BrowserWindow, ipcMain } from "electron";
import { EventType } from "@workforce/shared-types";
import { eventQueue } from "./event.queue";
import { createTrackingEvent } from "./event.factory";
import { getDeviceMeta } from "./device-info";
import { trackingState } from "./tracking-state";

import { authStore } from "../store/auth.store";

const IDLE_THRESHOLD_SECS = 300; // 5 minutes

let isIdle = false;
let idleStartTime: Date | null = null;
let lastIdleStartTime: Date | null = null;
let lastIdleEndTime: Date | null = null;
let idleOverlayWin: BrowserWindow | null = null;
let hasInitializedActive = false;

function showIdlePopup() {
  if (idleOverlayWin) return;

  eventQueue.push(
    createTrackingEvent(EventType.IDLE_POPUP_SHOWN, {
      ...getDeviceMeta()
    })
  );

  try {
    idleOverlayWin = new BrowserWindow({
      width: 450,
      height: 320,
      center: true,
      alwaysOnTop: true,
      transparent: false,
      frame: false,
      resizable: false,
      skipTaskbar: false,
      webPreferences: {
        preload: require("path").join(__dirname, "../preload/preload.mjs"),
        contextIsolation: true,
        sandbox: false,
      },
    });

    idleOverlayWin.setAlwaysOnTop(true, "screen-saver");

    if (process.env.ELECTRON_RENDERER_URL) {
      idleOverlayWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/#/idle`);
    } else {
      idleOverlayWin.loadFile(require("path").join(__dirname, "../renderer/index.html"), { hash: "idle" });
    }

    const handler = (e: any, isWorking: boolean) => {
      // Calculate duration from the most recent completed idle period, or current if still idle
      const start = lastIdleStartTime || idleStartTime || new Date(Date.now() - IDLE_THRESHOLD_SECS * 1000);
      const end = lastIdleEndTime || new Date();
      const mins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

      eventQueue.push(
        createTrackingEvent(EventType.IDLE_RESPONSE, {
          idleMinutes: mins,
          from: start.toISOString(),
          to: end.toISOString(),
          isWorking,
          ...getDeviceMeta()
        })
      );

      if (idleOverlayWin) {
        idleOverlayWin.close();
        idleOverlayWin = null;
      }
      ipcMain.removeListener("idle-response", handler);
    };

    ipcMain.on("idle-response", handler);
  } catch (err) {
    console.error("[Idle] Prompt error:", err);
  }
}

export const startIdleTracking = () => {
  console.log("[Idle] Tracking started");

  setInterval(async () => {
    try {
      const token = authStore.get("token");
      if (!token) {
        // If not logged in, reset state and don't track idle
        isIdle = false;
        hasInitializedActive = false;
        return;
      }

      const idleSeconds = powerMonitor.getSystemIdleTime();
      const meta = getDeviceMeta();

      if (idleSeconds < IDLE_THRESHOLD_SECS) {
        hasInitializedActive = true;
        
        if (isIdle) {
          isIdle = false;
          trackingState.isIdle = false;
          const returnTime = new Date();
          lastIdleEndTime = returnTime;

          const idleDuration = idleStartTime
            ? Math.round((returnTime.getTime() - idleStartTime.getTime()) / 1000)
            : idleSeconds;

          const additionalIdle = Math.max(0, idleDuration - IDLE_THRESHOLD_SECS);

          eventQueue.push(
            createTrackingEvent(EventType.IDLE_END, {
              idleDurationSecs: additionalIdle,
              ...meta
            })
          );

          idleStartTime = null;
        }
      }

      if (idleSeconds >= IDLE_THRESHOLD_SECS && !isIdle && hasInitializedActive) {
        isIdle = true;
        idleStartTime = new Date(Date.now() - idleSeconds * 1000);
        lastIdleStartTime = idleStartTime;
        trackingState.isIdle = true;

        eventQueue.push(
          createTrackingEvent(EventType.IDLE_START, {
            idleSeconds,
            ...meta
          })
        );
        
        // Show popup EXACTLY when idle threshold is reached
        showIdlePopup();
      }
    } catch (err) {
      console.error("[Idle] Error:", err);
    }
  }, 5000);
};