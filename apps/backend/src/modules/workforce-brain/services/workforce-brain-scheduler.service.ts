import { checkAndRunPeriodicMemoryRevision } from "./workforce-brain.service";

let schedulerInterval: NodeJS.Timeout | null = null;

export const startWorkforceBrainScheduler = () => {
  if (schedulerInterval) return;

  // Run initial check 1 minute after server boot
  setTimeout(() => {
    checkAndRunPeriodicMemoryRevision().catch((err) =>
      console.error("[Workforce Brain Scheduler] Initial revision error:", err),
    );
  }, 60_000);

  // Interval check every 12 hours (43,200,000 ms)
  schedulerInterval = setInterval(
    () => {
      checkAndRunPeriodicMemoryRevision().catch((err) =>
        console.error("[Workforce Brain Scheduler] Periodic revision error:", err),
      );
    },
    12 * 60 * 60 * 1000,
  );

  console.log("[Workforce Brain Scheduler] 15-Day Memory Revision Scheduler initialized.");
};

export const stopWorkforceBrainScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};
