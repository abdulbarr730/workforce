import app from "./app";

import { env } from "./config/env";

import { connectDatabase } from "./config/database";

import { logger } from "./shared/logger/logger";

import { assertLocalDatabase } from "./scripts/_guards";

import { startScreenshotCleanupJob } from "./modules/screenshots/screenshot.cleanup";
import { startNightlyAnalysisScheduler } from "./modules/daily-flow/services/eod-analysis-engine.service";
import { startWelcomeCallAllocationScheduler } from "./modules/welcome-calls/services/welcome-call-scheduler.service";
import { startWorkforceBrainScheduler } from "./modules/workforce-brain/services/workforce-brain-scheduler.service";
import { startOpenAttendanceSweeper } from "./modules/attendance/services/open-attendance-sweeper.service";
import { startLeaveBalanceSnapshotJob } from "./modules/attendance/services/leave-policy.service";

const startServer = async () => {
  // `pnpm dev` sets DEV_DB_GUARD=1 so a dev server can never boot against a
  // remote (production) database. Production runs dist/server.js without it.
  if (process.env.DEV_DB_GUARD === "1") {
    assertLocalDatabase(env.MONGO_URI, { allowOverride: true, context: "dev-server" });
  }

  await connectDatabase();

  // Start the background job for deleting 7-day old screenshots
  startScreenshotCleanupJob();

  // Start the background job for EOD & Daily Flow nightly analysis (8 PM - 12 AM)
  startNightlyAnalysisScheduler();

  // Accumulate webinar registrations and distribute at campaign-defined times.
  startWelcomeCallAllocationScheduler();

  // Start the 15-day Workforce Brain periodic memory revision scheduler
  startWorkforceBrainScheduler();

  // Close attendance days left without a logout (agent off / next-day start)
  // at the laptop's last real activity.
  startOpenAttendanceSweeper();
  startLeaveBalanceSnapshotJob();

  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
  });
};

startServer();
