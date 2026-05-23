import { ActivityEvent }
  from "../../tracking/model/activity-event.model";

import { AttendanceRecord }
  from "../model/attendance-record.model";

import {
  resolveShiftVariant
} from "./resolve-shift-variant.service";

type ComputeAttendanceInput = {
  employeeId: string;

  date: string;
};

export async function
computeAttendanceFromEvents(
  input: ComputeAttendanceInput
) {
  const events =
    await ActivityEvent.find({
      employeeId:
        input.employeeId,

      createdAt: {
        $gte: new Date(
          `${input.date}T00:00:00`
        ),

        $lte: new Date(
          `${input.date}T23:59:59`
        )
      }
    }).sort({
      createdAt: 1
    });

  if (!events.length) {
    return AttendanceRecord.create({
      employeeId:
        input.employeeId,


      date: input.date,
      status: "ABSENT",
    } as any);
  }

  const loginEvent =
    events.find(
      (e) => e.type === "LOGIN"
    );

  const logoutEvent =
    events.reverse().find(
      (e) => e.type === "LOGOUT"
    );

  if (!loginEvent) {
    throw new Error(
      "Missing LOGIN event"
    );
  }

  const shiftResolution =
    await resolveShiftVariant({
      loginAt:
        loginEvent.createdAt
    });

  const loginAt =
    loginEvent.createdAt;

  const logoutAt =
    logoutEvent?.createdAt;

  let totalWorkedMinutes = 0;

  if (logoutAt) {
    totalWorkedMinutes =
      Math.floor(
        (
          logoutAt.getTime() -
          loginAt.getTime()
        ) /
          1000 /
          60
      );
  }

  const attendanceStatus =
    totalWorkedMinutes < 240
      ? "HALF_DAY"
      : "PRESENT";

  return AttendanceRecord.findOneAndUpdate(
    {
      employeeId:
        input.employeeId,


      date: input.date
    },

    {
      employeeId:
        input.employeeId,


      date: input.date,

      status:
        attendanceStatus,

      resolvedShiftPolicyId:
        shiftResolution.resolvedShiftPolicyId,

      resolvedShiftPolicyName:
        shiftResolution.resolvedShiftPolicyName,

      loginAt,

      logoutAt,

      totalWorkedMinutes
    },

    {
      upsert: true,
      new: true
    }
  );
}