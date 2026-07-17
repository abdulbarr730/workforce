import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  powerMonitor,
  systemPreferences,
  Notification,
} from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import { join } from "path";
import { authStore } from "./store/auth.store";
import { startTracking, stopTracking } from "./tracking/activity.tracker";
// FIXED: Import the new UploadService we built
import { uploadService } from "./tracking/upload.service";
import { startIdleTracking, resetIdleTracker } from "./tracking/idle.tracker";
import { startSessionTracking } from "./tracking/session.manager";
import { trackingState } from "./tracking/tracking-state";
import { eventQueue } from "./tracking/event.queue";
import { createTrackingEvent } from "./tracking/event.factory";
import { EventType } from "@workforce/shared-types";
import { initializeSession } from "./work-session/session.orchestrator";
import { getDeviceId } from "./tracking/device-info";
import { DeviceErrorLogger } from "./tracking/device-error.logger";
import axios from "axios";
import { startShiftWatcher, forceShiftCheck } from "./shift-watcher";
import {
  startScreenshotTracker,
  stopScreenshotTracker,
  getScreenshotTrackingEnabled,
  setScreenshotTrackingEnabled,
} from "./tracking/screenshot.tracker";
import {
  startTrackingScheduler,
  stopTrackingScheduler,
} from "./tracking/tracking-scheduler";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false; // eslint-disable-line prefer-const

// Handle unexpected crashes
process.on("uncaughtException", (error) => {
  DeviceErrorLogger.logError("uncaughtException", error);
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  DeviceErrorLogger.logError("unhandledRejection", reason);
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Disable hardware acceleration to massively save RAM & GPU for low-spec PCs
app.disableHardwareAcceleration();

function createWindow() {
  const iconPath = join(app.getAppPath(), "public", "tray-icon.png");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: nativeImage.createFromPath(iconPath),
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

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const iconPath = join(app.getAppPath(), "public", "tray-icon.png");
  let nImage = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin") {
    nImage = nImage.resize({ width: 16, height: 16 });
  }
  tray = new Tray(nImage);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open ProSync Agent",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.setAlwaysOnTop(true);
          mainWindow.show();
          mainWindow.focus();
          mainWindow.setAlwaysOnTop(false);
        }
      },
    },
  ]);

  tray.setToolTip("ProSync Workforce Agent");
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(false);
    }
  });
}
ipcMain.handle("auth:save", async (_e, token, user) => {
  authStore.set("token", token);
  authStore.set("user", user);

  // Fetch screenshot tracking status
  try {
    const API_URL = app.isPackaged
      ? "https://api.prosyncedu.com"
      : "http://localhost:5000/api";
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const isEnabled = response.data?.data?.isScreenshotTrackingEnabled || false;
    const interval = response.data?.data?.screenshotInterval || 300;
    setScreenshotTrackingEnabled(isEnabled, interval);
    console.log(
      `[Auth] Screenshot tracking enabled: ${isEnabled}, Interval: ${interval}s`,
    );

    trackingState.enforceTrackingSchedule =
      response.data?.data?.enforceTrackingSchedule || false;
    trackingState.trackingDays = response.data?.data?.trackingDays || [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    trackingState.trackingStartTime =
      response.data?.data?.trackingStartTime || "00:00";
    trackingState.trackingEndTime =
      response.data?.data?.trackingEndTime || "23:59";

    trackingState.isIdleExemptionEnabled =
      response.data?.data?.isIdleExemptionEnabled || false;
    trackingState.idleExemptionDays =
      response.data?.data?.idleExemptionDays || [];
    trackingState.idleExemptionStartTime =
      response.data?.data?.idleExemptionStartTime || "00:00";
    trackingState.idleExemptionEndTime =
      response.data?.data?.idleExemptionEndTime || "23:59";
  } catch (err) {
    console.error(
      "[Auth] Failed to fetch user profile for tracking settings",
      err,
    );
  }

  // Auto-start tracking on login!
  trackingState.isTrackingPaused = false;
  startTracking();
  startScreenshotTracker();
  startTrackingScheduler();

  return true;
});

ipcMain.handle("auth:get", async () => ({
  token: authStore.get("token"),
  user: authStore.get("user"),
}));

ipcMain.handle("auth:clear", async () => {
  stopTracking();
  stopTrackingScheduler();
  eventQueue.push(createTrackingEvent(EventType.LOGOUT, {}));

  // Wait for queue to drain (max 5 seconds) before clearing auth to prevent LOGOUT event drop
  let retries = 50;
  while (eventQueue.length > 0 && retries > 0) {
    await uploadService.sync();
    await new Promise((resolve) => setTimeout(resolve, 100));
    retries--;
  }

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
  queueSize: eventQueue.length,
  isScreenshotTrackingEnabled: getScreenshotTrackingEnabled(),
}));

ipcMain.handle("tracking:start", async () => {
  trackingState.isTrackingPaused = false;
  resetIdleTracker();
  startTracking();
  startScreenshotTracker();
  return true;
});

ipcMain.handle("tracking:stop", async () => {
  trackingState.isTrackingPaused = true;
  eventQueue.push(createTrackingEvent(EventType.LOGOUT, {}));
  await uploadService.sync();
  stopTracking();
  stopScreenshotTracker();
  return true;
});

