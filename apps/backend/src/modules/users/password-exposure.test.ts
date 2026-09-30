import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { clearDatabase, createUser, TEST_PASSWORD } from "../../../test/helpers";
import { UserRole } from "../../_shared/constants";
import app from "../../app";
import { User } from "./model/user.model";

// Password hashes must never leave the API, whichever endpoint returns a user.
const containsHash = (body: unknown) => JSON.stringify(body).includes('"password"');

describe("password hashes are never returned", () => {
  let adminToken: string;

  beforeEach(async () => {
    await clearDatabase();
    const admin = await createUser({ employeeId: "EMP_T_ADM", email: "admin@test.local", role: UserRole.ADMIN });
    adminToken = jwt.sign(
      { userId: String(admin._id), employeeId: admin.employeeId, name: admin.name, role: admin.role },
      process.env.JWT_SECRET!,
    );
  });

  it("POST /api/auth/login", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "admin@test.local", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("admin@test.local");
    expect(containsHash(res.body)).toBe(false);
  });

  it("GET /api/auth/me", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(containsHash(res.body)).toBe(false);
  });

  it("GET /api/users", async () => {
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(containsHash(res.body)).toBe(false);
  });

  it("POST /api/users", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "New Person", email: "new@test.local", password: "secret123", role: "EMPLOYEE" });
    expect(res.status).toBe(201);
    expect(containsHash(res.body)).toBe(false);
  });

  it("still stores the hash, and login still verifies it", async () => {
    const stored = await User.findOne({ email: "admin@test.local" }).select("+password").lean();
    expect(stored?.password).toMatch(/^\$2[aby]\$/);
    const wrong = await request(app).post("/api/auth/login").send({ email: "admin@test.local", password: "nope-nope" });
    expect(wrong.status).toBe(401);
  });

  it("hides the hash from plain queries and serialised documents", async () => {
    const plain = await User.findOne({ email: "admin@test.local" }).lean();
    expect(plain).not.toHaveProperty("password");
    const doc = await User.findOne({ email: "admin@test.local" }).select("+password");
    expect(doc!.toJSON()).not.toHaveProperty("password");
  });
});
