import app from "./app";

import { env } from "./config/env";

import { connectDatabase } from "./config/database";

import { logger } from "./shared/logger/logger";

import { seedDefaultShifts } from "./modules/attendance/services/seed-default-shifts.service";



const startServer = async () => {
  await connectDatabase();

  app.listen(env.PORT, () => {
    logger.info(
      `Server running on port ${env.PORT}`
    );
  });
};

startServer();