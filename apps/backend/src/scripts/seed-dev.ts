/**
 * Resets the LOCAL development database and fills it with realistic data.
 *
 *   pnpm seed:dev                 drop the dev DB and reseed
 *   pnpm seed:dev -- --if-empty   seed only when there are no users yet
 *
 * Refuses to run unless MONGO_URI is a local database (see _guards.ts);
 * ALLOW_REMOTE_DB is deliberately ignored here. Password for every seeded
 * account: SEED_PASSWORD or DEFAULT_SEED_PASSWORD (dev-only).
 */
import mongoose from "mongoose";

import { env } from "../config/env";
import { assertLocalDatabase } from "./_guards";
import "./_all-models";
import { User } from "../modules/users/model/user.model";
import { collectionCounts, seedDevDataset } from "./seed/dev-dataset";

// Nothing seeded may reach Discord/Teams/CRM/Sheets, even if a dev .env has
// real webhook URLs in it.
for (const key of [
  "DISCORD_AUTH_WEBHOOK_URL",
  "DISCORD_BREAK_WEBHOOK_URL",
  "DISCORD_DAILY_FLOW_WEBHOOK_URL",
  "TEAMS_BREAK_WEBHOOK_URL",
  "CRM_WEBHOOK_URL",
  "WELCOME_CALL_SHEET_WEBHOOK_URL",
]) {
  (env as Record<string, unknown>)[key] = "";
}
process.env.SKIP_LOGIN_ANNOUNCE = "1";

const run = async () => {
  assertLocalDatabase(env.MONGO_URI, { allowOverride: false, context: "seed:dev" });
  const ifEmpty = process.argv.includes("--if-empty");
  const startedAt = Date.now();

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5_000 });
  const dbName = mongoose.connection.db?.databaseName;

  if (ifEmpty && (await User.estimatedDocumentCount()) > 0) {
    console.log(`[seed:dev] ${dbName} already has data; skipping (--if-empty).`);
    await mongoose.disconnect();
    return;
  }

  console.log(`[seed:dev] resetting ${dbName}`);
  await mongoose.connection.dropDatabase();
  for (const name of mongoose.modelNames()) {
    await mongoose.model(name).createIndexes();
  }

  const result = await seedDevDataset({
    password: process.env.SEED_PASSWORD || undefined,
    log: (step) => console.log(`[seed:dev] ${step}`),
  });

  const counts = await collectionCounts();
  console.log(`\n[seed:dev] done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${result.firstDay} → ${result.today})`);
  console.table(counts);
  console.log(`Logins (password for all: ${result.password})`);
  console.table(result.users);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("[seed:dev] failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
