import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { beforeAll, describe, expect, it } from "vitest";

import "../_all-models";
import { User } from "../../modules/users/model/user.model";
import { AttendanceRecord } from "../../modules/attendance/model/attendance-record.model";
import { DEFAULT_SEED_PASSWORD, collectionCounts, seedDevDataset } from "./dev-dataset";

// Collections the seed intentionally leaves empty. Anything else that is empty
// means a model was added without updating the seed (see docs/seed-data.md).
const INTENTIONALLY_EMPTY = new Set([
  "AppKnowledge", // filled by the Workforce Brain scheduler
  "WorkforceBrainMemory", // filled by the Workforce Brain scheduler
  "Screenshot", // needs Cloudinary
  "FailedEvent", // only rejected telemetry
  "AttendanceShortfallAdjustment", // admin-only action
]);

describe("seed:dev dataset", () => {
  let counts: Record<string, number>;

  beforeAll(async () => {
    for (const name of mongoose.modelNames()) await mongoose.model(name).createIndexes();
    // Fixed dates keep the test deterministic: a Wednesday, mid-afternoon IST.
    await seedDevDataset({ today: "2026-09-30", now: new Date("2026-09-30T15:00:00+05:30") });
    counts = await collectionCounts();
  }, 240_000);

  it("fills every collection except the documented exceptions", () => {
    const empty = Object.entries(counts)
      .filter(([name, count]) => count === 0 && !INTENTIONALLY_EMPTY.has(name))
      .map(([name]) => name);
    expect(empty).toEqual([]);
  });

  it("creates working logins for every role", async () => {
    const roles = await User.distinct("role");
    expect(roles.sort()).toEqual(["ADMIN", "EMPLOYEE", "HR", "MANAGER", "SUPER_ADMIN"]);
    const admin = await User.findOne({ email: "admin@dev.local" }).select("+password").lean();
    expect(await bcrypt.compare(DEFAULT_SEED_PASSWORD, admin!.password)).toBe(true);
  });

  it("derives a realistic spread of attendance statuses", async () => {
    const statuses = await AttendanceRecord.distinct("attendanceStatus");
    for (const status of ["PRESENT", "LATE", "LEAVE", "HOLIDAY"]) {
      expect(statuses).toContain(status);
    }
  });
});
