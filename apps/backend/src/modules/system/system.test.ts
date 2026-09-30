import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { clearDatabase, createUser } from "../../../test/helpers";
import { UserRole } from "../../_shared/constants";
import app from "../../app";
import { estimateCostUsd, recordAiUsage } from "./services/ai-usage.service";

const tokenFor = (user: any) =>
  jwt.sign(
    { userId: String(user._id), employeeId: user.employeeId, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
  );

describe("admin controls overview", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("estimates AI cost from tokens", () => {
    expect(estimateCostUsd("claude-sonnet-x", 1_000_000, 0)).toBeCloseTo(3);
    expect(estimateCostUsd("claude-haiku-x", 0, 1_000_000)).toBeCloseTo(5);
  });

  it("admins see server, database, email and AI numbers; employees don't", async () => {
    const admin = await createUser({ employeeId: "EMP_T_ADM", email: "admin@test.local", role: UserRole.ADMIN });
    const employee = await createUser({ employeeId: "EMP_T_E1", email: "e1@test.local" });
    await recordAiUsage({ feature: "eod-suggestion", model: "claude-sonnet-x", inputTokens: 2000, outputTokens: 500 });

    const res = await request(app)
      .get("/api/system/overview?fresh=1")
      .set("Authorization", `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.server.cpuCount).toBeGreaterThan(0);
    expect(Array.isArray(data.database.collections)).toBe(true);
    expect(data.ai.allTime.calls).toBe(1);
    expect(data.ai.byFeature[0].feature).toBe("eod-suggestion");
    expect(data.email.configured).toBe(false);

    const denied = await request(app)
      .get("/api/system/overview")
      .set("Authorization", `Bearer ${tokenFor(employee)}`);
    expect(denied.status).toBe(403);
  });
});
