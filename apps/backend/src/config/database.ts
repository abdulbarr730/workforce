import mongoose from "mongoose";

import { env } from "./env";

import { logger } from "../shared/logger/logger";

export const connectDatabase = async () => {
  try {
    await mongoose.connect(env.MONGO_URI);

    logger.info("MongoDB connected");
  } catch (error) {
    logger.error(error);

    process.exit(1);
  }
};