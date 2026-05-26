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
  windowBounds: undefined as { x: number; y: number; width: number; height: number } | undefined,
  lastEventAt: null as Date | null,
  sessionStartAt: new Date(),
};
