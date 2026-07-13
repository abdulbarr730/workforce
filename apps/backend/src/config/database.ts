import mongoose from "mongoose";

import { env } from "./env";

import { logger } from "../shared/logger/logger";

let isConnected = false;

export const connectDatabase = async () => {
  if (isConnected || mongoose.connection.readyState >= 1) {
    logger.info("MongoDB already connected (cached)");
    return;
  }

  try {
    await mongoose.connect(env.MONGO_URI);
    isConnected = true;
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error(error as any, "MongoDB connection failed");
    // In serverless, we don't process.exit(1), just throw
    throw error;
  }
};
