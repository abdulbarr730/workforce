import { trackingState } from "./tracking-state";
import { startTracking, stopTracking } from "./activity.tracker";
import {
  startScreenshotTracker,
  stopScreenshotTracker,
} from "./screenshot.tracker";

let timer: NodeJS.Timeout | null = null;
let isCurrentlyAllowed = true;

// Utility to check if current time is within schedule
function isWithinSchedule(): boolean {
  if (!trackingState.enforceTrackingSchedule) return true;

  const now = new Date();
  const todayName = now.toLocaleDateString("en-US", { weekday: "long" }); // "Monday"
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 1. If fine-grained daily schedules are configured, check specific day
  if (
    trackingState.trackingDaySchedules &&
    trackingState.trackingDaySchedules.length > 0
  ) {
    const dayConfig = trackingState.trackingDaySchedules.find(
      (d) => d.day.toLowerCase() === todayName.toLowerCase(),
    );
    if (!dayConfig || !dayConfig.enabled) {
      return false;
    }

    const [startH, startM] = (dayConfig.startTime || "00:00")
      .split(":")
      .map(Number);
    const [endH, endM] = (dayConfig.endTime || "23:59")
      .split(":")
      .map(Number);

    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // 2. Fallback to legacy trackingDays and trackingStartTime/trackingEndTime
  if (!trackingState.trackingDays.includes(todayName)) {
    return false;
  }

  const [startH, startM] = trackingState.trackingStartTime
    .split(":")
    .map(Number);
  const [endH, endM] = trackingState.trackingEndTime.split(":").map(Number);

  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function checkSchedule() {
  const allowedNow = isWithinSchedule();

  if (!allowedNow && isCurrentlyAllowed) {
    console.log("[Scheduler] Exited working hours. Pausing tracking.");
    isCurrentlyAllowed = false;
    trackingState.isTrackingPaused = true;
    stopTracking();
    stopScreenshotTracker();

    // Notify UI
    import("electron").then(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send("tracking:schedule-paused"),
      );
    });
  } else if (allowedNow && !isCurrentlyAllowed) {
    console.log("[Scheduler] Entered working hours. Resuming tracking.");
    isCurrentlyAllowed = true;
    trackingState.isTrackingPaused = false;
    startTracking();
    startScreenshotTracker();

    // Notify UI
    import("electron").then(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send("tracking:schedule-resumed"),
      );
    });
  }
}

export function startTrackingScheduler() {
  if (timer) return;
  // Initialize current allowed state correctly on start
  isCurrentlyAllowed = isWithinSchedule();

  if (!isCurrentlyAllowed) {
    console.log("[Scheduler] Started outside working hours. Pausing tracking.");
    trackingState.isTrackingPaused = true;
    stopTracking();
    stopScreenshotTracker();
  }

  timer = setInterval(checkSchedule, 30_000); // Check every 30 seconds
}

export function stopTrackingScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
