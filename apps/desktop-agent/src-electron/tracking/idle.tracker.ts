import { dialog, powerMonitor, BrowserWindow, ipcMain } from "electron";
import { EventType } from "@workforce/shared-types";
import { eventQueue } from "./event.queue";
import { createTrackingEvent } from "./event.factory";
import { getDeviceMeta } from "./device-info";
import { trackingState } from "./tracking-state";

import { authStore } from "../store/auth.store";

let isIdle = false;
let idleStartTime: Date | null = null;
let lastIdleStartTime: Date | null = null;
let lastIdleEndTime: Date | null = null;
let currentPopupStartTime: Date | null = null;
let currentPopupEndTime: Date | null = null;
let idleOverlayWin: BrowserWindow | null = null;
let hasInitializedActive = false;
let lastActiveDay = new Date().toISOString().split("T")[0];
let lastVirtualActiveTime = new Date();

export function resetIdleTracker() {
  lastVirtualActiveTime = new Date();
  isIdle = false;
  trackingState.isIdle = false;
  hasInitializedActive = false;
  idleStartTime = null;
  lastIdleStartTime = null;
  if (idleOverlayWin) {
    idleOverlayWin.close();
    idleOverlayWin = null;
    currentPopupStartTime = null;
    currentPopupEndTime = null;
  }
}

function isMeetingActive(): boolean {
  const app = (trackingState.currentApp || "").toLowerCase();
  const title = (trackingState.currentTitle || "").toLowerCase();
  const url = (trackingState.currentUrl || "").toLowerCase();

  if (app.includes("zoom") || title.includes("zoom meeting")) return true;
  if (app.includes("teams") || title.includes("microsoft teams")) return true;
  if (app.includes("webex")) return true;
  if (app.includes("skype")) return true;
  if (app.includes("slack") && title.includes("huddle")) return true;
  
  if (app.includes("chrome") || app.includes("edge") || app.includes("brave") || app.includes("firefox")) {
    if (url.includes("meet.google.com") || title.includes("google meet")) return true;
    if (url.includes("zoom.us")) return true;
    if (url.includes("teams.microsoft.com")) return true;
  }

  return false;
}

export function triggerAwayPrompt(startTime: Date) {
  if (idleOverlayWin) return;
  
  currentPopupStartTime = startTime;
  currentPopupEndTime = null;

  eventQueue.push(
    createTrackingEvent(EventType.IDLE_POPUP_SHOWN, {
      ...getDeviceMeta()
    })
  );

  try {
    idleOverlayWin = new BrowserWindow({
      width: 450,
      height: 380, // Increased height to accommodate input box
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
      idleOverlayWin.loadFile(require("path").join(__dirname, "../renderer/index.html"), { hash: "/idle" });
    }

    const handler = (e: any, isWorking: boolean, reason?: string) => {
      // Calculate duration accurately
      const start = currentPopupStartTime || new Date(Date.now() - trackingState.idleTimeoutSecs * 1000);
      const end = currentPopupEndTime || new Date();
      const mins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

      eventQueue.push(
        createTrackingEvent(EventType.IDLE_RESPONSE, {
          idleMinutes: mins,
          from: start.toISOString(),
          to: end.toISOString(),
          isWorking,
          reason,
          ...getDeviceMeta()
        })
      );

      if (idleOverlayWin) {
        idleOverlayWin.close();
        idleOverlayWin = null;
      }
      currentPopupStartTime = null;
      currentPopupEndTime = null;
      ipcMain.removeListener("idle-response", handler);
    };

    ipcMain.on("idle-response", handler);
  } catch (err) {
    console.error("[Idle] Prompt error:", err);
  }
}

function showIdlePopup() {
  const start = lastIdleStartTime || idleStartTime || new Date(Date.now() - trackingState.idleTimeoutSecs * 1000);
  triggerAwayPrompt(start);
}

export const startIdleTracking = () => {
  console.log("[Idle] Tracking started");

  setInterval(async () => {
    try {
      if (trackingState.isTrackingPaused) return;

      const token = authStore.get("token");
      if (!token) {
        // If not logged in, reset state and don't track idle
        isIdle = false;
        hasInitializedActive = false;
        return;
      }

      // New Day Detection
      const todayStr = new Date().toISOString().split("T")[0];
      if (todayStr !== lastActiveDay) {
        lastActiveDay = todayStr;
        
        if (idleOverlayWin) {
          idleOverlayWin.close();
          idleOverlayWin = null;
          currentPopupStartTime = null;
          currentPopupEndTime = null;
        }
        
        isIdle = false;
        trackingState.isIdle = false;
        hasInitializedActive = false;
        
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        
        import("electron").then(({ BrowserWindow, dialog }) => {
          dialog.showMessageBox({
            type: "info",
            title: "New Shift Started",
            message: `${greeting}! Your shift for today has been automatically started. Please remember to submit your Daily To-Do plan.`
          });
          BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("shift:new-day"));
        });
        
        idleStartTime = null;
        lastIdleStartTime = null;
        return;
      }

      const rawIdleSeconds = powerMonitor.getSystemIdleTime();
      const meta = getDeviceMeta();

      if (rawIdleSeconds < 5 || isMeetingActive()) {
        lastVirtualActiveTime = new Date();
      }

      const idleSeconds = Math.round((new Date().getTime() - lastVirtualActiveTime.getTime()) / 1000);

      if (idleSeconds < trackingState.idleTimeoutSecs) {
        hasInitializedActive = true;
        
        if (isIdle) {
          isIdle = false;
          trackingState.isIdle = false;
          const returnTime = new Date();
          lastIdleEndTime = returnTime;
          
          if (idleOverlayWin) {
             currentPopupEndTime = returnTime;
          }

          const idleDuration = idleStartTime
            ? Math.round((returnTime.getTime() - idleStartTime.getTime()) / 1000)
            : idleSeconds;

          const additionalIdle = Math.max(0, idleDuration - trackingState.idleTimeoutSecs);

          eventQueue.push(
            createTrackingEvent(EventType.IDLE_END, {
              idleDurationSecs: additionalIdle,
              ...meta
            })
          );

          idleStartTime = null;
        }
      }

      if (idleSeconds >= trackingState.idleTimeoutSecs && !isIdle && hasInitializedActive) {
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