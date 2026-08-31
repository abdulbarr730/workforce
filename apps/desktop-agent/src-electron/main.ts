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
  session,
  dialog,
  screen,
} from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { execFile } from "child_process";
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

// Set AppUserModelId for Windows toast notifications
if (process.platform === "win32") {
  app.setAppUserModelId("com.prosync.desktopagent");
}

let mainWindow: BrowserWindow | null = null;
let todoWidgetWindow: BrowserWindow | null = null;
let todoWidgetSnapTimer: NodeJS.Timeout | null = null;
let todoWidgetIsSnapping = false;
let tray: Tray | null = null;
let isQuitting = false; // eslint-disable-line prefer-const
let appQuitAllowed = false;
let desktopTrackingActivated = false;
let updateInstallInProgress = false;
let desktopActivationWatchdog: NodeJS.Timeout | null = null;

const calibrateServerClock = (
  serverDateHeader: unknown,
  requestStartedAt: number,
) => {
  if (typeof serverDateHeader !== "string") return;
  const serverTime = Date.parse(serverDateHeader);
  if (!Number.isFinite(serverTime)) return;
  const responseReceivedAt = Date.now();
  const requestMidpoint =
    requestStartedAt + (responseReceivedAt - requestStartedAt) / 2;
  trackingState.serverClockOffsetMs = Math.round(serverTime - requestMidpoint);
  trackingState.serverClockCalibrated = true;
};

const activateDesktopTracking = () => {
  if (desktopTrackingActivated || !authStore.get("token")) return;
  if (powerMonitor.getSystemIdleState(1) === "locked") return;
  desktopTrackingActivated = true;
  trackingState.isTrackingPaused = false;
  trackingState.awaitingPresenceProof = true;
  trackingState.sessionStartAt = new Date();
  startTracking();
  startScreenshotTracker();
  startIdleTracking();
  startSessionTracking();
  startTrackingScheduler();
  console.log("[Tracking] Activated after authenticated desktop unlock");
};

const startDesktopActivationWatchdog = () => {
  if (desktopActivationWatchdog) return;
  desktopActivationWatchdog = setInterval(() => {
    if (!authStore.get("token")) return;
    if (desktopTrackingActivated) return;
    if (powerMonitor.getSystemIdleState(1) === "locked") return;
    activateDesktopTracking();
  }, 15_000);
};

const pauseDesktopTrackingForLock = () => {
  if (!desktopTrackingActivated) return;
  trackingState.isTrackingPaused = true;
  desktopTrackingActivated = false;
  stopTrackingScheduler();
  stopScreenshotTracker();
  stopTracking();
  console.log("[Tracking] Paused because the desktop is locked or suspended");
};

const hasExtraAgentProcesses = async () => {
  if (process.platform !== "win32") return false;
  return new Promise<boolean>((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$target=$args[0]; $count=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch 'crashpad-handler' }).Count; Write-Output $count",
        process.execPath,
      ],
      { windowsHide: true, timeout: 8_000 },
      (error, stdout) => resolve(!error && Number(String(stdout).trim()) > 1),
    );
  });
};

// Handle unexpected crashes
process.on("uncaughtException", (error) => {
  DeviceErrorLogger.logError("uncaughtException", error);
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  DeviceErrorLogger.logError("unhandledRejection", reason);
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const allowInternalQuit = () => {
  appQuitAllowed = true;
  isQuitting = true;
};

const runHiddenCommand = (executable: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      { windowsHide: true, timeout: 10_000 },
      (error) => (error ? reject(error) : resolve()),
    );
  });

const hiddenCommandSucceeds = async (executable: string, args: string[]) => {
  try {
    await runHiddenCommand(executable, args);
    return true;
  } catch {
    return false;
  }
};

const WINDOWS_AUTOSTART_RUN_NAME = "Prosync Workforce Agent";

const runHiddenCommandWithOutput = (
  executable: string,
  args: string[],
): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      { windowsHide: true, timeout: 10_000 },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout || ""))),
    );
  });

