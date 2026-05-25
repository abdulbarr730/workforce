import mongoose from "mongoose";
import app from "../src/app";
import { env } from "../src/config/env";

let cached: Promise<typeof mongoose> | null = null;

const connect = () => {
  if (!cached) {
    cached = mongoose.connect(env.MONGO_URI).catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
};

export default async function handler(req: any, res: any) {
  try {
    await connect();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: err?.message ?? String(err),
    });
    return;
  }
  return (app as any)(req, res);
}
