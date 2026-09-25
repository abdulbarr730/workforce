import { app, powerMonitor, BrowserWindow, ipcMain } from "electron";
import { EventType } from "@workforce/shared-types";
import { eventQueue } from "./event.queue";
import { createTrackingEvent } from "./event.factory";
import { getDeviceMeta } from "./device-info";
import { trackingState } from "./tracking-state";
import { addTodayBreakUsageSeconds } from "../store/break-usage.store";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

import { authStore } from "../store/auth.store";

let isIdle = false;
let isClosingAll = false;
let idleStartTime: Date | null = null;
let lastIdleStartTime: Date | null = null;
let currentPopupStartTime: Date | null = null;
let currentPopupEndTime: Date | null = null;
let idleOverlayWins: BrowserWindow[] = [];
let hasInitializedActive = false;
let lastVirtualActiveTime = new Date();

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const PENDING_IDLE_PROMPT_FILE = "pending-idle-prompt.json";

function pendingIdlePromptPath() {
  return join(app.getPath("userData"), PENDING_IDLE_PROMPT_FILE);
}

function persistPendingIdlePrompt(startTime: Date) {
  try {
    writeFileSync(
      pendingIdlePromptPath(),
      JSON.stringify({
        startTime: startTime.toISOString(),
        date: getLocalDateKey(startTime),
        savedAt: new Date().toISOString(),
      }),
      "utf8",
    );
  } catch (error) {
    console.error("[Idle] Failed to persist pending prompt:", error);
  }
}