const isWindowsAutoStartExplicitlyDisabled = async () => {
  if (process.platform !== "win32") return false;
  try {
    const output = await runHiddenCommandWithOutput("reg.exe", [
      "QUERY",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
      "/v",
      WINDOWS_AUTOSTART_RUN_NAME,
    ]);
    const value = output
      .split(/\r?\n/)
      .find((line) => line.includes(WINDOWS_AUTOSTART_RUN_NAME));
    // StartupApproved values beginning with 03 mean disabled by user/Windows UI.
    // Values beginning with 02 mean enabled. If the value is absent we install.
    return /\bREG_BINARY\b\s+03/i.test(value || "");
  } catch {
    return false;
  }
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

let lastMacPermissionWarningAt = 0;
const MAC_PERMISSION_WARNING_COOLDOWN_MS = 30 * 60 * 1000;

const checkMacTrackingPermission = (shouldPrompt = false) => {
  if (process.platform !== "darwin") return true;

  const trusted = systemPreferences.isTrustedAccessibilityClient(shouldPrompt);
  if (trusted) return true;

  const now = Date.now();
  if (now - lastMacPermissionWarningAt > MAC_PERMISSION_WARNING_COOLDOWN_MS) {
    lastMacPermissionWarningAt = now;
    DeviceErrorLogger.logError(
      "mac_accessibility_permission_missing",
      new Error(
        "macOS Accessibility permission is missing for Workforce Agent. Tracking can connect to the backend but app/window activity may not be captured until the employee allows Workforce Agent in System Settings > Privacy & Security > Accessibility.",
      ),
    );
  }

  return false;
};

async function setupAutoStart() {
  try {
    if (process.platform === "darwin") {
      // 1. Electron login item settings for macOS
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false,
      });

      // 2. Persistent LaunchAgent for macOS reboot & login persistence
      const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
      if (!existsSync(launchAgentsDir)) {
        mkdirSync(launchAgentsDir, { recursive: true });
      }

      const plistPath = join(
        launchAgentsDir,
        "com.prosync.workforce.agent.plist",
      );

      // Extract .app bundle path
      let appPath = app.getPath("exe");
      if (appPath.includes(".app")) {
        appPath = appPath.substring(0, appPath.indexOf(".app") + 4);
      }

      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.prosync.workforce.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>${escapeXml(appPath)}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
    <key>ProcessType</key>
    <string>Interactive</string>
</dict>
</plist>
`;
      writeFileSync(plistPath, plistContent, "utf8");

      // Load the LaunchAgent now as well as persisting it for future logins.
      if (typeof process.getuid === "function") {
        const domain = `gui/${process.getuid()}`;
        const loaded = await hiddenCommandSucceeds("/bin/launchctl", [
          "print",
          `${domain}/com.prosync.workforce.agent`,
        ]);
        if (!loaded) {
          await runHiddenCommand("/bin/launchctl", [
            "bootstrap",
            domain,
            plistPath,
          ]);
        }
      }
      console.log(
        "[AutoStart] macOS LaunchAgent registered successfully at:",
        plistPath,
      );
    } else if (process.platform === "win32") {
      if (await isWindowsAutoStartExplicitlyDisabled()) {
        console.log(
          "[AutoStart] Windows startup is explicitly disabled in Startup Apps; leaving it disabled.",
        );
        return;
      }

      // Clean up legacy explicit registry keys from previous versions to avoid duplicate startup entries
      try {
        await runHiddenCommand("reg.exe", [
          "DELETE",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
          "/v",
          "com.prosync.desktopagent",
          "/f",
        ]);
      } catch (e) {
        // Ignore errors if keys don't exist
      }

      // Register through Electron natively to avoid duplicates
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false,
        path: app.getPath("exe"),
        args: ["--autostart"],
      });

      // Electron's Windows login item can silently fail on some installations
      // after updates or if the shortcut task is removed. Keep one explicit
      // per-user Run entry as a fallback. This does not require admin rights.
      await runHiddenCommand("reg.exe", [
        "ADD",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        "/v",
        WINDOWS_AUTOSTART_RUN_NAME,
        "/t",
        "REG_SZ",
        "/d",
        `"${app.getPath("exe")}" --autostart`,
        "/f",
      ]);

      const settings = app.getLoginItemSettings({
        path: app.getPath("exe"),
        args: ["--autostart"],
      });
      console.log(
        `[AutoStart] Windows login registration verified (electron=${settings.openAtLogin}, runKey=${WINDOWS_AUTOSTART_RUN_NAME}).`,
      );
    }
  } catch (err) {
    DeviceErrorLogger.logError("auto_start_setup_failed", err);
    console.error("[AutoStart] Failed to configure auto-start:", err);
  }
}

function createWindow() {
  const iconPath = join(app.getAppPath(), "public", "tray-icon.png");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: nativeImage.createFromPath(iconPath),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  mainWindow.setMenu(null);

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

function openTodoWidget() {
  if (todoWidgetWindow && !todoWidgetWindow.isDestroyed()) {
    todoWidgetWindow.show();
    todoWidgetWindow.focus();
    return;
  }
  todoWidgetWindow = new BrowserWindow({
    width: 64,
    height: 148,
    minWidth: 64,
    minHeight: 148,
    title: "Pinned Todo",
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    opacity: 0.9,
    autoHideMenuBar: true,
    backgroundColor: "#00000000",
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  todoWidgetWindow.setAlwaysOnTop(true, "floating");
  const area = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  todoWidgetWindow.setPosition(
    area.x + area.width - 64 - 16,
    area.y + area.height - 148 - 16,
  );
  if (process.env.ELECTRON_RENDERER_URL) {
    todoWidgetWindow.loadURL(
      `${process.env.ELECTRON_RENDERER_URL}/#/todo-widget`,
    );
  } else {
    todoWidgetWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "/todo-widget",
    });
  }
  todoWidgetWindow.on("closed", () => {
    if (todoWidgetSnapTimer) clearTimeout(todoWidgetSnapTimer);
    todoWidgetSnapTimer = null;
    todoWidgetWindow = null;
  });
  todoWidgetWindow.on("moved", () => {
    if (todoWidgetIsSnapping || !todoWidgetWindow) return;
    if (todoWidgetSnapTimer) clearTimeout(todoWidgetSnapTimer);
    todoWidgetSnapTimer = setTimeout(() => snapTodoWidgetToNearestEdge(), 180);
  });
}

