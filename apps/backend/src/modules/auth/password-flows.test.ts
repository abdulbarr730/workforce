import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearDatabase, createUser, TEST_PASSWORD } from "../../../test/helpers";
import { UserRole } from "../../_shared/constants";
import app from "../../app";
import { env } from "../../config/env";
import { User } from "../users/model/user.model";
import { hashResetToken } from "../users/controllers/admin-password.controller";
import { EmailLog } from "../notifications/model/email-log.model";
import { sendPasswordReminders } from "../users/services/password-reminder.job";

const tokenFor = (user: any) =>
  jwt.sign(
    { userId: String(user._id), employeeId: user.employeeId, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
  );

const login = (email: string, password: string) =>
  request(app).post("/api/auth/login").send({ email, password });

describe("one-time passwords, admin passwords, reset links", () => {
  let admin: any;
  let adminToken: string;
  let employee: any;

  beforeEach(async () => {
    await clearDatabase();
    admin = await createUser({ employeeId: "EMP_T_ADM", email: "admin@test.local", role: UserRole.ADMIN });
    adminToken = tokenFor(admin);
    employee = await createUser({ employeeId: "EMP_T_E1", email: "e1@test.local" });
  });

  it("a one-time password only allows setting your own password, then works normally", async () => {
    const set = await request(app)
      .post(`/api/users/${employee._id}/set-password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "OneTime123", requireChange: true });
    expect(set.status).toBe(200);

    const first = await login("e1@test.local", "OneTime123");
    expect(first.status).toBe(200);
    expect(first.body.data.mustChangePassword).toBe(true);
    const oneTimeToken = first.body.data.token;

    const blocked = await request(app).get("/api/users").set("Authorization", `Bearer ${oneTimeToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const changed = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${oneTimeToken}`)
      .send({ newPassword: "MyOwnPass9" });
    expect(changed.status).toBe(200);

    // The same one-time session (e.g. the other app) is now refused.
    const stale = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${oneTimeToken}`);
    expect(stale.status).toBe(401);

    expect((await login("e1@test.local", "OneTime123")).status).toBe(401);
    const again = await login("e1@test.local", "MyOwnPass9");
    expect(again.status).toBe(200);
    expect(again.body.data.mustChangePassword).toBe(false);
  });

  it("an admin can set a permanent password that is not asked to be changed", async () => {
    const set = await request(app)
      .post(`/api/users/${employee._id}/set-password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "Permanent42", requireChange: false });
    expect(set.status).toBe(200);
    const res = await login("e1@test.local", "Permanent42");
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(false);
  });

  it("an expired one-time password can't sign in", async () => {
    await User.updateOne(
      { _id: employee._id },
      { $set: { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() - 1000) } },
    );
    const res = await login("e1@test.local", TEST_PASSWORD);
    expect(res.status).toBe(401);
  });

  it("an admin can't change a protected account", async () => {
    const owner = await createUser({ employeeId: "EMP_T_SA", email: "sa@test.local", role: UserRole.SUPER_ADMIN });
    const res = await request(app)
      .post(`/api/users/${owner._id}/set-password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "Whatever12", requireChange: false });
    expect(res.status).toBe(403);
  });

  it("a reset link works once", async () => {
    const res = await request(app)
      .post(`/api/users/${employee._id}/send-reset-link`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Only the hash is stored; plant a known token to use the link.
    await User.updateOne({ _id: employee._id }, { $set: { passwordResetTokenHash: hashResetToken("known-token") } });
    // The current password keeps working until the link is used.
    expect((await login("e1@test.local", TEST_PASSWORD)).status).toBe(200);

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "known-token", newPassword: "FromLink77" });
    expect(reset.status).toBe(200);
    expect((await login("e1@test.local", "FromLink77")).status).toBe(200);

    const reuse = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "known-token", newPassword: "Another77x" });
    expect(reuse.status).toBe(400);
  });

  it("rejects weak passwords", async () => {
    const res = await request(app)
      .post(`/api/users/${employee._id}/set-password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("24-hour reminder", () => {
  const saved = { token: env.ZEPTOMAIL_TOKEN, from: env.MAIL_FROM_ADDRESS };
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    await clearDatabase();
    env.ZEPTOMAIL_TOKEN = "test-token";
    env.MAIL_FROM_ADDRESS = "noreply@test.local";
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
  });
  afterEach(() => {
    env.ZEPTOMAIL_TOKEN = saved.token;
    env.MAIL_FROM_ADDRESS = saved.from;
    globalThis.fetch = realFetch;
  });

  it("sends exactly one reminder when less than 24 hours are left", async () => {
    const soon = await createUser({ employeeId: "EMP_T_R1", email: "r1@test.local" });
    const later = await createUser({ employeeId: "EMP_T_R2", email: "r2@test.local" });
    await User.updateOne(
      { _id: soon._id },
      { $set: { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + 5 * 3600_000) } },
    );
    await User.updateOne(
      { _id: later._id },
      { $set: { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + 3 * 24 * 3600_000) } },
    );

    await sendPasswordReminders();
    await sendPasswordReminders();

    const logs = await EmailLog.find({ category: "PASSWORD_REMINDER" }).lean();
    expect(logs.map((l: any) => l.to)).toEqual(["r1@test.local"]);
  });
});

describe("CRM sign-in check", () => {
  const savedKey = env.CRM_API_KEY;
  beforeEach(async () => {
    await clearDatabase();
    env.CRM_API_KEY = "crm-key";
    await createUser({ employeeId: "EMP_T_C1", email: "c1@test.local" });
  });
  afterEach(() => {
    env.CRM_API_KEY = savedKey;
  });

  it("accepts the Workforce password with the CRM key only", async () => {
    const ok = await request(app)
      .post("/api/crm/auth/verify")
      .set("X-API-KEY", "crm-key")
      .send({ email: "C1@test.local", password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.employee.employeeId).toBe("EMP_T_C1");
    expect(JSON.stringify(ok.body)).not.toContain('"password"');

    const wrong = await request(app)
      .post("/api/crm/auth/verify")
      .set("X-API-KEY", "crm-key")
      .send({ email: "c1@test.local", password: "nope" });
    expect(wrong.status).toBe(401);

    const noKey = await request(app)
      .post("/api/crm/auth/verify")
      .send({ email: "c1@test.local", password: TEST_PASSWORD });
    expect(noKey.status).toBe(401);
  });
});
