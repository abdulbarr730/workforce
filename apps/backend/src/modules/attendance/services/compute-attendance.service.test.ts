import { beforeEach, describe, expect, it } from "vitest";

import { clearDatabase, createDefaultShifts, createUser, recordWorkday } from "../../../../test/helpers";
import { AttendanceRecord } from "../model/attendance-record.model";
import { LeaveRequest } from "../model/leave-request.model";
import { Holiday } from "../model/holiday.model";
import { computeAttendanceFromEvents } from "./compute-attendance.service";

// A past Wednesday, so "today" rules (open sessions) never apply.
const DAY = "2026-09-16";
const EMPLOYEE = "EMP_T_01";

let shiftId: string;

const compute = async () => {
  await computeAttendanceFromEvents({ employeeId: EMPLOYEE, date: DAY, shiftPolicyId: shiftId });
  return AttendanceRecord.findOne({ employeeId: EMPLOYEE, date: DAY }).lean();
};

const workday = (loginClock: string, logoutClock: string, extra = {}) =>
  recordWorkday({
    employeeId: EMPLOYEE,
    date: DAY,
    loginClock,
    logoutClock,
    breaks: [{ startClock: "13:30", minutes: 40 }],
    ...extra,
  });

describe("computeAttendanceFromEvents (WEEKDAY shift 10:00-18:30, cutoff 09:55)", () => {
  beforeEach(async () => {
    await clearDatabase();
    shiftId = String((await createDefaultShifts())!._id);
    await createUser({ employeeId: EMPLOYEE, name: "Test Employee", assignedShiftPolicyId: shiftId });
  });

  it("marks an on-time full day PRESENT with the real login and logout", async () => {
    await workday("09:45", "18:40");
    const record = await compute();
    expect(record?.attendanceStatus).toBe("PRESENT");
    const secondsFrom = (value: Date | null | undefined, clock: string) =>
      Math.abs((value?.getTime() ?? 0) - new Date(`${DAY}T${clock}:00+05:30`).getTime()) / 1000;
    expect(secondsFrom(record?.loginTime, "09:45")).toBeLessThan(60);
    expect(secondsFrom(record?.logoutTime, "18:40")).toBeLessThan(60);
    expect(record?.breakMinutes).toBeGreaterThanOrEqual(35);
  });

  it("marks a login after the cutoff LATE", async () => {
    await workday("10:20", "19:10");
    const record = await compute();
    expect(record?.attendanceStatus).toBe("LATE");
  });

  it("marks a day that ends early HALF_DAY", async () => {
    await workday("09:45", "14:00", { breaks: [] });
    const record = await compute();
    expect(record?.attendanceStatus).toBe("HALF_DAY");
  });

  it("marks a working day without telemetry ABSENT", async () => {
    const record = await compute();
    expect(record?.attendanceStatus).toBe("ABSENT");
  });

  it("marks an approved leave day LEAVE", async () => {
    await LeaveRequest.create({ employeeId: EMPLOYEE, type: "CASUAL", reason: "x", startDate: DAY, endDate: DAY, status: "APPROVED" });
    const record = await compute();
    expect(record?.attendanceStatus).toBe("LEAVE");
  });

  it("marks a company holiday HOLIDAY", async () => {
    await Holiday.create({ name: "Test Holiday", date: DAY });
    const record = await compute();
    expect(record?.attendanceStatus).toBe("HOLIDAY");
  });
});