function clearPendingIdlePrompt() {
  try {
    const filePath = pendingIdlePromptPath();
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch (error) {
    console.error("[Idle] Failed to clear pending prompt:", error);
  }
}

function readPendingIdlePrompt(): Date | null {
  try {
    const filePath = pendingIdlePromptPath();
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    const startTime = data?.startTime ? new Date(data.startTime) : null;
    if (!startTime || Number.isNaN(startTime.getTime())) {
      clearPendingIdlePrompt();
      return null;
    }

    // An away period that began on a previous day is overnight, not a break:
    // re-asking about it the next morning produced 10–12h "breaks".
    if (getLocalDateKey(startTime) !== getLocalDateKey()) {
      clearPendingIdlePrompt();
      return null;
    }
    return startTime;
  } catch (error) {
    console.error("[Idle] Failed to read pending prompt:", error);
    clearPendingIdlePrompt();
    return null;
  }
}

let lastActiveDay = getLocalDateKey();
let lastResumeAt = 0;

function isScreenLocked(): boolean {
  try {
    return powerMonitor.getSystemIdleState(1) === "locked";
  } catch {
    return false;
  }
}

/**
 * Only ask "were you working or on a break?" about an away period that began
 * today after the employee had actually used the computer today. Overnight
 * sleep, or the time before the first real input of the day, is not work time.
 */
function awayPeriodIsPromptable(startTime: Date): boolean {
  const today = getLocalDateKey();
  return (
    getLocalDateKey(startTime) === today &&
    trackingState.lastPresenceProofDate === today
  );
}

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
  const token = authStore.get("token");
  if (!token) {
    resetIdleTracker();
    return;
  }
  if (idleOverlayWins.length > 0) return;
  if (trackingState.isTrackingPaused && !options.allowWhilePaused) return;
  if (trackingState.isOnBreak) return;
  // Windows created over a locked screen (or while macOS is asleep) never get
  // focus and look frozen; the idle loop shows the prompt after unlock.
  if (isScreenLocked()) return;

  currentPopupStartTime = startTime;
  currentPopupEndTime = null;
  persistPendingIdlePrompt(startTime);

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
        // macOS native fullscreen moves each window into its own Space with
        // an animation, which left the popup stuck or hidden. Cover the
        // display with a normal window there instead.
        fullscreen: process.platform !== "darwin",
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
      if (process.platform === "darwin") {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        win.setBounds(display.bounds);
      }

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
      const idleSeconds = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 1000),
      );
      const mins = Math.max(1, Math.round(idleSeconds / 60));

      if (!isWorking) {
        addTodayBreakUsageSeconds(idleSeconds);
      }

      eventQueue.push(
        createTrackingEvent(EventType.IDLE_RESPONSE, {
          idleMinutes: mins,
          idleSeconds,
          durationSeconds: idleSeconds,
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
      clearPendingIdlePrompt();
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
      const now = new Date();
      lastResumeAt = now.getTime();
      const awaySeconds = Math.round(
        (now.getTime() - lastVirtualActiveTime.getTime()) / 1000,
      );
      const awayStart = new Date(now.getTime() - awaySeconds * 1000);

      const token = authStore.get("token");
      const shouldPrompt =
        !!token &&
        !trackingState.isTrackingPaused &&
        !trackingState.isOnBreak &&
        !isIdleExempt() &&
        awaySeconds >= trackingState.idleTimeoutSecs &&
        awayPeriodIsPromptable(awayStart);

      if (!shouldPrompt && getLocalDateKey(awayStart) !== getLocalDateKey()) {
        // Woke on a new day: start clean and wait for real input.
        clearPendingIdlePrompt();
        trackingState.awaitingPresenceProof = true;
      }

      if (shouldPrompt) {
        console.log(
          `[Idle] System resumed after ${awaySeconds}s away, showing away prompt.`,
        );
        isIdle = true;
        idleStartTime = new Date(now.getTime() - awaySeconds * 1000);
        lastIdleStartTime = idleStartTime;
        trackingState.isIdle = true;
        // hasInitializedActive stays true so the normal interval loop
        // detects the return-to-active transition and emits IDLE_END.
        hasInitializedActive = true;

        eventQueue.push(
          createTrackingEvent(EventType.IDLE_START, {
            idleSeconds: awaySeconds,
            reason: "SYSTEM_RESUME",
            ...getDeviceMeta(),
          }),
        );

        showIdlePopup();
      } else {
        console.log(
          `[Idle] System resumed from sleep after ${awaySeconds}s, below idle threshold, resetting idle tracker times.`,
        );
        hasInitializedActive = false; // Prevent retroactively triggering idle for short/no-op resumes
      }

      lastVirtualActiveTime = now;
    });
  }

  setInterval(async () => {
    try {
      const token = authStore.get("token");
      if (!token) {
        // If not logged in, reset state and don't track idle
        resetIdleTracker();
        clearPendingIdlePrompt();
        return;
      }

      const pendingPromptStart = readPendingIdlePrompt();
      if (
        pendingPromptStart &&
        idleOverlayWins.length === 0 &&
        !trackingState.isOnBreak &&
        !isIdleExempt()
      ) {
        isIdle = true;
        idleStartTime = pendingPromptStart;
        lastIdleStartTime = pendingPromptStart;
        lastVirtualActiveTime = pendingPromptStart;
        trackingState.isIdle = true;
        hasInitializedActive = true;
        triggerAwayPrompt(pendingPromptStart, { allowWhilePaused: true });
        return;
      }

      // New Day Detection MUST run even if tracking is paused (e.g. overnight sleep mode)
      const todayStr = getLocalDateKey();
      if (todayStr !== lastActiveDay) {
        lastActiveDay = todayStr;
        clearPendingIdlePrompt();

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

      if (trackingState.isTrackingPaused) {
        if (idleOverlayWins.length > 0 && currentPopupStartTime) {
          return;
        }
        resetIdleTracker();
        return;
      }

      if (trackingState.isOnBreak) {
        resetIdleTracker();
        lastVirtualActiveTime = new Date();
        return;
      }

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

      const locked = isScreenLocked();
      const now = new Date();
      // A locked screen is never activity. Right after waking, macOS can
      // report a near-zero idle clock with nobody at the machine, so input
      // only counts if it happened after the wake itself.
      const secondsSinceResume = lastResumeAt
        ? (now.getTime() - lastResumeAt) / 1000
        : Number.POSITIVE_INFINITY;
      const reportedIdleSeconds = powerMonitor.getSystemIdleTime();
      const inputSinceWake = secondsSinceResume - reportedIdleSeconds > 3;
      const rawIdleSeconds =
        locked || !inputSinceWake
          ? Math.max(reportedIdleSeconds, trackingState.idleTimeoutSecs)
          : reportedIdleSeconds;
      const meta = getDeviceMeta();

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
        if (awayPeriodIsPromptable(idleStartTime)) showIdlePopup();
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

        if (awayPeriodIsPromptable(idleStartTime)) showIdlePopup();
      }

      // If we are currently idle, aggressively keep the popup alive and on top
      if (isIdle && !locked) {
        const aliveWins = idleOverlayWins.filter((w) => !w.isDestroyed());
        const promptStart = lastIdleStartTime || idleStartTime;
        if (
          aliveWins.length === 0 &&
          promptStart &&
          awayPeriodIsPromptable(promptStart)
        ) {
          idleOverlayWins = [];
          showIdlePopup();
        }
      }
    } catch (err) {
      console.error("[Idle] Error:", err);
    }
  }, 5000);
};
