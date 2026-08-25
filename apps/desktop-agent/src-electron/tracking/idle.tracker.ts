import { powerMonitor, BrowserWindow, ipcMain } from "electron";
import { EventType } from "@workforce/shared-types";
import { eventQueue } from "./event.queue";
import { createTrackingEvent } from "./event.factory";
import { getDeviceMeta } from "./device-info";
import { trackingState } from "./tracking-state";

import { authStore } from "../store/auth.store";

let isIdle = false;
let isClosingAll = false;
let idleStartTime: Date | null = null;
let lastIdleStartTime: Date | null = null;
let currentPopupStartTime: Date | null = null;
let currentPopupEndTime: Date | null = null;
let idleOverlayWins: BrowserWindow[] = [];
let hasInitializedActive = false;
let lastActiveDay = new Date().toISOString().split("T")[0];
let lastVirtualActiveTime = new Date();

function isIdleExempt(): boolean {
  if (!trackingState.isIdleExemptionEnabled) return false;

  const now = new Date();
  const todayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 1. If fine-grained daily schedules are configured, check specific day
  if (
    trackingState.idleExemptionDaySchedules &&
    trackingState.idleExemptionDaySchedules.length > 0
  ) {
    const dayConfig = trackingState.idleExemptionDaySchedules.find(
      (d) => d.day.toLowerCase() === todayName.toLowerCase(),
    );
    if (!dayConfig || !dayConfig.enabled) {
      return false;
    }

    const [startH, startM] = (dayConfig.startTime || "00:00")
      .split(":")
      .map(Number);
    const [endH, endM] = (dayConfig.endTime || "23:59").split(":").map(Number);

    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // 2. Fallback to legacy idleExemptionDays and idleExemptionStartTime/idleExemptionEndTime
  if (!trackingState.idleExemptionDays.includes(todayName)) return false;

  const [startH, startM] = trackingState.idleExemptionStartTime
    .split(":")
    .map(Number);
  const [endH, endM] = trackingState.idleExemptionEndTime
    .split(":")
    .map(Number);

  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function resetIdleTracker() {
  lastVirtualActiveTime = new Date();
  isIdle = false;
  trackingState.isIdle = false;
  hasInitializedActive = false;
  idleStartTime = null;
  lastIdleStartTime = null;
  if (idleOverlayWins.length > 0) {
    isClosingAll = true;
    idleOverlayWins.forEach((w) => {
      if (!w.isDestroyed()) w.close();
    });
    idleOverlayWins = [];
    currentPopupStartTime = null;
    currentPopupEndTime = null;
    isClosingAll = false;
  }
}

export function triggerAwayPrompt(
  startTime: Date,
  options: { allowWhilePaused?: boolean } = {},
) {
  if (idleOverlayWins.length > 0) return;
  if (trackingState.isTrackingPaused && !options.allowWhilePaused) return;

  currentPopupStartTime = startTime;
  currentPopupEndTime = null;

  eventQueue.push(
    createTrackingEvent(EventType.IDLE_POPUP_SHOWN, {
      ...getDeviceMeta(),
    }),
  );

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { screen } = require("electron");
    const displays = screen.getAllDisplays();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iconPath = require("path").join(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("electron").app.getAppPath(),
      "public",
      "tray-icon.png",
    );

    const primaryDisplay = screen.getPrimaryDisplay();

    displays.forEach((display: any) => {
      const isPrimary = display.id === primaryDisplay.id;

      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        fullscreen: true,
        center: true,
        alwaysOnTop: true,
        transparent: false,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        backgroundColor: "#000000",
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        icon: require("electron").nativeImage.createFromPath(iconPath),
        webPreferences: isPrimary
          ? {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              preload: require("path").join(
                __dirname,
                "../preload/preload.mjs",
              ),
              contextIsolation: true,
              sandbox: false,
            }
          : {
              contextIsolation: true,
              sandbox: true,
            },
      });

      win.setAlwaysOnTop(true, "screen-saver");

      if (isPrimary) {
        if (process.env.ELECTRON_RENDERER_URL) {
          win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/#/idle`);
        } else {
          win.loadFile(
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require("path").join(__dirname, "../renderer/index.html"),
            { hash: "/idle" },
          );
        }
      } else {
        // Load an extremely lightweight blank black page to prevent lag on basic/older laptops
        win.loadURL(
          "data:text/html;charset=utf-8," +
            encodeURIComponent(
              '<html style="background-color:black;margin:0;padding:0;overflow:hidden;width:100%;height:100%;cursor:none;"></html>',
            ),
        );
      }

      win.on("closed", () => {
        idleOverlayWins = idleOverlayWins.filter((w) => w !== win);
        // If one window is closed externally (e.g. unplugged screen or Alt+F4), and we are not in the middle of closing all,
        // close all other overlay windows so they can be clean-recreated by the interval timer.
        if (isIdle && !isClosingAll && idleOverlayWins.length > 0) {
          isClosingAll = true;
          idleOverlayWins.forEach((w) => {
            if (!w.isDestroyed()) w.close();
          });
          idleOverlayWins = [];
          isClosingAll = false;
        }
      });

      idleOverlayWins.push(win);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any, isWorking: boolean, reason?: string) => {
      const start =
        currentPopupStartTime ||
        new Date(Date.now() - trackingState.idleTimeoutSecs * 1000);
      const end = currentPopupEndTime || new Date();
      const mins = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 60000),
      );

      eventQueue.push(
        createTrackingEvent(EventType.IDLE_RESPONSE, {
          idleMinutes: mins,
          from: start.toISOString(),
          to: end.toISOString(),
          isWorking,
          reason,
          ...getDeviceMeta(),
        }),
      );

      isClosingAll = true;
      idleOverlayWins.forEach((w) => {
        if (!w.isDestroyed()) w.close();
      });
      idleOverlayWins = [];
      currentPopupStartTime = null;
      currentPopupEndTime = null;
      isClosingAll = false;
      ipcMain.removeAllListeners("idle-response");
    };

    ipcMain.removeAllListeners("idle-response");
    ipcMain.on("idle-response", handler);
  } catch (err) {
    console.error("[Idle] Prompt error:", err);
  }
}

