import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from "electron";
import { join } from "path";
import { authStore } from "./store/auth.store";
import { startTracking, stopTracking } from "./tracking/activity.tracker";
// FIXED: Import the new UploadService we built
import { uploadService } from "./tracking/upload.service"; 
import { startIdleTracking } from "./tracking/idle.tracker";
import { startSessionTracking } from "./tracking/session.manager";
import { trackingState } from "./tracking/tracking-state";
import { eventQueue } from "./tracking/event.queue";
import { initializeSession } from "./work-session/session.orchestrator";
import { getDeviceId } from "./tracking/device-info";
import axios from "axios";
import { startShiftWatcher } from "./shift-watcher";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const iconPath = join(__dirname, '../../public/tray-icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ProSync Agent', click: () => mainWindow?.show() },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('ProSync Workforce Agent');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    mainWindow?.show();
  });
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
  eventQueue.push({
    id: require("crypto").randomUUID(),
    type: "LOGOUT",
    timestamp: new Date().toISOString(),
    user_id: authStore.get("user")?.employeeId || "unknown",
  });
  await uploadService.sync();
  stopTracking();
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

ipcMain.handle("tracking:start", async () => {
  startTracking();
  return true;
});

ipcMain.handle("tracking:stop", async () => {
  eventQueue.push({
    id: require("crypto").randomUUID(),
    type: "LOGOUT",
    timestamp: new Date().toISOString(),
    user_id: authStore.get("user")?.employeeId || "unknown",
  });
  await uploadService.sync();
  stopTracking();
  return true;
});

ipcMain.handle("device:getId", async () => {
  return getDeviceId();
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  createTray();
  
  // Set the app to automatically start on user login (only when packaged/installed)
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false, // You can set this to true if you want it to start silently in the background
      path: app.getPath("exe"),
    });
  }

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

// Handle graceful shutdown on restart/shutdown
app.on('before-quit', async (e) => {
  console.log("[Main] App is quitting. Ending session...");
  try {
    const token = authStore.get('token');
    const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    if (token) {
      // Synchronous-ish attempt to end session before process dies
      const { net } = require('electron');
      const request = net.request({
        method: 'POST',
        url: `${API_URL}/work-sessions/end`,
      });
      request.setHeader('Authorization', `Bearer ${token}`);
      request.end();
    }
  } catch (error) {
    console.error("[Main] Error ending session on quit:", error);
  }
});