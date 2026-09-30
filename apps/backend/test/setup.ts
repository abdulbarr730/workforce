import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, inject } from "vitest";

// Must run before any app module reads config/env.ts. dotenv never overrides
// variables that are already set, so these win over apps/backend/.env.
const dbName = `test_${randomUUID().slice(0, 8)}`;
const baseUri = inject("mongoUri");
Object.assign(process.env, {
  NODE_ENV: "test",
  MONGO_URI: `${baseUri.replace(/\/$/, "")}/${dbName}`,
  JWT_SECRET: "test-jwt-secret",
  SKIP_LOGIN_ANNOUNCE: "1",
  CORS_ORIGINS: "",
  // Nothing under test may call a real external service.
  DISCORD_AUTH_WEBHOOK_URL: "",
  DISCORD_BREAK_WEBHOOK_URL: "",
  DISCORD_DAILY_FLOW_WEBHOOK_URL: "",
  TEAMS_BREAK_WEBHOOK_URL: "",
  CRM_API_KEY: "",
  CRM_WEBHOOK_URL: "",
  WELCOME_CALL_SHEET_WEBHOOK_URL: "",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
  ANTHROPIC_API_KEY: "",
  IDENTITY_FEDERATION_ENABLED: "",
  IDENTITY_FEDERATION_TOKEN_FILE: "",
  IDENTITY_FEDERATION_TOKEN: "",
});

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
});
