import { screen, powerMonitor, systemPreferences } from "electron";
import { EventType } from "@workforce/shared-types";
import { eventQueue } from "./event.queue";
import { authStore } from "../store/auth.store";
import { getDeviceMeta } from "./device-info";
import { trackingState } from "./tracking-state";
import { createTrackingEvent } from "./event.factory";
import { spawn, type ChildProcess } from "child_process";
import { DeviceErrorLogger } from "./device-error.logger";

let trackingInterval: NodeJS.Timeout | null = null;
let lastMacActiveWindowErrorAt = 0;
let lastMacAccessibilityErrorAt = 0;
const MAC_TRACKING_ERROR_COOLDOWN_MS = 10 * 60 * 1000;

/*
  App name normalization
*/
const APP_NAMES: Record<string, string> = {
  // Windows executables
  "code.exe": "VS Code",
  "code": "VS Code",
  "visual studio code": "VS Code",
  "chrome.exe": "Google Chrome",
  "chrome": "Google Chrome",
  "google chrome": "Google Chrome",
  "msedge.exe": "Microsoft Edge",
  "msedge": "Microsoft Edge",
  "microsoft edge": "Microsoft Edge",
  "firefox.exe": "Firefox",
  "firefox": "Firefox",
  "brave.exe": "Brave",
  "brave": "Brave",
  "brave browser": "Brave",
  "arc": "Arc",
  "safari": "Safari",
  "opera.exe": "Opera",
  "opera": "Opera",
  "vivaldi.exe": "Vivaldi",
  "vivaldi": "Vivaldi",
  "slack.exe": "Slack",
  "slack": "Slack",
  "notion.exe": "Notion",
  "notion": "Notion",
  "figma.exe": "Figma",
  "figma": "Figma",
  "postman.exe": "Postman",
  "postman": "Postman",
  "discord.exe": "Discord",
  "discord": "Discord",
  "zoom.exe": "Zoom",
  "zoom": "Zoom",
  "zoom.us": "Zoom",
  "teams.exe": "Microsoft Teams",
  "teams": "Microsoft Teams",
  "microsoft teams": "Microsoft Teams",
  "wt.exe": "Windows Terminal",
  "powershell.exe": "PowerShell",
  "cmd.exe": "Command Prompt",
  "explorer.exe": "File Explorer",
  "finder": "Finder",
  "terminal": "Terminal",
  "iterm2": "iTerm2",
  "sublime_text": "Sublime Text",
  "xcode": "Xcode",
};

function normalizeAppName(raw: string): string {
  const key = raw.toLowerCase().trim();
  return APP_NAMES[key] || raw;
}

/*
  Browser detection
*/
const BROWSER_KEYS = [
  "chrome",
  "firefox",
  "edge",
  "brave",
  "opera",
  "vivaldi",
  "arc",
  "safari",
  "orion",
  "chromium",
];

function isBrowserApp(app: string): boolean {
  const lower = app.toLowerCase();
  return BROWSER_KEYS.some((b) => lower.includes(b));
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const hostname = new URL(url).hostname;
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return undefined;
  }
}

/*
  Screen info
*/
function getScreenInfo(bounds?: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  try {
    const displays = screen.getAllDisplays();
    const total = displays.length;

    if (!bounds) {
      return {
        screenIndex: 0,
        screenLabel: "Primary",
        totalScreens: total || 1,
      };
    }

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    const index = displays.findIndex(
      ({ bounds: b }) =>
        centerX >= b.x &&
        centerX < b.x + b.width &&
        centerY >= b.y &&
        centerY < b.y + b.height,
    );

    const finalIndex = index >= 0 ? index : 0;
    return {
      screenIndex: finalIndex,
      screenLabel:
        total > 1 ? `Screen ${finalIndex + 1} of ${total}` : "Primary",
      totalScreens: total,
    };
  } catch {
    return {
      screenIndex: 0,
      screenLabel: "Primary",
      totalScreens: 1,
    };
  }
}

/*
  Window tracking state
*/
let lastApp = "";
let lastTitle = "";
let lastUrl: string | undefined;
let windowStartTime = new Date();

