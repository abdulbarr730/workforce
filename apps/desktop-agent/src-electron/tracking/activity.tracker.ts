import { screen, powerMonitor } from "electron";

import { EventType } from "../../../../packages/shared-types/src/event-types";

import { eventQueue } from "./event.queue";

import { authStore } from "../store/auth.store";

import { getDeviceMeta } from "./device-info";

import { trackingState } from "./tracking-state";

import { createTrackingEvent } from "./event.factory";

let trackingInterval: NodeJS.Timeout | null = null;

/*
  App name normalization
*/

const APP_NAMES: Record<string, string> = {
  "code.exe": "VS Code",

  chrome: "Google Chrome",

  "chrome.exe": "Google Chrome",

  msedge: "Microsoft Edge",

  "msedge.exe": "Microsoft Edge",

  firefox: "Firefox",

  "firefox.exe": "Firefox",

  brave: "Brave",

  "brave.exe": "Brave",

  slack: "Slack",

  "slack.exe": "Slack",

  notion: "Notion",

  "notion.exe": "Notion",

  figma: "Figma",

  "figma.exe": "Figma",

  postman: "Postman",

  "postman.exe": "Postman",

  discord: "Discord",

  "discord.exe": "Discord",

  zoom: "Zoom",

  "zoom.exe": "Zoom",

  teams: "Microsoft Teams",

  "teams.exe": "Microsoft Teams",

  "wt.exe": "Windows Terminal",

  "powershell.exe": "PowerShell",

  "cmd.exe": "Command Prompt",

  "explorer.exe": "File Explorer",
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
];

function isBrowserApp(app: string): boolean {
  const lower = app.toLowerCase();

  return BROWSER_KEYS.some((b) => lower.includes(b));
}

