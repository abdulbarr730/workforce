import { screen } from "electron";
import { activeWindow } from "active-win";
import crypto from "crypto";
import { eventQueue } from "./event.queue";
import { authStore } from "../store/auth.store";
import { getDeviceId, getDeviceMeta } from "./device-info";
import { sessionId } from "./session.manager";
import { trackingState } from "./tracking-state";

let trackingInterval: NodeJS.Timeout | null = null;

const BROWSERS = [
  "chrome", "chromium", "google chrome", "firefox", "mozilla firefox",
  "safari", "edge", "msedge", "microsoft edge", "brave", "arc",
  "opera", "vivaldi", "tor browser", "waterfox",
];

function isBrowserApp(appName: string): boolean {
  const n = appName.toLowerCase();
  return BROWSERS.some((b) => n.includes(b));
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

function getScreenInfo(
  bounds?: { x: number; y: number; width: number; height: number }
): { screenIndex: number; screenLabel: string; totalScreens: number } {
  try {
    const displays = screen.getAllDisplays();
    const total = displays.length;
    if (!bounds || total === 0) return { screenIndex: 0, screenLabel: "Primary", totalScreens: total };

    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const idx = displays.findIndex(({ bounds: b }) =>
      cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height
    );
    const i = idx >= 0 ? idx : 0;
    const label = total > 1 ? `Screen ${i + 1} of ${total}` : "Primary";
    return { screenIndex: i, screenLabel: label, totalScreens: total };
  } catch {
    return { screenIndex: 0, screenLabel: "Primary", totalScreens: 1 };
  }
}

export const startTracking = () => {
  if (trackingInterval) return;
  console.log("[Tracker] Started (5s interval)");

  trackingInterval = setInterval(async () => {
    try {
      const result = await activeWindow();
      if (!result) return;

      const user = authStore.get("user") as any;
      const meta = getDeviceMeta();

      const url: string | undefined = (result as any).url ?? undefined;
      const domain = extractDomain(url);
      const isBrowser = isBrowserApp(result.owner.name);
      const bounds = (result as any).bounds as
        | { x: number; y: number; width: number; height: number }
        | undefined;
      const { screenIndex, screenLabel, totalScreens } = getScreenInfo(bounds);

      // Keep shared state fresh — DashboardPage polls this via IPC
      trackingState.currentApp = result.owner.name;
      trackingState.currentTitle = result.title;
      trackingState.currentUrl = url;
      trackingState.currentDomain = domain;
      trackingState.isBrowser = isBrowser;
      trackingState.screenIndex = screenIndex;
      trackingState.screenLabel = screenLabel;
      trackingState.totalScreens = totalScreens;
      trackingState.windowBounds = bounds;
      trackingState.lastEventAt = new Date();

      eventQueue.add({
        eventId: crypto.randomUUID(),
        employeeId: user?.employeeId || "UNKNOWN_EMPLOYEE",
        companyId: user?.companyId || "prosync",
        deviceId: getDeviceId(),
        sessionId,
        type: "ACTIVE_WINDOW",
        source: "DESKTOP_AGENT",
        timestamp: new Date().toISOString(),
        metadata: {
          app: result.owner.name,
          title: result.title,
          processName: (result.owner as any).processName ?? result.owner.name,
          pid: result.owner.processId,
          url,
          domain,
          isBrowser,
          screenIndex,
          screenLabel,
          totalScreens,
          windowBounds: bounds,
          ...meta,
        },
      });
    } catch (err) {
      console.error("[Tracker] Error:", err);
    }
  }, 5000);
};

export const stopTracking = () => {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  console.log("[Tracker] Stopped");
};
