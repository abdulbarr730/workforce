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
    await mongoose.connect(env.MONGO_URI, {
      // Bound concurrent DB work so a slow Mongo fails fast instead of the API
      // queueing hundreds of operations and exhausting memory.
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
    isConnected = true;
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error(error as any, "MongoDB connection failed");
    // In serverless, we don't process.exit(1), just throw
    throw error;
  }
};