function flushWindowEvent(
  app: string,
  title: string,
  url?: string,
  durationSeconds = 1,
  extra: object = {},
) {
  const domain = extractDomain(url);
  const isBrowser = isBrowserApp(app) || !!url;

  eventQueue.push(
    createTrackingEvent(
      EventType.ACTIVE_WINDOW,
      {
        app,
        title,
        url,
        domain,
        isBrowser,
        durationSeconds,
        ...extra,
        ...getDeviceMeta(),
      },
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows Persistent Worker (Compiles Win32 C# once on startup -> 0% CPU lag)
// ─────────────────────────────────────────────────────────────────────────────

const WIN32_INIT_SCRIPT = `
Add-Type -ReferencedAssemblies "UIAutomationClient","UIAutomationTypes" @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

public class Win32Helper {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT lpRect);
    
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    public static string GetBrowserUrl(IntPtr hwnd) {
        try {
            AutomationElement root = AutomationElement.FromHandle(hwnd);
            if (root == null) return "";
            Condition orCond = new OrCondition(
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document)
            );
            AutomationElementCollection elements = root.FindAll(TreeScope.Descendants, orCond);
            foreach (AutomationElement el in elements) {
                object patternObj;
                if (el.TryGetCurrentPattern(ValuePattern.Pattern, out patternObj)) {
                    ValuePattern val = patternObj as ValuePattern;
                    string v = val.Current.Value;
                    if (!string.IsNullOrEmpty(v) && (v.StartsWith("http") || v.Contains("."))) {
                        return v;
                    }
                }
            }
        } catch {}
        return "";
    }

    public static string GetActiveInfo() {
        try {
            IntPtr hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return "unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080";
            
            uint pid = 0;
            GetWindowThreadProcessId(hwnd, out pid);
            string procName = "unknown";
            try {
                var proc = System.Diagnostics.Process.GetProcessById((int)pid);
                if (proc != null) procName = proc.ProcessName;
            } catch {}

            StringBuilder title = new StringBuilder(256);
            GetWindowText(hwnd, title, 256);

            string url = "";
            string lower = procName.ToLower();
            if (lower.Contains("chrome") || lower.Contains("msedge") || lower.Contains("brave") || lower.Contains("opera") || lower.Contains("vivaldi")) {
                url = GetBrowserUrl(hwnd);
            }

            RECT r;
            string bounds = "0,0,1920,1080";
            if (GetWindowRect(hwnd, out r)) {
                bounds = r.Left + "," + r.Top + "," + (r.Right - r.Left) + "," + (r.Bottom - r.Top);
            }

            return procName + "~~~~" + title.ToString() + "~~~~" + url + "~~~~" + bounds;
        } catch {
            return "unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080";
        }
    }
}
"@
Write-Output "WIN32_READY"
`;

class WindowsTrackingWorker {
  private child: ChildProcess | null = null;
  private pendingResolves: ((val: string) => void)[] = [];
  private buffer = "";
  private isReady = false;

  start() {
    if (this.child) return;
    try {
      this.child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "-"], {
        stdio: ["pipe", "pipe", "ignore"],
      });

      this.child.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString("utf8");
        const lines = this.buffer.split("\n");
        while (lines.length > 1) {
          const line = lines.shift()?.trim();
          if (line) {
            if (line === "WIN32_READY") {
              this.isReady = true;
            } else if (this.pendingResolves.length > 0) {
              const resolve = this.pendingResolves.shift();
              resolve?.(line);
            }
          }
        }
        this.buffer = lines[0] || "";
      });

      this.child.on("close", () => {
        this.child = null;
        this.isReady = false;
      });

      this.child.on("error", () => {
        this.child = null;
        this.isReady = false;
      });

      // Send compilation script once
      this.child.stdin?.write(WIN32_INIT_SCRIPT + "\n");
    } catch (e) {
      console.error("[WindowsWorker] Failed to start:", e);
    }
  }

  async getActiveInfo(): Promise<string> {
    if (!this.child || !this.isReady) {
      if (!this.child) this.start();
      // Allow warm up or fallback
      await new Promise((r) => setTimeout(r, 150));
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.pendingResolves.indexOf(resolve);
        if (idx !== -1) {
          this.pendingResolves.splice(idx, 1);
        }
        resolve("unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080");
      }, 2000);

      this.pendingResolves.push((res) => {
        clearTimeout(timer);
        resolve(res);
      });

      try {
        this.child?.stdin?.write("[Win32Helper]::GetActiveInfo()\n");
      } catch {
        resolve("unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080");
      }
    });
  }

  stop() {
    if (this.child) {
      try {
        this.child.kill();
      } catch {}
      this.child = null;
      this.isReady = false;
    }
    this.pendingResolves.forEach((resolve) => resolve("unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080"));
    this.pendingResolves = [];
  }
}