function getTodoWidgetEdgeBounds(width: number, height: number) {
  if (!todoWidgetWindow || todoWidgetWindow.isDestroyed()) return null;
  const bounds = todoWidgetWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const inset = 16;
  const minX = area.x + inset;
  const maxX = area.x + area.width - width - inset;
  const minY = area.y + inset;
  const maxY = area.y + area.height - height - inset;
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));
  const distances = [
    { edge: "left", distance: Math.abs(bounds.x - area.x) },
    {
      edge: "right",
      distance: Math.abs(area.x + area.width - (bounds.x + bounds.width)),
    },
    { edge: "top", distance: Math.abs(bounds.y - area.y) },
    {
      edge: "bottom",
      distance: Math.abs(area.y + area.height - (bounds.y + bounds.height)),
    },
  ].sort((left, right) => left.distance - right.distance);
  const nearestEdge = distances[0]?.edge;
  let x = clamp(bounds.x, minX, maxX);
  let y = clamp(bounds.y, minY, maxY);
  if (nearestEdge === "left") x = minX;
  if (nearestEdge === "right") x = maxX;
  if (nearestEdge === "top") y = minY;
  if (nearestEdge === "bottom") y = maxY;
  return {
    x,
    y,
    width,
    height,
  };
}

function snapTodoWidgetToNearestEdge() {
  if (!todoWidgetWindow || todoWidgetWindow.isDestroyed()) return;
  const bounds = todoWidgetWindow.getBounds();
  const target = getTodoWidgetEdgeBounds(bounds.width, bounds.height);
  if (!target) return;
  todoWidgetIsSnapping = true;
  todoWidgetWindow.setBounds(target, true);
  setTimeout(() => {
    todoWidgetIsSnapping = false;
  }, 300);
}

function setTodoWidgetExpanded(expanded: boolean) {
  if (!todoWidgetWindow || todoWidgetWindow.isDestroyed()) return;
  const width = expanded ? 315 : 64;
  const height = expanded ? 430 : 148;
  const target = getTodoWidgetEdgeBounds(width, height);
  if (!target) return;
  todoWidgetIsSnapping = true;
  todoWidgetWindow.setOpacity(expanded ? 0.96 : 0.86);
  todoWidgetWindow.setBounds(target, true);
  setTimeout(() => {
    todoWidgetIsSnapping = false;
  }, 300);
}