function showIdlePopup() {
  const start =
    lastIdleStartTime ||
    idleStartTime ||
    new Date(Date.now() - trackingState.idleTimeoutSecs * 1000);
  triggerAwayPrompt(start);
}

let powerMonitorAttached = false;
let lastPresenceProofAt = 0;

export const startIdleTracking = () => {
  console.log("[Idle] Tracking started");

  if (!powerMonitorAttached) {
    powerMonitorAttached = true;
    powerMonitor.on("resume", () => {
      console.log(
        "[Idle] System resumed from sleep, resetting idle tracker times.",
      );
      lastVirtualActiveTime = new Date();
      hasInitializedActive = false; // Prevent retroactively triggering idle
    });
  }

  setInterval(async () => {
    try {
      const token = authStore.get("token");
      if (!token) {
        // If not logged in, reset state and don't track idle
        isIdle = false;
        hasInitializedActive = false;
        return;
      }

      // New Day Detection MUST run even if tracking is paused (e.g. overnight sleep mode)
      const todayStr = new Date().toISOString().split("T")[0];
      if (todayStr !== lastActiveDay) {
        lastActiveDay = todayStr;

        if (idleOverlayWins.length > 0) {
          isClosingAll = true;
          idleOverlayWins.forEach((w) => {
            if (!w.isDestroyed()) w.close();
          });
          idleOverlayWins = [];
          currentPopupStartTime = null;
          currentPopupEndTime = null;
          isClosingAll = false;
        }

        isIdle = false;
        trackingState.isIdle = false;
        hasInitializedActive = false;

        import("electron").then(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows().forEach((w) => {
            w.webContents.send("shift:new-day");
            if (w.isMinimized()) w.restore();
            w.show();
            w.focus();
          });
        });

        idleStartTime = null;
        lastIdleStartTime = null;
        return;
      }

      if (trackingState.isTrackingPaused) return;

      if (isIdleExempt()) {
        // Bypass idle tracking entirely during the exemption period
        lastVirtualActiveTime = new Date();
        if (isIdle) {
          isIdle = false;
          trackingState.isIdle = false;
          if (idleOverlayWins.length > 0) {
            isClosingAll = true;
            idleOverlayWins.forEach((w) => {
              if (!w.isDestroyed()) w.close();
            });
            idleOverlayWins = [];
            currentPopupStartTime = null;
            currentPopupEndTime = null;
            isClosingAll = false;
          }
        }
        return;
      }

      const rawIdleSeconds = powerMonitor.getSystemIdleTime();
      const meta = getDeviceMeta();
      const now = new Date();

      // A PIN, key press, or mouse action resets the OS idle clock. Attendance
      // requires recent real activity, so refresh this proof while the person
      // continues using the computer instead of emitting it only once per day.
      const presenceDate = now.toLocaleDateString("en-CA");
      if (
        rawIdleSeconds <= 3 &&
        (trackingState.awaitingPresenceProof ||
          trackingState.lastPresenceProofDate !== presenceDate ||
          now.getTime() - lastPresenceProofAt >= 60_000)
      ) {
        eventQueue.push(
          createTrackingEvent(EventType.USER_ACTIVITY, {
            evidence: "OS_INPUT_AFTER_UNLOCK",
            systemIdleSeconds: rawIdleSeconds,
            ...meta,
          }),
        );
        trackingState.awaitingPresenceProof = false;
        trackingState.lastPresenceProofDate = presenceDate;
        lastPresenceProofAt = now.getTime();
      }

      // Detect massive sleep/suspend gaps BEFORE wiping lastVirtualActiveTime
      const timeSinceLastActive = Math.round(
        (now.getTime() - lastVirtualActiveTime.getTime()) / 1000,
      );

      if (
        timeSinceLastActive >= trackingState.idleTimeoutSecs &&
        !isIdle &&
        hasInitializedActive
      ) {
        isIdle = true;
        idleStartTime = new Date(now.getTime() - timeSinceLastActive * 1000);
        lastIdleStartTime = idleStartTime;
        trackingState.isIdle = true;

        eventQueue.push(
          createTrackingEvent(EventType.IDLE_START, {
            idleSeconds: timeSinceLastActive,
            ...meta,
          }),
        );
        showIdlePopup();
      }

      if (rawIdleSeconds < 5) {
        lastVirtualActiveTime = new Date();
      }

      const idleSeconds = Math.round(
        (new Date().getTime() - lastVirtualActiveTime.getTime()) / 1000,
      );

      if (idleSeconds < trackingState.idleTimeoutSecs) {
        hasInitializedActive = true;

        if (isIdle) {
          isIdle = false;
          trackingState.isIdle = false;
          const returnTime = new Date();

          if (idleOverlayWins.length > 0) {
            currentPopupEndTime = returnTime;
          }

          const idleDuration = idleStartTime
            ? Math.round(
                (returnTime.getTime() - idleStartTime.getTime()) / 1000,
              )
            : idleSeconds;

          const additionalIdle = Math.max(
            0,
            idleDuration - trackingState.idleTimeoutSecs,
          );

          eventQueue.push(
            createTrackingEvent(EventType.IDLE_END, {
              idleDurationSecs: additionalIdle,
              ...meta,
            }),
          );

          idleStartTime = null;
        }
      }

      if (
        idleSeconds >= trackingState.idleTimeoutSecs &&
        !isIdle &&
        hasInitializedActive
      ) {
        isIdle = true;
        idleStartTime = new Date(Date.now() - idleSeconds * 1000);
        lastIdleStartTime = idleStartTime;
        trackingState.isIdle = true;

        eventQueue.push(
          createTrackingEvent(EventType.IDLE_START, {
            idleSeconds,
            ...meta,
          }),
        );

        showIdlePopup();
      }

      // If we are currently idle, aggressively keep the popup alive and on top
      if (isIdle) {
        const aliveWins = idleOverlayWins.filter((w) => !w.isDestroyed());
        if (aliveWins.length === 0) {
          idleOverlayWins = [];
          showIdlePopup();
        }
      }
    } catch (err) {
      console.error("[Idle] Error:", err);
    }
  }, 5000);
};