function extractDomain(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

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

export const startTracking = () => {
  if (trackingInterval) {
    return;
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

  trackingInterval = setInterval(
    async () => {
      try {
        const token = authStore.get("token");
        if (!token) return;

        let result: any = null;
        let needsUrlFallback = true;

        // Mock fallback if active-win fails (e.g., in background service mode or Windows 11 UIAccess issues) or if we need URL
        if (!result || needsUrlFallback) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { spawn } = require("child_process");
            
            const runScriptAsync = (cmd: string, args: string[], inputStr?: string): Promise<string> => {
              return new Promise((resolve, reject) => {
                const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "ignore"] });
                let out = "";
                child.stdout.on("data", (d: any) => { out += d.toString(); });
                child.on("close", () => resolve(out));
                child.on("error", reject);
                if (inputStr) {
                  child.stdin.write(inputStr);
                  child.stdin.end();
                }
              });
            };

            if (process.platform === "darwin") {
              const osaScript = `
                    tell application "System Events"
                      set frontApp to name of first application process whose frontmost is true
                      set windowTitle to ""
                      try
                        set windowTitle to name of front window of (first application process whose frontmost is true)
                      end try
                    end tell
                    set appUrl to ""
                    try
                      if frontApp is "Google Chrome" then
                        tell application "Google Chrome" to set appUrl to URL of active tab of front window
                      else if frontApp is "Brave Browser" then
                        tell application "Brave Browser" to set appUrl to URL of active tab of front window
                      else if frontApp is "Microsoft Edge" then
                        tell application "Microsoft Edge" to set appUrl to URL of active tab of front window
                      else if frontApp is "Safari" then
                        tell application "Safari" to set appUrl to URL of front document
                      end if
                    end try
                    return frontApp & "~~~~" & windowTitle & "~~~~" & appUrl & "~~~~"
                  `;
              const stdout = await runScriptAsync("osascript", ["-e", osaScript]);
              const parts = stdout.trim().split("~~~~");
              const pName = parts[0] || "unknown";
              const pTitle = parts[1] || "";
              const pUrl = parts[2] || undefined;

              result = {
                title: pTitle,
                id: 1,
                bounds: { x: 0, y: 0, width: 1920, height: 1080 },
                owner: { name: pName, processId: 1000, path: "" },
                memoryUsage: 0,
                url: pUrl,
              };
            } else {
              // Use a fast PowerShell script to get foreground window title and process name
              const psScript = `
                    Add-Type -ReferencedAssemblies "UIAutomationClient","UIAutomationTypes" @"
                      using System;
                      using System.Runtime.InteropServices;
                      using System.Windows.Automation;
                      public class Win32 {
                        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
                        [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
                        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
                        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT lpRect);
                        [StructLayout(LayoutKind.Sequential)]
                        public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
                        
                        public static string GetWindowBoundsStr(IntPtr hwnd) {
                            RECT r;
                            if (GetWindowRect(hwnd, out r)) {
                                return r.Left + "," + r.Top + "," + (r.Right - r.Left) + "," + (r.Bottom - r.Top);
                            }
                            return "0,0,1920,1080";
                        }
                        
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
                      }
"@
                    $hwnd = [Win32]::GetForegroundWindow()
                    $processId = 0
                    [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
                    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                    $title = New-Object System.Text.StringBuilder 256
                    [Win32]::GetWindowText($hwnd, $title, 256) | Out-Null
                    
                    $url = ""
                    $pName = $process.Name
                    if ($pName -match "chrome|msedge|brave") {
                        $url = [Win32]::GetBrowserUrl($hwnd)
                    }
                    
                    $bounds = [Win32]::GetWindowBoundsStr($hwnd)
                    Write-Output "$($process.Name)~~~~$($title.ToString())~~~~$url~~~~$bounds"
                  `;

              const stdout = await runScriptAsync(
                "powershell",
                ["-NoProfile", "-NonInteractive", "-Command", "-"],
                psScript
              );

              const parts = stdout.trim().split("~~~~");
              const pName = parts[0] || "unknown";
              const pTitle = parts[1] || "";
              const pUrl = parts[2] || undefined;
              const pBoundsStr = parts[3] || "0,0,1920,1080";
              const pB = pBoundsStr.split(",").map(Number);

              result = {
                title: pTitle,
                id: 1,
                bounds: { x: pB[0], y: pB[1], width: pB[2], height: pB[3] },
                owner: {
                  name: pName + (pName === "unknown" ? "" : ".exe"),
                  processId: 1000,
                  path: "",
                },
                memoryUsage: 0,
                url: pUrl,
              };
            }
          } catch (_e) {
            // Fallback to platform-specific unknown state without crashing
            const isMac = process.platform === "darwin";
            let fallbackName = isMac ? "unknown" : "unknown.exe";

            if (isMac) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { execFileSync } = require("child_process");
                // lsappinfo doesn't strictly need Accessibility permissions to get the active app name!
                const frontAsn = execFileSync("lsappinfo", ["front"], { encoding: "utf8" }).trim();
                if (frontAsn) {
                  const appNameRaw = execFileSync("lsappinfo", ["info", "-only", "name", frontAsn], { encoding: "utf8" }).trim();
                  // Returns something like "Google Chrome", strip quotes
                  fallbackName = appNameRaw.replace(/^"|"$/g, "");
                }
              } catch (fallbackErr) {
                // Ignore fallback error
              }
            }

            result = {
              title: "Unknown Window",
              id: 1,
              bounds: { x: 0, y: 0, width: 1920, height: 1080 },
              owner: {
                name: fallbackName,
                processId: 1000,
                path: "",
              },
              memoryUsage: 0,
            };
          }
        }

        const rawApp = result.owner.name;

        const title = result.title || "";

        const url: string | undefined = (result as any).url; // eslint-disable-line @typescript-eslint/no-explicit-any

        const baseApp = normalizeAppName(rawApp);

        const app = baseApp;

        const bounds = (result as any).bounds; // eslint-disable-line @typescript-eslint/no-explicit-any

        const { screenIndex, screenLabel, totalScreens } =
          getScreenInfo(bounds);

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

        trackingState.isBrowser = isBrowserApp(baseApp);

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
              Window changed
            */

        if (
          app !== lastApp ||
          title !== lastTitle ||
          Date.now() - windowStartTime.getTime() >= 300_000 // 5 minute auto flush
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

            console.log(`[Tracker] ${lastApp} (${duration}s)`);
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
    );
  }

  if (trackingInterval) {
    clearInterval(trackingInterval);

    trackingInterval = null;
  }

  eventQueue.push(createTrackingEvent(EventType.AGENT_OFFLINE));

  console.log("[Tracker] Stopped");
};
