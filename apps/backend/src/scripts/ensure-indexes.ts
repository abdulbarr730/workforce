/**
 * Builds every index declared on the Mongoose schemas.
 *
 * Only creates missing indexes (Model.createIndexes). It never drops indexes
 * and never touches documents, so it is safe to run on production data.
 * Run once at a quiet time after deploying new schema indexes:
 *   pnpm --filter @workforce/backend ensure-indexes
 *
 * Runs against whatever MONGO_URI points at (production on the VPS).
 */
import mongoose from "mongoose";

import { env } from "../config/env";

import "./_all-models";

const ensureIndexes = async () => {
  await mongoose.connect(env.MONGO_URI);

  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    const startedAt = Date.now();
    await model.createIndexes();
    console.log(`[ensure-indexes] ${name}: ok (${Date.now() - startedAt} ms)`);
  }

  await mongoose.disconnect();
};

ensureIndexes().catch(async (error) => {
  console.error("[ensure-indexes] failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