ipcMain.handle("todo-widget:open", () => openTodoWidget());
ipcMain.handle("todo-widget:close", () => todoWidgetWindow?.close());
ipcMain.handle("todo-widget:set-expanded", (_event, expanded: boolean) =>
  setTodoWidgetExpanded(Boolean(expanded)),
);

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
      ? "https://api.prosyncedu.com/api"
      : "https://api.prosyncedu.com/api";
    const requestStartedAt = Date.now();
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    calibrateServerClock(response.headers?.date, requestStartedAt);
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
    trackingState.trackingDaySchedules =
      response.data?.data?.trackingDaySchedules || [];

    trackingState.isIdleExemptionEnabled =
      response.data?.data?.isIdleExemptionEnabled || false;
    trackingState.idleExemptionDays =
      response.data?.data?.idleExemptionDays || [];
    trackingState.idleExemptionStartTime =
      response.data?.data?.idleExemptionStartTime || "00:00";
    trackingState.idleExemptionEndTime =
      response.data?.data?.idleExemptionEndTime || "23:59";
    trackingState.idleExemptionDaySchedules =
      response.data?.data?.idleExemptionDaySchedules || [];
  } catch (err) {
    console.error(
      "[Auth] Failed to fetch user profile for tracking settings",
      err,
    );
  }

  // Auto-start tracking on login!
  desktopTrackingActivated = false;
  activateDesktopTracking();

  return true;
});

ipcMain.handle("auth:get", async () => ({
  token: authStore.get("token"),
  user: authStore.get("user"),
}));

ipcMain.handle("auth:clear", async (event, reason?: string) => {
  // Pause first so no scheduler, idle callback or screenshot can enqueue new
  // activity after the user has pressed Logout.
  trackingState.isTrackingPaused = true;
  desktopTrackingActivated = false;
  stopTracking();
  stopTrackingScheduler();
  stopScreenshotTracker();
  eventQueue.push(
    createTrackingEvent(EventType.LOGOUT, {
      reason: reason || "EXPLICIT_LOGOUT",
    }),
  );

  const oldToken = authStore.get("token");
  // Flush the final window + logout while the old token still exists. The UI
  // can return to login immediately, but tracking is already stopped locally.
  try {
    await uploadService.sync(oldToken as string);
  } catch (error) {
    console.error("[Auth] Final logout sync failed; queued for retry", error);
  }
  authStore.clear();

  // Asynchronously flush the queue (max 10 seconds) with the old token
  (async () => {
    let retries = 100;
    while (eventQueue.length > 0 && retries > 0) {
      await uploadService.sync(oldToken as string);
      await new Promise((resolve) => setTimeout(resolve, 100));
      retries--;
    }
  })().catch(console.error);

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

ipcMain.handle(
  "notification:show",
  async (
    _e,
    { title, body, action }: { title: string; body: string; action?: string },
  ) => {
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: title || "Workforce Platform",
          body: body || "",
          urgency: "critical",
          silent: false,
        });
        notif.on("click", () => {
          if (mainWindow) {
            if (process.platform === "darwin") {
              app.dock?.show();
              app.focus({ steal: true });
            }
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            if (action) {
              mainWindow.webContents.send(action);
            }
          }
        });
        notif.show();
        return true;
      }
    } catch (err) {
      console.error("[Notification] Failed to show notification:", err);
    }
    return false;
  },
);

ipcMain.handle(
  "dialog:showCheckinPrompt",
  async (
    _e,
    {
      title,
      message,
      detail,
      intervalLabel,
    }: {
      title?: string;
      message?: string;
      detail?: string;
      intervalLabel: string;
    },
  ) => {
    try {
      if (trackingState.isIdle) {
        return "snooze";
      }
      
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: title || "⏱️ Task Progress Check-in",
          body:
            detail ||
            `Time to update your tasks completed for ${intervalLabel}. Click to open.`,
          urgency: "critical",
          silent: false,
        });
        notif.on("click", () => {
          if (mainWindow) {
            if (process.platform === "darwin") {
              app.dock?.show();
              app.focus({ steal: true });
            }
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send("checkin:trigger", { intervalLabel });
          }
        });
        notif.show();
      }

      const options: any = {
        type: "info",
        title: title || "Task Progress Check-in",
        message: message || "Time for your progress update",
        detail:
          detail ||
          `Time interval reached (${intervalLabel}). Would you like to log your completed tasks now?`,
        buttons: ["Open Check-in", "Snooze (10 mins)", "Dismiss this slot"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      };

      const result = mainWindow 
        ? await dialog.showMessageBox(mainWindow, options)
        : await dialog.showMessageBox(options);

      if (result.response === 0) {
        if (mainWindow) {
          if (process.platform === "darwin") {
            app.dock?.show();
            app.focus({ steal: true });
          }
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send("checkin:trigger", { intervalLabel });
        }
        return "open";
      }
      return result.response === 1 ? "snooze" : "dismissed";
    } catch (err) {
      console.error("[Checkin Dialog] Error displaying check-in dialog:", err);
      return "dismissed";
    }
  },
);

