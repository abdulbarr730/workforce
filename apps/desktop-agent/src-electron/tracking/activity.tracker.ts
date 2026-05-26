import { screen } from "electron";
import { activeWindow } from "active-win";
import crypto from "crypto";
import { eventQueue } from "./event.queue";
import { authStore } from "../store/auth.store";
import { getDeviceId, getDeviceMeta } from "./device-info";
import { sessionId } from "./session.manager";
import { trackingState } from "./tracking-state";

let trackingInterval: NodeJS.Timeout | null = null;

// ── App name normalisation (Windows .exe → display name) ────────────────────
const APP_NAMES: Record<string, string> = {
  "code.exe": "VS Code",
  "code": "VS Code",
  "chrome.exe": "Google Chrome",
  "chrome": "Google Chrome",
  "msedge.exe": "Microsoft Edge",
  "msedge": "Microsoft Edge",
  "firefox.exe": "Firefox",
  "firefox": "Firefox",
  "brave.exe": "Brave",
  "brave browser": "Brave",
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
  "teams.exe": "Microsoft Teams",
  "microsoft teams": "Microsoft Teams",
  "word": "Microsoft Word",
  "winword.exe": "Microsoft Word",
  "excel.exe": "Microsoft Excel",
  "excel": "Microsoft Excel",
  "powerpnt.exe": "PowerPoint",
  "powerpoint": "PowerPoint",
  "wt.exe": "Windows Terminal",
  "windowsterminal.exe": "Windows Terminal",
  "cmd.exe": "Command Prompt",
  "powershell.exe": "PowerShell",
  "explorer.exe": "File Explorer",
  "notepad.exe": "Notepad",
  "notepad++.exe": "Notepad++",
  "rider64.exe": "JetBrains Rider",
  "idea64.exe": "IntelliJ IDEA",
  "webstorm64.exe": "WebStorm",
  "pycharm64.exe": "PyCharm",
  "datagrip64.exe": "DataGrip",
  "obsidian.exe": "Obsidian",
  "spotify.exe": "Spotify",
  "studio64.exe": "Android Studio",
  "android studio": "Android Studio",
  "xcode": "Xcode",
  "terminal": "Terminal",
  "iterm2": "iTerm2",
  "sublime text": "Sublime Text",
  "atom": "Atom",
};

function normaliseName(raw: string): string {
  const key = raw.toLowerCase().trim();
  return APP_NAMES[key] ?? raw;
}

// ── Browser detection ────────────────────────────────────────────────────────
const BROWSER_KEYS = [
  "chrome", "google chrome", "chromium", "firefox", "mozilla firefox",
  "safari", "edge", "microsoft edge", "brave", "arc", "opera", "vivaldi",
];

function isBrowserApp(name: string): boolean {
  const n = name.toLowerCase();
  return BROWSER_KEYS.some((b) => n.includes(b));
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const h = new URL(url).hostname;
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return undefined;
  }
}

// ── Screen detection ─────────────────────────────────────────────────────────
function getScreenInfo(bounds?: { x: number; y: number; width: number; height: number }) {
  try {
    const displays = screen.getAllDisplays();
    const total = displays.length;
    if (!bounds || total === 0) return { screenIndex: 0, screenLabel: "Primary", totalScreens: total || 1 };
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const idx = displays.findIndex(({ bounds: b }) =>
      cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height
    );
    const i = idx >= 0 ? idx : 0;
    return {
      screenIndex: i,
      screenLabel: total > 1 ? `Screen ${i + 1} of ${total}` : "Primary",
      totalScreens: total,
    };
  } catch {
    return { screenIndex: 0, screenLabel: "Primary", totalScreens: 1 };
  }
}

// ── Change-detection tracker ─────────────────────────────────────────────────
// Polls every 1 second. When the active window changes, records the PREVIOUS
// window with its exact duration. This gives accurate per-app time — just like
// TimeChamp.

let lastApp = "";
let lastTitle = "";
let lastUrl: string | undefined;
let windowStartTime = new Date();

function buildEvent(
  app: string,
  title: string,
  url: string | undefined,
  durationSeconds: number,
  extra: object
) {
  const user = authStore.get("user") as any;
  const meta = getDeviceMeta();
  const domain = extractDomain(url);
  const isBrowser = isBrowserApp(app);

  return {
    eventId: crypto.randomUUID(),
    employeeId: user?.employeeId || "UNKNOWN_EMPLOYEE",
    companyId: user?.companyId || "prosync",
    deviceId: getDeviceId(),
    sessionId,
    type: "ACTIVE_WINDOW",
    source: "DESKTOP_AGENT",
    timestamp: new Date(Date.now() - durationSeconds * 1000).toISOString(), // start of segment
    metadata: {
      app,
      title,
      url,
      domain,
      isBrowser,
      durationSeconds, // ← accurate duration, not hardcoded 5
      ...extra,
      ...meta,
    },
  };
}

export const startTracking = () => {
  if (trackingInterval) return;
  console.log("[Tracker] Started (1s change-detection)");

  trackingInterval = setInterval(async () => {
    try {
      const result = await activeWindow();
      if (!result) return;

      const rawApp = result.owner.name;
      const app = normaliseName(rawApp);
      const title = result.title ?? "";
      const url: string | undefined = (result as any).url ?? undefined;
      const bounds = (result as any).bounds as
        | { x: number; y: number; width: number; height: number }
        | undefined;
      const { screenIndex, screenLabel, totalScreens } = getScreenInfo(bounds);

      // Update shared state for IPC (renderer polls this)
      trackingState.currentApp = app;
      trackingState.currentTitle = title;
      trackingState.currentUrl = url;
      trackingState.currentDomain = extractDomain(url);
      trackingState.isBrowser = isBrowserApp(app);
      trackingState.screenIndex = screenIndex;
      trackingState.screenLabel = screenLabel;
      trackingState.totalScreens = totalScreens;
      trackingState.windowBounds = bounds;
      trackingState.lastEventAt = new Date();

      const screenExtra = { screenIndex, screenLabel, totalScreens, windowBounds: bounds };

      // ── App changed → flush previous window segment ──────────────────────
      if (app !== lastApp || title !== lastTitle) {
        if (lastApp) {
          const duration = Math.max(
            1,
            Math.round((Date.now() - windowStartTime.getTime()) / 1000)
          );
          eventQueue.add(buildEvent(lastApp, lastTitle, lastUrl, duration, screenExtra));
          console.log(`[Tracker] Flushed "${lastApp}" (${duration}s)`);
        }
        lastApp = app;
        lastTitle = title;
        lastUrl = url;
        windowStartTime = new Date();
      } else {
        // Same window — update URL silently (browser navigation without title change)
        lastUrl = url ?? lastUrl;
      }
    } catch (err) {
      console.error("[Tracker] Error:", err);
    }
  }, 1000); // 1-second poll for accurate change detection
};

export const stopTracking = () => {
  // Flush current window before stopping
  if (lastApp) {
    const duration = Math.max(1, Math.round((Date.now() - windowStartTime.getTime()) / 1000));
    eventQueue.add(buildEvent(lastApp, lastTitle, lastUrl, duration, {}));
  }
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  console.log("[Tracker] Stopped");
};
