import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { authStore } from "./store/auth.store";
import { startTracking } from "./tracking/activity.tracker";
// FIXED: Import the new UploadService we built
import { uploadService } from "./tracking/upload.service"; 
import { startIdleTracking } from "./tracking/idle.tracker";
import { startSessionTracking } from "./tracking/session.manager";
import { trackingState } from "./tracking/tracking-state";
import { eventQueue } from "./tracking/event.queue";
import { initializeSession } from "./work-session/session.orchestrator";
import { startShiftWatcher } from "./shift-watcher";

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
ipcMain.handle("auth:save", async (_e, token, user) => {
  authStore.set("token", token);
  authStore.set("user", user);
  return true;
});

ipcMain.handle("auth:get", async () => ({
  token: authStore.get("token"),
  user: authStore.get("user"),
}));

ipcMain.handle("auth:clear", async () => {
  authStore.clear();
  return true;
});

// ── Live tracking state (polled by renderer every 5s) ─────────────────────────
ipcMain.handle("tracking:getState", async () => ({
  currentApp: trackingState.currentApp,
  currentTitle: trackingState.currentTitle,
  currentUrl: trackingState.currentUrl,
  currentDomain: trackingState.currentDomain,
  isBrowser: trackingState.isBrowser,
  isIdle: trackingState.isIdle,
  screenIndex: trackingState.screenIndex,
  screenLabel: trackingState.screenLabel,
  totalScreens: trackingState.totalScreens,
  lastEventAt: trackingState.lastEventAt?.toISOString() ?? null,
  sessionStartAt: trackingState.sessionStartAt.toISOString(),
  queueSize: eventQueue.length, // FIXED: Replaced .size() with the .length getter
}));

// ── Bootstrap ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  startTracking();
  
  // FIXED: Start the chunked uploader to run every 30 seconds
  setInterval(() => {
    uploadService.sync();
  }, 30000);

  startIdleTracking();
  startSessionTracking();
  startShiftWatcher();
  const sessionState = await initializeSession();
  console.log("[Main] Session state:", sessionState);
});