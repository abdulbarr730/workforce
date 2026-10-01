import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { clearDatabase, createDefaultShifts, createUser } from "../../../test/helpers";
import app from "../../app";
import { AttendanceRecord } from "../attendance/model/attendance-record.model";
import { WorkSession } from "../work-sessions/model/work-session.model";
import { getBusinessDate, getBusinessDayBounds } from "../attendance/services/shift-schedule.service";

const tokenFor = (user: any) =>
  jwt.sign(
    { userId: String(user._id), employeeId: user.employeeId, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
  );

describe("agent shift info", () => {
  beforeEach(async () => {
    await clearDatabase();
    await createDefaultShifts();
  });

  it("shows the attendance login (with a correction), not the first session", async () => {
    const employee = await createUser({ employeeId: "EMP_T_E1", email: "e1@test.local" });
    const date = getBusinessDate();
    const { start } = getBusinessDayBounds(date);
    const sessionAt = new Date(start.getTime() + 5 * 3600_000); // laptop on early
    const correctedAt = new Date(start.getTime() + 6 * 3600_000); // admin's correction
    await WorkSession.create({ employeeId: employee.employeeId, employeeName: employee.name, loginAt: sessionAt, status: "ACTIVE" } as any);

    const before = await request(app).post("/api/me/shift/assign").set("Authorization", `Bearer ${tokenFor(employee)}`);
    expect(before.status).toBe(200);
    expect(before.body.data.loginAt).toBe(sessionAt.toISOString());

    await AttendanceRecord.create({
      employeeId: employee.employeeId,
      employeeName: employee.name,
      date,
      attendanceStatus: "PRESENT",
      loginTime: correctedAt,
    } as any);
    const after = await request(app).post("/api/me/shift/assign").set("Authorization", `Bearer ${tokenFor(employee)}`);
    expect(after.body.data.loginAt).toBe(correctedAt.toISOString());
    expect(after.body.data.sessionStartedAt).toBe(sessionAt.toISOString());
  });
});
