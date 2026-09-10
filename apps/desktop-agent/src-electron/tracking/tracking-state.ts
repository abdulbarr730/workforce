// Shared mutable state — updated by trackers, read by IPC handlers
export const trackingState = {
  currentApp: "",
  currentTitle: "",
  currentUrl: undefined as string | undefined,
  currentDomain: undefined as string | undefined,
  isBrowser: false,
  isIdle: false,
  isOnBreak: false,
  activeBreakStartedAt: null as Date | null,
  activeBreakEndsAt: null as Date | null,
  activeBreakScheduleId: null as string | null,
  activeBreakMessage: "",
  activeBreakReasonOptions: [] as string[],
  activeBreakRequireReason: false,
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
  idleTimeoutSecs: 600, // Default 10 minutes
  isTrackingPaused: false,
  awaitingPresenceProof: true,
  lastPresenceProofDate: "",
  serverClockOffsetMs: 0,
  serverClockCalibrated: false,
  // Custom Agent Schedule & Exemption
  enforceTrackingSchedule: false,
  trackingDays: [] as string[],
  trackingStartTime: "00:00",
  trackingEndTime: "23:59",
  trackingDaySchedules: [] as {
    day: string;
    enabled: boolean;
    startTime: string;
    endTime: string;
  }[],
  isIdleExemptionEnabled: false,
  idleExemptionDays: [] as string[],
  idleExemptionStartTime: "00:00",
  idleExemptionEndTime: "23:59",
  idleExemptionDaySchedules: [] as {
    day: string;
    enabled: boolean;
    startTime: string;
    endTime: string;
  }[],
};