const winWorker = new WindowsTrackingWorker();

// ─────────────────────────────────────────────────────────────────────────────
// macOS High-Performance JXA Script (Native AppKit + Browser URL Extraction)
// ─────────────────────────────────────────────────────────────────────────────

const MAC_JXA_SCRIPT = `
ObjC.import('AppKit');
function run() {
  try {
    var frontApp = $.NSWorkspace.sharedWorkspace.frontmostApplication;
    if (!frontApp) {
      return "unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080";
    }
    var appName = frontApp.localizedName ? frontApp.localizedName.js : 'unknown';
    var bundleId = frontApp.bundleIdentifier ? frontApp.bundleIdentifier.js : '';
    var windowTitle = '';
    var appUrl = '';

    var lowerName = appName.toLowerCase();
    var lowerBundle = bundleId.toLowerCase();

    // 1. Browser URL & Tab Title Extraction
    try {
      if (lowerName.indexOf('chrome') !== -1 || lowerBundle.indexOf('chrome') !== -1) {
        var chrome = Application('Google Chrome');
        if (chrome.running() && chrome.windows.length > 0) {
          var tab = chrome.windows[0].activeTab;
          windowTitle = tab.name() || '';
          appUrl = tab.url() || '';
        }
      } else if (lowerName.indexOf('brave') !== -1 || lowerBundle.indexOf('brave') !== -1) {
        var brave = Application('Brave Browser');
        if (brave.running() && brave.windows.length > 0) {
          var tab = brave.windows[0].activeTab;
          windowTitle = tab.name() || '';
          appUrl = tab.url() || '';
        }
      } else if (lowerName.indexOf('edge') !== -1 || lowerBundle.indexOf('edge') !== -1) {
        var edge = Application('Microsoft Edge');
        if (edge.running() && edge.windows.length > 0) {
          var tab = edge.windows[0].activeTab;
          windowTitle = tab.name() || '';
          appUrl = tab.url() || '';
        }
      } else if (lowerName.indexOf('arc') !== -1 || lowerBundle.indexOf('thebrowser') !== -1) {
        var arc = Application('Arc');
        if (arc.running() && arc.windows.length > 0) {
          var tab = arc.windows[0].activeTab;
          windowTitle = (tab.title ? tab.title() : (tab.name ? tab.name() : '')) || '';
          appUrl = tab.url() || '';
        }
      } else if (lowerName.indexOf('safari') !== -1 || lowerBundle.indexOf('safari') !== -1) {
        var safari = Application('Safari');
        if (safari.running() && safari.documents.length > 0) {
          var doc = safari.documents[0];
          windowTitle = doc.name() || '';
          appUrl = doc.url() || '';
        }
      } else if (lowerName.indexOf('opera') !== -1 || lowerBundle.indexOf('opera') !== -1) {
        var opera = Application('Opera');
        if (opera.running() && opera.windows.length > 0) {
          var tab = opera.windows[0].activeTab;
          windowTitle = tab.name() || '';
          appUrl = tab.url() || '';
        }
      } else if (lowerName.indexOf('vivaldi') !== -1 || lowerBundle.indexOf('vivaldi') !== -1) {
        var vivaldi = Application('Vivaldi');
        if (vivaldi.running() && vivaldi.windows.length > 0) {
          var tab = vivaldi.windows[0].activeTab;
          windowTitle = tab.name() || '';
          appUrl = tab.url() || '';
        }
      }
    } catch (browserErr) {}

    // 2. Generic Window Title for Desktop Applications
    if (!windowTitle) {
      try {
        var se = Application('System Events');
        var proc = se.applicationProcesses.where({ frontmost: true })[0];
        if (proc && proc.windows.length > 0) {
          windowTitle = proc.windows[0].name() || '';
        }
      } catch (seErr) {}
    }

    if (!windowTitle) {
      windowTitle = appName;
    }

    return appName + '~~~~' + windowTitle + '~~~~' + appUrl + '~~~~0,0,1920,1080';
  } catch (err) {
    return 'unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080';
  }
}
`;

