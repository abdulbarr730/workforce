import { User }
  from "../../users/model/user.model";

import {
  computeAttendanceFromEvents
} from "./compute-attendance.service";

import { UserRole }
  from "@workforce/shared-constants";

type GenerateDailyAttendanceInput = {
  date: string;
};

export async function
generateDailyAttendance(
  input: GenerateDailyAttendanceInput
) {
  const employees =
    await User.find({
      role: UserRole.EMPLOYEE,
      deleted: false
    });

  const results = [];

  for (const employee of employees) {
    try {
      const attendance =
        await computeAttendanceFromEvents(
          {
            employeeId:
              employee.employeeId,

            date:
              input.date
          }
        );

      results.push({
        employeeId:
          employee.employeeId,

        success: true,

        attendance
      });
    } catch (error) {
      console.error(
        `Attendance generation failed for ${employee.employeeId}`,
        error
      );

      results.push({
        employeeId:
          employee.employeeId,

        success: false
      });
    }
  }

  return results;
}