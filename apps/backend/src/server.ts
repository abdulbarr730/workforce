import app from "./app";

import { env } from "./config/env";

import { connectDatabase } from "./config/database";

import { logger } from "./shared/logger/logger";

import { seedDefaultShifts } from "./modules/attendance/services/seed-default-shifts.service";

import { startScreenshotCleanupJob } from "./modules/screenshots/screenshot.cleanup";

const startServer = async () => {
  await connectDatabase();

  // Start the background job for deleting 7-day old screenshots
  startScreenshotCleanupJob();

  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
  });
};

startServer();
