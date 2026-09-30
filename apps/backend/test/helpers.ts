/**
 * Test helpers. Data builders live in src/scripts/seed/builders.ts so the dev
 * seed and the tests generate data the same way.
 */
import bcrypt from "bcrypt";
import mongoose from "mongoose";

import { UserRole } from "../src/_shared/constants";
import { User } from "../src/modules/users/model/user.model";
import { ActivityEvent } from "../src/modules/tracking/model/activity-event.model";
import { WorkSession } from "../src/modules/work-sessions/model/work-session.model";
import { seedDefaultShifts } from "../src/modules/attendance/services/seed-default-shifts.service";
import { ShiftPolicy } from "../src/modules/attendance/model/shift-policy.model";
import { buildWorkdayEvents, createRng, type WorkdayPlan } from "../src/scripts/seed/builders";

export * from "../src/scripts/seed/builders";

/** Deletes every document in every collection of the test database. */
export const clearDatabase = async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
};

export const TEST_PASSWORD = "Test@12345";

export const createUser = async (overrides: Partial<{
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  password: string;
  departmentId: string | null;
  departmentName: string | null;
  assignedShiftPolicyId: string | null;
  isActive: boolean;
}> = {}) => {
  const employeeId = overrides.employeeId ?? `EMP_T_${Math.random().toString(36).slice(2, 8)}`;
  return User.create({
    name: "Test User",
    email: `${employeeId.toLowerCase()}@test.local`,
    role: UserRole.EMPLOYEE,
    ...overrides,
    employeeId,
    password: await bcrypt.hash(overrides.password ?? TEST_PASSWORD, 4),
  });
};

/** Creates the production default shifts (WEEKDAY/SATURDAY/SUNDAY). */
export const createDefaultShifts = async () => {
  await seedDefaultShifts();
  return ShiftPolicy.findOne({ name: "WEEKDAY" }).lean();
};

/**
 * Stores one working day of agent telemetry plus its WorkSession, the way the
 * ingest path leaves them, so attendance can be derived from it.
 */
export const recordWorkday = async (
  plan: Omit<WorkdayPlan, "deviceId"> & { deviceId?: string },
  seed = 1,
) => {
  const events = buildWorkdayEvents({ deviceId: `DEV-${plan.employeeId}`, ...plan }, createRng(seed));
  if (!events.length) return events;
  await ActivityEvent.insertMany(events);
  const login = events.find((e) => e.type === "LOGIN")!.timestamp;
  const logout = events.find((e) => e.type === "LOGOUT")?.timestamp ?? null;
  const user = await User.findOne({ employeeId: plan.employeeId }).lean();
  await WorkSession.create({
    employeeId: plan.employeeId,
    employeeName: user?.name ?? plan.employeeId,
    loginAt: login,
    logoutAt: logout,
    status: logout ? "COMPLETED" : "ACTIVE",
  });
  return events;
};
