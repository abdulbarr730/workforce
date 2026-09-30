import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { clearDatabase, createUser, TEST_PASSWORD } from "../test/helpers";
import { UserRole } from "./_shared/constants";
import app from "./app";

describe("HTTP API smoke tests", () => {
  beforeEach(clearDatabase);

  it("GET /health responds", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  describe("POST /api/auth/login", () => {
    it("returns a JWT carrying the user's identity and role", async () => {
      await createUser({ employeeId: "EMP_T_10", email: "login@test.local", role: UserRole.MANAGER });
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "login@test.local", password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      const claims = jwt.verify(res.body.data.token, process.env.JWT_SECRET!) as Record<string, unknown>;
      expect(claims).toMatchObject({ employeeId: "EMP_T_10", role: "MANAGER" });
    });

    it("rejects a wrong password with 401", async () => {
      await createUser({ email: "login@test.local" });
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "login@test.local", password: "wrong-password" });
      expect(res.status).toBe(401);
    });

    it("rejects an unknown email with 401", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@test.local", password: TEST_PASSWORD });
      expect(res.status).toBe(401);
    });
  });

  describe("role-protected routes (GET /api/users)", () => {
    const tokenFor = (role: UserRole) =>
      jwt.sign({ userId: "u1", employeeId: "EMP_T_20", name: "T", role }, process.env.JWT_SECRET!);

    it("requires a token", async () => {
      expect((await request(app).get("/api/users")).status).toBe(401);
    });

    it("rejects a token signed with another secret", async () => {
      const forged = jwt.sign({ role: "SUPER_ADMIN" }, "not-the-secret");
      const res = await request(app).get("/api/users").set("Authorization", `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it("forbids employees", async () => {
      const res = await request(app).get("/api/users").set("Authorization", `Bearer ${tokenFor(UserRole.EMPLOYEE)}`);
      expect(res.status).toBe(403);
    });

    it("allows admins", async () => {
      const res = await request(app).get("/api/users").set("Authorization", `Bearer ${tokenFor(UserRole.ADMIN)}`);
      expect(res.status).toBe(200);
    });
  });
});
