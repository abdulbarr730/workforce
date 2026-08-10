import app from "./app";

import { env } from "./config/env";

import { connectDatabase } from "./config/database";

import { logger } from "./shared/logger/logger";

import { seedDefaultShifts } from "./modules/attendance/services/seed-default-shifts.service";

import { startScreenshotCleanupJob } from "./modules/screenshots/screenshot.cleanup";
import { startNightlyAnalysisScheduler } from "./modules/daily-flow/services/eod-analysis-engine.service";
import { startWelcomeCallAllocationScheduler } from "./modules/welcome-calls/services/welcome-call-scheduler.service";

const startServer = async () => {
  await connectDatabase();

  // Start the background job for deleting 7-day old screenshots
  startScreenshotCleanupJob();

  // Start the background job for EOD & Daily Flow nightly analysis (8 PM - 12 AM)
  startNightlyAnalysisScheduler();

  // Accumulate webinar registrations and distribute at campaign-defined times.
  startWelcomeCallAllocationScheduler();

  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
  });
};

startServer();
