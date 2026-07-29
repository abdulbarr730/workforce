import { ActivityEvent } from "../model/activity-event.model";

// Runs every 24 hours
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const startActivityEventsCleanupJob = () => {
  console.log(
    "[Cleanup] Activity Events cleanup job initialized. Running every 24 hours."
  );

  setInterval(async () => {
    try {
      console.log("[Cleanup] Running daily activity events cleanup...");

      // Find events older than 7 days
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - 7);

      const result = await ActivityEvent.deleteMany({
        timestamp: { $lt: daysAgo }
      });

      console.log(
        `[Cleanup] Successfully deleted ${result.deletedCount} old activity events.`
      );
    } catch (error) {
      console.error("[Cleanup] Error running activity events cleanup job:", error);
    }
  }, CLEANUP_INTERVAL_MS);
};