ipcMain.handle("device:getId", async () => {
  return getDeviceId();
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log("[Boot] Second instance detected. Quitting...");
  app.quit();
} else {
  app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.platform === "darwin") {
      const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
      if (!isTrusted) {
        console.log(
          "[Mac] Requesting accessibility permissions for window tracking...",
        );
        setTimeout(
          () => systemPreferences.isTrustedAccessibilityClient(true),
          2000,
        );
      }
    }

    createWindow();
    createTray();

    // Force a shift check immediately when waking up from sleep or unlocking
    powerMonitor.on("resume", () => forceShiftCheck());
    powerMonitor.on("unlock-screen", () => forceShiftCheck());

    // If user is already logged in, auto-start tracking on boot
    if (authStore.get("token")) {
      console.log("[Boot] User is already logged in, starting trackers...");
      trackingState.isTrackingPaused = false;
      startTracking();
      startScreenshotTracker();
    }

    // Set the app to automatically start on user login (only when packaged/installed)
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false, // You can set this to true if you want it to start silently in the background
        path: app.getPath("exe"),
      });

      // Setup Auto Updater to check on startup and then every 1 hour
      autoUpdater.checkForUpdates();
      setInterval(
        () => {
          autoUpdater.checkForUpdates();
        },
        1000 * 60 * 60,
      );

      // Auto updater event logging
      autoUpdater.on("checking-for-update", () => {
        console.log("[AutoUpdater] Checking for updates...");
      });
      autoUpdater.on("update-available", (info) => {
        console.log("[AutoUpdater] Update available:", info.version);
      });
      autoUpdater.on("update-not-available", (_info) => {
        console.log(
          "[AutoUpdater] No update available. Current version is latest.",
        );
      });
      autoUpdater.on("error", (err) => {
        console.error("[AutoUpdater] Error in auto-updater:", err);
      });
      autoUpdater.on("download-progress", (progressObj) => {
        console.log(
          `[AutoUpdater] Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`,
        );
      });

      let hasNotifiedUpdate = false;
      autoUpdater.on("update-downloaded", (info) => {
        console.log("[AutoUpdater] Update downloaded. Sending to renderer.");
        if (mainWindow) {
          mainWindow.webContents.send(
            "updater:update-downloaded",
            info.version,
          );
        }
        if (!hasNotifiedUpdate) {
          hasNotifiedUpdate = true;
          const updateNotif = new Notification({
            title: "Update Ready",
            body: `Version ${info.version} is ready to be installed. Click here to apply the update.`,
            icon: join(app.getAppPath(), "public", "tray-icon.png"),
          });
          updateNotif.on("click", () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.show();
              mainWindow.focus();
            }
          });
          updateNotif.show();
        }
      });

      ipcMain.on("updater:install", () => {
        autoUpdater.quitAndInstall(true, true);
      });
    }

    // Sync user profile to check screenshot permissions periodically
    const syncUserProfile = async () => {
      try {
        const token = authStore.get("token");
        if (!token) return;
        const API_URL = app.isPackaged
          ? "https://api.prosyncedu.com"
          : "http://localhost:5000/api";
        const response = await axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const isEnabled =
          response.data?.data?.isScreenshotTrackingEnabled || false;
        const interval = response.data?.data?.screenshotInterval || 300;
        setScreenshotTrackingEnabled(isEnabled, interval);

        trackingState.enforceTrackingSchedule =
          response.data?.data?.enforceTrackingSchedule || false;
        trackingState.trackingDays = response.data?.data?.trackingDays || [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
        trackingState.trackingStartTime =
          response.data?.data?.trackingStartTime || "00:00";
        trackingState.trackingEndTime =
          response.data?.data?.trackingEndTime || "23:59";

        trackingState.isIdleExemptionEnabled =
          response.data?.data?.isIdleExemptionEnabled || false;
        trackingState.idleExemptionDays =
          response.data?.data?.idleExemptionDays || [];
        trackingState.idleExemptionStartTime =
          response.data?.data?.idleExemptionStartTime || "00:00";
        trackingState.idleExemptionEndTime =
          response.data?.data?.idleExemptionEndTime || "23:59";
      } catch (err) {
        console.error(
          "[Main] Failed to sync user profile for screenshot settings",
          err,
        );
      }
    };

    // Run immediately on startup, and then every 5 minutes
    syncUserProfile();
    setInterval(syncUserProfile, 5 * 60 * 1000);

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
  app.on("before-quit", async (_e) => {
    console.log("[Main] App is quitting. Ending session...");
    try {
      const token = authStore.get("token");
      const API_URL = app.isPackaged
        ? "https://api.prosyncedu.com"
        : "http://localhost:5000/api";
      if (token) {
        // Synchronous-ish attempt to end session before process dies
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { net } = require("electron");
        const request = net.request({
          method: "POST",
          url: `${API_URL}/work-sessions/end`,
        });
        request.setHeader("Authorization", `Bearer ${token}`);
        request.end();
      }
    } catch (error) {
      console.error("[Main] Error ending session on quit:", error);
    }
  });
}
