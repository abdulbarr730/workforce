import {
  dialog,
  powerMonitor,
  BrowserWindow
} from "electron";

import {
  EventType
} from "@workforce/shared-types";

import { eventQueue }
  from "./event.queue";

import {
  createTrackingEvent
} from "./event.factory";

import {
  getDeviceMeta
} from "./device-info";

import {
  trackingState
} from "./tracking-state";

const IDLE_THRESHOLD_SECS = 180;

let isIdle = false;

let idleStartTime:
  Date | null = null;

let idleOverlayWin: BrowserWindow | null = null;

async function askWasWorking(
  idleDurationSecs: number,
  from: Date,
  to: Date
) {
  const mins = Math.max(1, Math.round(idleDurationSecs / 60));

  eventQueue.push(
    createTrackingEvent(EventType.IDLE_POPUP_SHOWN, {
      idleMinutes: mins,
      ...getDeviceMeta()
    })
  );

  try {
    if (idleOverlayWin) {
      idleOverlayWin.close();
      idleOverlayWin = null;
    }

    idleOverlayWin = new BrowserWindow({
      fullscreen: true,
      alwaysOnTop: true,
      transparent: true,
      frame: false,
      skipTaskbar: true,
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

    const { ipcMain } = require("electron");

    const handler = (e: any, isWorking: boolean) => {
      eventQueue.push(
        createTrackingEvent(EventType.IDLE_RESPONSE, {
          idleMinutes: mins,
          from: from.toISOString(),
          to: to.toISOString(),
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

export const startIdleTracking =
  () => {
    console.log(
      "[Idle] Tracking started"
    );

    setInterval(async () => {
      try {
        const idleSeconds =
          powerMonitor.getSystemIdleTime();

        const meta =
          getDeviceMeta();

        if (
          idleSeconds >=
            IDLE_THRESHOLD_SECS &&
          !isIdle
        ) {
          isIdle = true;

          idleStartTime =
            new Date(
              Date.now() -
                idleSeconds * 1000
            );

          trackingState.isIdle =
            true;

          eventQueue.push(
            createTrackingEvent(
              EventType.IDLE_START,

              {
                idleSeconds,

                ...meta
              }
            )
          );
        }

        if (
          idleSeconds <
            IDLE_THRESHOLD_SECS &&
          isIdle
        ) {
          isIdle = false;

          trackingState.isIdle =
            false;

          const returnTime =
            new Date();

          const idleDuration =
            idleStartTime
              ? Math.round(
                  (returnTime.getTime() -
                    idleStartTime.getTime()) /
                    1000
                )
              : idleSeconds;

          eventQueue.push(
            createTrackingEvent(
              EventType.IDLE_END,

              {
                idleDurationSecs:
                  idleDuration,

                ...meta
              }
            )
          );

          if (
            idleDuration >=
              IDLE_THRESHOLD_SECS &&
            idleStartTime
          ) {
            askWasWorking(
              idleDuration,

              idleStartTime,

              returnTime
            );
          }

          idleStartTime = null;
        }
      } catch (err) {
        console.error(
          "[Idle] Error:",
          err
        );
      }
    }, 5000);
  };