import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { clearDatabase, createUser, TEST_PASSWORD } from "../../../test/helpers";
import { UserRole } from "../../_shared/constants";
import app from "../../app";
import { clearUserRoleCache } from "../../shared/middlwares/auth.middleware";
import { clearRoleCache } from "./services/access.service";
import { LeaveRequest } from "../attendance/model/leave-request.model";

const tokenFor = (user: any) =>
  jwt.sign(
    { userId: String(user._id), employeeId: user.employeeId, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
  );

describe("roles and page permissions", () => {
  let owner: any;
  let ownerToken: string;
  let admin: any;
  let adminToken: string;

  beforeEach(async () => {
    await clearDatabase();
    clearRoleCache();
    clearUserRoleCache();
    owner = await createUser({ employeeId: "EMP_T_SA", email: "sa@test.local", role: UserRole.SUPER_ADMIN });
    ownerToken = tokenFor(owner);
    admin = await createUser({ employeeId: "EMP_T_ADM", email: "admin@test.local", role: UserRole.ADMIN });
    adminToken = tokenFor(admin);
  });

  const createCeoRole = (permissions: string[]) =>
    request(app)
      .post("/api/access/roles")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "CEO", baseRole: "ADMIN", adminPortal: true, fullAccess: false, permissions });

  it("only the Super Admin creates roles", async () => {
    const denied = await request(app)
      .post("/api/access/roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "CEO", baseRole: "ADMIN" });
    expect(denied.status).toBe(403);
    const ok = await createCeoRole(["attendance.view"]);
    expect(ok.status).toBe(201);
    expect(ok.body.data.key).toBe("CEO");
  });

  it("a custom role acts as its base role but only does what it's allowed", async () => {
    await createCeoRole(["attendance.view", "requests.decide"]);
    const ceo = await createUser({ employeeId: "EMP_T_CEO", email: "ceo@test.local", role: "CEO" as UserRole });
    const ceoToken = tokenFor(ceo);

    // Reads that need Admin work (acts as Admin).
    const list = await request(app).get("/api/users").set("Authorization", `Bearer ${ceoToken}`);
    expect(list.status).toBe(200);

    // Actions outside the role are refused.
    const create = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${ceoToken}`)
      .send({ name: "X", email: "x@test.local", password: "secret123", role: "EMPLOYEE" });
    expect(create.status).toBe(403);
    const edit = await request(app)
      .put("/api/attendance/records/anything")
      .set("Authorization", `Bearer ${ceoToken}`)
      .send({});
    expect(edit.status).toBe(403);

    // Sign-in tells the dashboard what to show.
    const login = await request(app).post("/api/auth/login").send({ email: "ceo@test.local", password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.access.adminPortal).toBe(true);
    expect(login.body.data.access.permissions).toEqual(expect.arrayContaining(["attendance.view", "requests.decide"]));
    expect(login.body.data.access.permissions).not.toContain("employees.create");
  });

  it("a switched-off role can't be used", async () => {
    await createCeoRole(["attendance.view"]);
    const ceo = await createUser({ employeeId: "EMP_T_CEO", email: "ceo@test.local", role: "CEO" as UserRole });
    const off = await request(app)
      .patch("/api/access/roles/CEO/active")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ isActive: false });
    expect(off.status).toBe(200);
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${tokenFor(ceo)}`);
    expect(res.status).toBe(403);
  });

  it("built-in Admin keeps full access by default", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "New", email: "new@test.local", password: "secret123", role: "EMPLOYEE" });
    expect(res.status).toBe(201);
  });

  it("only the Super Admin gives the Super Admin role", async () => {
    const employee = await createUser({ employeeId: "EMP_T_E1", email: "e1@test.local" });
    const res = await request(app)
      .put(`/api/users/${employee._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "SUPER_ADMIN" });
    expect(res.status).toBe(403);
  });

  it("people without the admin-logins permission can't give admin-portal roles", async () => {
    await createCeoRole(["employees.view", "employees.create"]);
    const ceo = await createUser({ employeeId: "EMP_T_CEO", email: "ceo@test.local", role: "CEO" as UserRole });
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${tokenFor(ceo)}`)
      .send({ name: "Y", email: "y@test.local", password: "secret123", role: "ADMIN" });
    expect(res.status).toBe(403);
    const ok = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${tokenFor(ceo)}`)
      .send({ name: "Z", email: "z@test.local", password: "secret123", role: "EMPLOYEE" });
    expect(ok.status).toBe(201);
  });

  it("a role change applies to existing sign-ins", async () => {
    const employee = await createUser({ employeeId: "EMP_T_E2", email: "e2@test.local", role: UserRole.ADMIN });
    const token = tokenFor(employee);
    expect((await request(app).get("/api/users").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    const change = await request(app)
      .put(`/api/users/${employee._id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "EMPLOYEE" });
    expect(change.status).toBe(200);
    expect((await request(app).get("/api/users").set("Authorization", `Bearer ${token}`)).status).toBe(403);
  });

  describe("one person's own access", () => {
    const future = () => {
      const d = new Date(Date.now() + 10 * 24 * 3600_000);
      return d.toISOString().slice(0, 10);
    };

    it("an Employee can be allowed to decide requests, only from the admin portal", async () => {
      const lead = await createUser({ employeeId: "EMP_T_L1", email: "lead@test.local" });
      const other = await createUser({ employeeId: "EMP_T_O1", email: "other@test.local" });
      const set = await request(app)
        .put(`/api/access/users/${lead._id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ grant: ["requests.decide"] });
      expect(set.status).toBe(200);
      expect(set.body.data.effective.adminPortal).toBe(true);
      expect(set.body.data.effective.permissions).toEqual(expect.arrayContaining(["requests.view", "requests.decide"]));

      const token = tokenFor(lead);
      const login = await request(app).post("/api/auth/login").send({ email: "lead@test.local", password: TEST_PASSWORD });
      expect(login.body.data.access.adminPortal).toBe(true);

      // Their own dashboard / agent: still an Employee.
      expect((await request(app).get("/api/users").set("Authorization", `Bearer ${token}`)).status).toBe(403);

      const portal = (r: request.Test) => r.set("Authorization", `Bearer ${token}`).set("X-Portal", "admin");
      expect((await portal(request(app).get("/api/users"))).status).toBe(200);

      const date = future();
      const leave = await LeaveRequest.create({ employeeId: other.employeeId, type: "CASUAL", reason: "Trip", startDate: date, endDate: date, status: "PENDING" });
      const decided = await portal(request(app).patch(`/api/attendance/time-off/leaves/${leave._id}/process`)).send({ status: "REJECTED", adminReason: "Busy week" });
      expect(decided.status).toBe(200);

      // Not their own request.
      const own = await LeaveRequest.create({ employeeId: lead.employeeId, type: "CASUAL", reason: "Trip", startDate: date, endDate: date, status: "PENDING" });
      const self = await portal(request(app).patch(`/api/attendance/time-off/leaves/${own._id}/process`)).send({ status: "REJECTED", adminReason: "x" });
      expect(self.status).toBe(403);

      // Anything not given stays refused, even from the portal.
      const create = await portal(request(app).post("/api/users")).send({ name: "N", email: "n@test.local", password: "secret123", role: "EMPLOYEE" });
      expect(create.status).toBe(403);
      const generate = await portal(request(app).post("/api/attendance/generate")).send({ date });
      expect(generate.status).toBe(403);
    });

    it("an action can be taken away from one Admin", async () => {
      const set = await request(app)
        .put(`/api/access/users/${admin._id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ revoke: ["employees.create"] });
      expect(set.status).toBe(200);
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "N", email: "n@test.local", password: "secret123", role: "EMPLOYEE" });
      expect(res.status).toBe(403);
      // Everything else still works.
      expect((await request(app).get("/api/users").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
    });

    it("only the Super Admin sets a person's access", async () => {
      const e = await createUser({ employeeId: "EMP_T_E9", email: "e9@test.local" });
      const res = await request(app)
        .put(`/api/access/users/${e._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ grant: ["requests.decide"] });
      expect(res.status).toBe(403);
    });
  });
});
