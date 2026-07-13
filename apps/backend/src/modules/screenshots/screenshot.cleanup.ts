import { Screenshot } from "./screenshot.model";
import { cloudinary } from "../../config/cloudinary";

// Runs every 24 hours
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const startScreenshotCleanupJob = () => {
  console.log(
    "[Cleanup] Screenshot cleanup job initialized. Running every 24 hours.",
  );

  setInterval(async () => {
    try {
      console.log("[Cleanup] Running daily screenshot cleanup...");

      // Calculate date 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Find all screenshots older than 7 days
      const oldScreenshots = await Screenshot.find({
        capturedAt: { $lt: sevenDaysAgo },
      });

      if (oldScreenshots.length === 0) {
        console.log("[Cleanup] No old screenshots to delete.");
        return;
      }

      console.log(
        `[Cleanup] Found ${oldScreenshots.length} screenshots older than 7 days.`,
      );

      let deletedCount = 0;

      for (const screenshot of oldScreenshots) {
        try {
          // Extract Cloudinary public_id from URL
          // Example URL: https://res.cloudinary.com/dnxzz0nxa/image/upload/v1723456/prosync_screenshots/abcdef123.png
          const urlParts = screenshot.imageUrl.split("/");
          const filenameWithExt = urlParts[urlParts.length - 1];
          const folder = urlParts[urlParts.length - 2];

          if (filenameWithExt && folder) {
            const filename = filenameWithExt.split(".")[0];
            const publicId = `${folder}/${filename}`;

            // Delete from Cloudinary
            await cloudinary.uploader.destroy(publicId);
          }

          // Delete from MongoDB
          await Screenshot.findByIdAndDelete(screenshot._id);
          deletedCount++;
        } catch (err) {
          console.error(
            `[Cleanup] Failed to delete screenshot ${screenshot._id}:`,
            err,
          );
        }
      }

      console.log(
        `[Cleanup] Successfully deleted ${deletedCount} old screenshots.`,
      );
    } catch (error) {
      console.error("[Cleanup] Error running screenshot cleanup job:", error);
    }
  }, CLEANUP_INTERVAL_MS);
};
