import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearDatabase, createUser } from "../../../test/helpers";
import { UserRole } from "../../_shared/constants";
import app from "../../app";
import { env } from "../../config/env";
import { notifyEmployeeByEmail, sendLoginDetailsEmail } from "../../shared/services/email.service";
import { clearSenderCache } from "./services/email-senders.service";
import { EmailLog } from "./model/email-log.model";

const tokenFor = (user: any) =>
  jwt.sign(
    { userId: String(user._id), employeeId: user.employeeId, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
  );

describe("email senders per type", () => {
  const saved = { token: env.ZEPTOMAIL_TOKEN, from: env.MAIL_FROM_ADDRESS };
  const realFetch = globalThis.fetch;
  let bodies: any[] = [];

  beforeEach(async () => {
    await clearDatabase();
    clearSenderCache();
    bodies = [];
    env.ZEPTOMAIL_TOKEN = "test-token";
    env.MAIL_FROM_ADDRESS = "noreply@test.local";
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      bodies.push(JSON.parse(String(init?.body || "{}")));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
  });
  afterEach(() => {
    env.ZEPTOMAIL_TOKEN = saved.token;
    env.MAIL_FROM_ADDRESS = saved.from;
    globalThis.fetch = realFetch;
  });

  it("uses the saved sender for each group, and the default otherwise", async () => {
    const owner = await createUser({ employeeId: "EMP_T_SA", email: "sa@test.local", role: UserRole.SUPER_ADMIN });
    const admin = await createUser({ employeeId: "EMP_T_ADM", email: "admin@test.local", role: UserRole.ADMIN });
    const employee = await createUser({ employeeId: "EMP_T_E1", email: "e1@test.local" });

    // Default sender before anything is saved.
    await sendLoginDetailsEmail({ to: employee.email, name: employee.name, employeeId: employee.employeeId, tempPassword: "Abc12345" });
    expect(bodies[0].from.address).toBe("noreply@test.local");

    // Only the owner changes senders.
    const denied = await request(app)
      .put("/api/notifications/email-settings")
      .set("Authorization", `Bearer ${tokenFor(admin)}`)
      .send({ senders: [] });
    expect(denied.status).toBe(403);

    const res = await request(app)
      .put("/api/notifications/email-settings")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .send({
        senders: [
          { group: "ACCOUNT", address: "no-reply@test.local", name: "Accounts" },
          { group: "HR", address: "hr@test.local", name: "HR Team", replyTo: "hr@test.local" },
        ],
      });
    expect(res.status).toBe(200);

    await sendLoginDetailsEmail({ to: employee.email, name: employee.name, employeeId: employee.employeeId, tempPassword: "Abc12345" });
    await notifyEmployeeByEmail({
      employeeId: employee.employeeId,
      category: "LEAVE_DECIDED",
      subject: "Your leave request was approved",
      title: "Leave approved",
      lines: ["Approved."],
    });
    expect(bodies[1].from).toEqual({ address: "no-reply@test.local", name: "Accounts" });
    expect(bodies[2].from).toEqual({ address: "hr@test.local", name: "HR Team" });
    expect(bodies[2].reply_to[0].address).toBe("hr@test.local");
    expect(bodies[2].htmlbody).toContain("replies go to hr@test.local");
    expect(bodies[1].htmlbody).toContain("Please do not reply");

    const leaveLog: any = await EmailLog.findOne({ category: "LEAVE_DECIDED" }).lean();
    expect(leaveLog.fromAddress).toBe("hr@test.local");
  });

  it("rejects an address that isn't an email", async () => {
    const owner = await createUser({ employeeId: "EMP_T_SA", email: "sa@test.local", role: UserRole.SUPER_ADMIN });
    const res = await request(app)
      .put("/api/notifications/email-settings")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .send({ senders: [{ group: "HR", address: "hr-at-company" }] });
    expect(res.status).toBe(400);
  });
});
