import { app, BrowserWindow } from "electron";

import { join } from "path";

import { ipcMain } from "electron";

import { authStore } from "./store/auth.store";

import {startTracking} from "./tracking/activity.tracker";

import {startUploader} from "./tracking/upload.service";

import { startIdleTracking } from "./tracking/idle.tracker";

import { startSessionTracking } from "./tracking/session.manager";

import { initializeSession } from "./work-session/session.orchestrator";

import { startShiftWatcher } from "./shift-watcher";

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,

    height: 800,

    webPreferences: {
      preload: join(
        __dirname,
        "../preload/preload.mjs"
      ),

      contextIsolation: true,

      sandbox: false
    }
  });

  win.webContents.openDevTools();

  if (
    process.env
      .ELECTRON_RENDERER_URL
  ) {
    win.loadURL(
      process.env
        .ELECTRON_RENDERER_URL
    );
  }
}

ipcMain.handle(
  "auth:save",

  async (
    _event,
    token,
    user
  ) => {
    authStore.set(
      "token",
      token
    );

    authStore.set(
      "user",
      user
    );

    return true;
  }
);

ipcMain.handle(
  "auth:get",

  async () => {
    return {
      token:
        authStore.get(
          "token"
        ),

      user:
        authStore.get(
          "user"
        )
    };
  }
);

ipcMain.handle(
  "auth:clear",

  async () => {
    authStore.clear();

    return true;
  }
);

app.whenReady().then(async () => {
  createWindow();
  startTracking();
  startUploader();
  startIdleTracking();
  startSessionTracking();
  startShiftWatcher();
  const sessionState =
  await initializeSession();

  console.log(
    "Session state:",
    sessionState
  );
});