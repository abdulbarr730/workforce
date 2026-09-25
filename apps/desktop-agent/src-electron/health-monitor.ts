import { app, powerMonitor, type MessageBoxOptions } from "electron";
import { execFile } from "child_process";
import os from "os";
import { DeviceErrorLogger } from "./tracking/device-error.logger";
import { authStore } from "./store/auth.store";

/**
 * Watches for the conditions that make tracking and reminders unreliable on
 * long-running machines and asks the employee to restart:
 *  - the computer has been on for several days (sleep does not reset this);
 *  - the agent keeps freezing (event-loop stalls) or its memory keeps growing.
 */
const LONG_UPTIME_HOURS = 72;
const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_AFTER_MS = 3 * 60 * 1000;
const ASK_AGAIN_AFTER_MS = 4 * 60 * 60 * 1000;
const STALL_THRESHOLD_MS = 2_000;
const STALLS_BEFORE_UNHEALTHY = 3;
const STALL_WINDOW_MS = 10 * 60 * 1000;
const AGENT_MEMORY_LIMIT_MB = 1_200;

type HealthMonitorDeps = {
  showDialog: (
    options: MessageBoxOptions,
  ) => Promise<{ response: number; checkboxChecked?: boolean }>;
  allowQuit: () => void;
};

let started = false;
let lastAskedAt = 0;
let dialogOpen = false;
const recentStalls: number[] = [];

const uptimeHours = () => os.uptime() / 3600;

const agentMemoryMb = () =>
  app
    .getAppMetrics()
    .reduce(
      (total, metric) => total + (metric.memory?.workingSetSize || 0),
      0,
    ) / 1024;

const watchEventLoop = () => {
  const tickMs = 5_000;
  let expected = Date.now() + tickMs;
  let lastResumeAt = 0;
  powerMonitor.on("resume", () => {
    lastResumeAt = Date.now();
  });
  setInterval(() => {
    const now = Date.now();
    const lag = now - expected;
    expected = now + tickMs;
    // Sleep also delays timers; only count stalls while the machine is awake.
    if (lag > STALL_THRESHOLD_MS && lag < 60_000 && now - lastResumeAt > 60_000) {
      recentStalls.push(now);
    }
    while (recentStalls.length && now - recentStalls[0] > STALL_WINDOW_MS) {
      recentStalls.shift();
    }
  }, tickMs).unref();
};

const restartComputer = () => {
  if (process.platform === "win32") {
    execFile("shutdown", [
      "/r",
      "/t",
      "60",
      "/c",
      "Workforce Agent: restarting in 1 minute to keep tracking reliable. Save your work.",
    ]);
  } else if (process.platform === "darwin") {
    execFile("osascript", ["-e", 'tell application "System Events" to restart']);
  }
};

const restartAgent = () => {
  app.relaunch();
  app.exit(0);
};

const check = async (deps: HealthMonitorDeps) => {
  if (dialogOpen || !authStore.get("token")) return;
  if (Date.now() - lastAskedAt < ASK_AGAIN_AFTER_MS) return;
  try {
    if (powerMonitor.getSystemIdleState(1) === "locked") return;
  } catch {
    // ignore
  }

  const hoursOn = uptimeHours();
  const longUptime = hoursOn >= LONG_UPTIME_HOURS;
  const memoryMb = agentMemoryMb();
  const agentUnhealthy =
    recentStalls.length >= STALLS_BEFORE_UNHEALTHY ||
    memoryMb >= AGENT_MEMORY_LIMIT_MB;

  if (!longUptime && !agentUnhealthy) return;

  lastAskedAt = Date.now();
  const days = Math.floor(hoursOn / 24);
  const details = {
    uptimeHours: Math.round(hoursOn),
    agentMemoryMb: Math.round(memoryMb),
    recentStalls: recentStalls.length,
  };

  dialogOpen = true;
  try {
    if (longUptime) {
      void DeviceErrorLogger.logEvent(
        "restart_recommended",
        `Computer on for ${days} days; asked employee to restart.`,
        details,
      );
      const { response } = await deps.showDialog({
        type: "warning",
        title: "Please restart your computer",
        message: `Your computer has been on for ${days} days without a restart.`,
        detail:
          "Long-running computers can stop showing reminders and tracking time correctly. Save your work, then restart to keep everything working smoothly.",
        buttons: ["Restart now", "Remind me later"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) {
        void DeviceErrorLogger.logEvent(
          "restart_accepted",
          "Employee chose to restart the computer.",
          details,
        );
        deps.allowQuit();
        restartComputer();
      }
      return;
    }

    void DeviceErrorLogger.logEvent(
      "agent_restart_recommended",
      "Agent is running slowly; asked employee to restart it.",
      details,
    );
    const { response } = await deps.showDialog({
      type: "warning",
      title: "Workforce Agent needs a restart",
      message: "Workforce Agent is running slowly.",
      detail:
        "Restarting the agent takes a few seconds and keeps reminders and time tracking reliable. Your tracked time is saved.",
      buttons: ["Restart agent", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) {
      void DeviceErrorLogger.logEvent(
        "agent_restart_accepted",
        "Employee restarted the agent.",
        details,
      );
      restartAgent();
    }
  } catch (error) {
    console.error("[Health] Restart prompt failed:", error);
  } finally {
    dialogOpen = false;
  }
};

export const startHealthMonitor = (deps: HealthMonitorDeps) => {
  if (started) return;
  started = true;
  watchEventLoop();
  setTimeout(() => void check(deps), FIRST_CHECK_AFTER_MS).unref();
  setInterval(() => void check(deps), CHECK_EVERY_MS).unref();
};