ipcMain.handle(
  "dialog:showEodPrompt",
  async (
    _e,
    {
      title,
      message,
      detail,
    }: { title?: string; message?: string; detail?: string },
  ) => {
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: title || "Shift Ended",
          body:
            detail ||
            "Your shift has ended. Click to submit your End-of-Day report.",
          urgency: "critical",
          silent: false,
        });
        notif.on("click", () => {
          if (mainWindow) {
            if (process.platform === "darwin") {
              app.dock?.show();
              app.focus({ steal: true });
            }
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send("shift:open-eod");
          }
        });
        notif.show();
      }

      const result = await dialog.showMessageBox({
        type: "warning",
        title: title || "Shift Ended",
        message: message || "No EOD Submitted",
        detail:
          detail ||
          "Your expected logout time has been reached. Submit your end-of-day report before logging out, or continue if you need more time.",
        buttons: ["Open Agent EOD", "Keep working"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (result.response === 0) {
        if (mainWindow) {
          if (process.platform === "darwin") {
            app.dock?.show();
            app.focus({ steal: true });
          }
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send("shift:open-eod");
        }
        return "open";
      }
      return "dismiss";
    } catch (err) {
      console.error("[EOD Dialog] Error displaying EOD dialog:", err);
      return "dismiss";
    }
  },
);

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
    Menu.setApplicationMenu(null);

    // Clear HTTP cache on startup to prevent cached redirects
    try {
      await session.defaultSession.clearCache();
      console.log("[Boot] HTTP cache cleared successfully.");
    } catch (err) {
      console.error("[Boot] Failed to clear cache:", err);
    }

    if (process.platform === "darwin") {
      const isTrusted = checkMacTrackingPermission(false);
      if (!isTrusted) {
        console.log(
          "[Mac] Requesting accessibility permissions for window tracking...",
        );
        setTimeout(() => checkMacTrackingPermission(true), 2000);
      }

      setInterval(
        () => checkMacTrackingPermission(false),
        MAC_PERMISSION_WARNING_COOLDOWN_MS,
      );
    }

    createWindow();
    createTray();

    // Force a shift check immediately when waking up from sleep or unlocking
    powerMonitor.on("resume", () => {
      forceShiftCheck();
      if (app.isPackaged) void setupAutoStart();
    });
    powerMonitor.on("unlock-screen", () => {
      trackingState.awaitingPresenceProof = true;
      forceShiftCheck();
    });

    // If user is already logged in, auto-start tracking on boot
    if (authStore.get("token")) {
      console.log(
        "[Boot] User is logged in; waiting for an unlocked desktop...",
      );
    }

    // Set the app to automatically start on user login (only when packaged/installed)
    if (app.isPackaged) {
      await setupAutoStart();

      // Repair the login registration if an update or cleanup utility removes
      // it while the agent is running.
      setInterval(() => void setupAutoStart(), 1000 * 60 * 60 * 6);

      // Setup Auto Updater to check on startup and then every 1 hour
      autoUpdater.autoRunAppAfterInstall = true;
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
            console.log(
              "[AutoUpdater] Notification clicked, restoring/focusing window and triggering button glow...",
            );
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.show();
              mainWindow.focus();
              mainWindow.webContents.send("updater:trigger-glow");
            }
          });
          updateNotif.show();
        }
      });

      ipcMain.on("updater:install", async () => {
        if (updateInstallInProgress) return;
        console.log(
          "[AutoUpdater] User triggered install. Launching installer...",
        );
        if (await hasExtraAgentProcesses()) {
          await dialog.showMessageBox(mainWindow || undefined, {
            type: "warning",
            title: "Restart required before updating",
            message: "Workforce Agent is running more than once.",
            detail:
              "To keep tracking reliable, the update was not started. Please restart your computer, open Workforce Agent once, and click Restart to update again.",
            buttons: ["OK"],
          });
          return;
        }
        updateInstallInProgress = true;
        trackingState.isTrackingPaused = true;
        stopTrackingScheduler();
        stopScreenshotTracker();
        stopTracking();
        try {
          await uploadService.sync(authStore.get("token") as string);
        } catch (error) {
          console.error("[AutoUpdater] Final sync before update failed", error);
        }
        allowInternalQuit();
        try {
          app.removeAllListeners("window-all-closed");
          if (todoWidgetSnapTimer) clearTimeout(todoWidgetSnapTimer);
          todoWidgetSnapTimer = null;
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.destroy();
          }
          tray?.destroy();
          tray = null;
          mainWindow = null;
          todoWidgetWindow = null;
          console.log(
            "[AutoUpdater] App windows closed; installing and relaunching.",
          );
          autoUpdater.quitAndInstall(false, true);
        } catch (error) {
          updateInstallInProgress = false;
          isQuitting = false;
          console.error("[AutoUpdater] Failed to launch installer", error);
          await dialog.showMessageBox({
            type: "error",
            title: "Update could not restart the agent",
            message: "Workforce Agent could not start the update installer.",
            detail:
              "Please restart your computer, open Workforce Agent once, and click Restart to update again.",
            buttons: ["OK"],
          });
        }
      });
    }

    // Sync user profile to check screenshot permissions periodically
    const syncUserProfile = async () => {
      try {
        const token = authStore.get("token");
        if (!token) return;
        const API_URL = app.isPackaged
          ? "https://api.prosyncedu.com/api"
          : "https://api.prosyncedu.com/api";
        const requestStartedAt = Date.now();
        const response = await axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        calibrateServerClock(response.headers?.date, requestStartedAt);
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
        trackingState.trackingDaySchedules =
          response.data?.data?.trackingDaySchedules || [];

        trackingState.isIdleExemptionEnabled =
          response.data?.data?.isIdleExemptionEnabled || false;
        trackingState.idleExemptionDays =
          response.data?.data?.idleExemptionDays || [];
        trackingState.idleExemptionStartTime =
          response.data?.data?.idleExemptionStartTime || "00:00";
        trackingState.idleExemptionEndTime =
          response.data?.data?.idleExemptionEndTime || "23:59";
        trackingState.idleExemptionDaySchedules =
          response.data?.data?.idleExemptionDaySchedules || [];
      } catch (err) {
        console.error(
          "[Main] Failed to sync user profile for screenshot settings",
          err,
        );
      }
    };

    // Run immediately on startup, and then every 5 minutes
    await syncUserProfile();
    setInterval(syncUserProfile, 5 * 60 * 1000);

    powerMonitor.on("unlock-screen", activateDesktopTracking);
    powerMonitor.on("resume", activateDesktopTracking);
    powerMonitor.on("lock-screen", pauseDesktopTrackingForLock);
    powerMonitor.on("suspend", pauseDesktopTrackingForLock);

    // FIXED: Start the chunked uploader to run every 30 seconds
    setInterval(() => {
      uploadService.sync();
    }, 30000);

    startShiftWatcher();
    activateDesktopTracking();

    // Auto-restart at midnight to guarantee session resets and fresh state
    const scheduleMidnightRestart = () => {
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0,
      );
      const timeUntilMidnight = midnight.getTime() - now.getTime();

      console.log(
        `[Main] Scheduled auto-restart in ${timeUntilMidnight} ms (at midnight).`,
      );

      setTimeout(() => {
        console.log("[Main] Midnight reached! Relaunching agent...");
        allowInternalQuit();
        app.relaunch();
        app.quit();
      }, timeUntilMidnight);
    };
    scheduleMidnightRestart();

    const sessionState = await initializeSession();
    console.log("[Main] Session state:", sessionState);
    startDesktopActivationWatchdog();
  });

  // Handle graceful shutdown on restart/shutdown
  app.on("before-quit", async (event) => {
    if (!appQuitAllowed) {
      event.preventDefault();
      isQuitting = false;
      mainWindow?.hide();
      console.log("[Main] User-triggered app quit blocked; hiding window.");
      return;
    }

    // If we're quitting due to an update (isQuitting is already true), skip network calls which can block installer spawn
    const isUpdateQuit = updateInstallInProgress;
    allowInternalQuit();
    console.log("[Main] App is quitting. Ending session...");

    if (isUpdateQuit) {
      console.log("[Main] Skipping session end due to updater install.");
      return;
    }

    try {
      const token = authStore.get("token");
      const API_URL = app.isPackaged
        ? "https://api.prosyncedu.com/api"
        : "https://api.prosyncedu.com/api";
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
