// Shared mutable state — updated by trackers, read by IPC handlers
export const trackingState = {
  currentApp: "",
  currentTitle: "",
  currentUrl: undefined as string | undefined,
  currentDomain: undefined as string | undefined,
  isBrowser: false,
  isIdle: false,
  screenIndex: 0,
  screenLabel: "Primary",
  totalScreens: 1,
  windowBounds: undefined as
    | { x: number; y: number; width: number; height: number }
    | undefined,
  lastEventAt: null as Date | null,
  currentAppStartedAt: null as Date | null,
  sessionStartAt: new Date(),
  sessionId: require("crypto").randomUUID(),
  idleTimeoutSecs: 300, // Default 5 minutes
  isTrackingPaused: false,
  // Custom Agent Schedule & Exemption
  enforceTrackingSchedule: false,
  trackingDays: [] as string[],
  trackingStartTime: "00:00",
  trackingEndTime: "23:59",
  isIdleExemptionEnabled: false,
  idleExemptionDays: [] as string[],
  idleExemptionStartTime: "00:00",
  idleExemptionEndTime: "23:59",
};