const logMacTrackingError = (errorType: string, message: string) => {
  const now = Date.now();
  const lastAt =
    errorType === "mac_accessibility_permission_missing"
      ? lastMacAccessibilityErrorAt
      : lastMacActiveWindowErrorAt;

  if (now - lastAt < MAC_TRACKING_ERROR_COOLDOWN_MS) return;

  if (errorType === "mac_accessibility_permission_missing") {
    lastMacAccessibilityErrorAt = now;
  } else {
    lastMacActiveWindowErrorAt = now;
  }

  DeviceErrorLogger.logError(errorType, new Error(message));
};

async function getMacActiveInfo(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const hasAccessibility = systemPreferences.isTrustedAccessibilityClient(false);
      if (!hasAccessibility) {
        logMacTrackingError(
          "mac_accessibility_permission_missing",
          "macOS Accessibility permission is not enabled for Workforce Agent. Window titles and app activity may be incomplete until the employee allows it in System Settings > Privacy & Security > Accessibility.",
        );
      }

      const child = spawn("osascript", ["-l", "JavaScript", "-e", MAC_JXA_SCRIPT], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let out = "";
      let err = "";
      let settled = false;
      const fallback = "unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080";
      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value || fallback);
      };
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        logMacTrackingError(
          "mac_active_window_timeout",
          "macOS active-window capture timed out. Workforce Agent kept tracking with a safe fallback, but app/window names may be incomplete.",
        );
        finish(fallback);
      }, 4000);

      child.stdout?.on("data", (data: Buffer) => {
        out += data.toString("utf8");
      });

      child.stderr?.on("data", (data: Buffer) => {
        err += data.toString("utf8");
      });

      child.on("close", (code) => {
        const trimmed = out.trim();
        if (code !== 0 || !trimmed) {
          logMacTrackingError(
            "mac_active_window_unavailable",
            `macOS active-window capture returned no usable result${code === null ? "" : ` (exit ${code})`}.${err ? ` ${err.trim().slice(0, 500)}` : ""}`,
          );
        }
        finish(trimmed || fallback);
      });

      child.on("error", (error) => {
        logMacTrackingError(
          "mac_active_window_process_error",
          `macOS active-window capture could not start: ${error.message}`,
        );
        finish(fallback);
      });
    } catch (error) {
      logMacTrackingError(
        "mac_active_window_exception",
        error instanceof Error ? error.message : String(error),
      );
      resolve("unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080");
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Start / Stop Tracking
// ─────────────────────────────────────────────────────────────────────────────

export const startTracking = () => {
  if (trackingInterval) {
    return;
  }

  // Pre-initialize Windows worker on startup
  if (process.platform === "win32") {
    winWorker.start();
  }

  if (!(global as any)._powerListenersAttached) {
    (global as any)._powerListenersAttached = true;
    powerMonitor.on("suspend", () => {
      if (lastApp) {
        const duration = Math.max(
          1,
          Math.round((Date.now() - windowStartTime.getTime()) / 1000),
        );
        flushWindowEvent(
          lastApp,
          lastTitle,
          lastUrl,
          duration,
          getScreenInfo(),
        );
      }
      lastApp = "";
      lastTitle = "";
      lastUrl = undefined;
      windowStartTime = new Date();
      eventQueue.push(
        createTrackingEvent(EventType.SYSTEM_SLEEP, { ...getDeviceMeta() }),
      );
    });
    powerMonitor.on("resume", () => {
      windowStartTime = new Date();
      eventQueue.push(
        createTrackingEvent(EventType.SYSTEM_WAKE, { ...getDeviceMeta() }),
      );
    });
  }

  console.log("[Tracker] Started");
  windowStartTime = new Date();

  trackingInterval = setInterval(
    async () => {
      try {
        const token = authStore.get("token");
        if (!token) return;

        let rawOutput = "";
        if (process.platform === "darwin") {
          rawOutput = await getMacActiveInfo();
        } else if (process.platform === "win32") {
          rawOutput = await winWorker.getActiveInfo();
        } else {
          rawOutput = "unknown~~~~Unknown Window~~~~~~~~0,0,1920,1080";
        }

        const parts = rawOutput.split("~~~~");
        const rawApp = (parts[0] || "unknown").trim();
        const title = (parts[1] || "").trim();
        const url = (parts[2] || "").trim() || undefined;
        const boundsStr = parts[3] || "0,0,1920,1080";
        const pB = boundsStr.split(",").map(Number);
        const bounds = {
          x: pB[0] || 0,
          y: pB[1] || 0,
          width: pB[2] || 1920,
          height: pB[3] || 1080,
        };

        const baseApp = normalizeAppName(rawApp);
        const app = baseApp;
        const { screenIndex, screenLabel, totalScreens } = getScreenInfo(bounds);

        /*
          Check if calendar day changed to reset session start locally
        */
        const todayStr = new Date().toISOString().split("T")[0];
        const sessionStr = trackingState.sessionStartAt
          .toISOString()
          .split("T")[0];
        if (todayStr !== sessionStr) {
          trackingState.sessionStartAt = new Date();
          console.log(
            "[Tracker] New calendar day detected. Resetting session start time.",
          );
        }

        /*
          Live renderer state
        */
        trackingState.currentApp = app;
        trackingState.currentTitle = title;
        trackingState.currentUrl = url;
        trackingState.currentDomain = extractDomain(url);
        trackingState.isBrowser = isBrowserApp(baseApp) || !!url;
        trackingState.screenIndex = screenIndex;
        trackingState.screenLabel = screenLabel;
        trackingState.totalScreens = totalScreens;
        trackingState.windowBounds = bounds;
        trackingState.lastEventAt = new Date();

        const screenMeta = {
          screenIndex,
          screenLabel,
          totalScreens,
          windowBounds: bounds,
        };

        trackingState.currentAppStartedAt = windowStartTime;

        /*
          Window changed or 5-minute auto flush
        */
        if (
          app !== lastApp ||
          title !== lastTitle ||
          Date.now() - windowStartTime.getTime() >= 300_000
        ) {
          if (lastApp) {
            const duration = Math.max(
              1,
              Math.round((Date.now() - windowStartTime.getTime()) / 1000),
            );

            flushWindowEvent(
              lastApp,
              lastTitle,
              lastUrl,
              duration,
              screenMeta,
            );

            console.log(`[Tracker] ${lastApp} (${duration}s) - ${title}`);
          }

          lastApp = app;
          lastTitle = title;
          lastUrl = url;
          windowStartTime = new Date();
        } else {
          lastUrl = url || lastUrl;
        }
      } catch (err) {
        console.error("[Tracker] Error:", err);
      }
    },
    10000,
  );
};

export const stopTracking = () => {
  if (lastApp) {
    const duration = Math.max(
      1,
      Math.round((Date.now() - windowStartTime.getTime()) / 1000),
    );

    flushWindowEvent(
      lastApp,
      lastTitle,
      lastUrl,
      duration,
      getScreenInfo(),
    );
  }

  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }

  if (process.platform === "win32") {
    winWorker.stop();
  }

  eventQueue.push(createTrackingEvent(EventType.AGENT_OFFLINE));
  console.log("[Tracker] Stopped");
};
