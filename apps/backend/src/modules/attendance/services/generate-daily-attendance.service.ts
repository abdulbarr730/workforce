import { User } from "../../users/model/user.model";
import { computeAttendanceFromEvents } from "./compute-attendance.service";
import { UserRole } from "../../../_shared/constants";
import { ShiftPolicy } from "../model/shift-policy.model";

type GenerateDailyAttendanceInput = {
  date: string;
};

export async function generateDailyAttendance(
  input: GenerateDailyAttendanceInput,
) {
  const employees = await User.find({
    role: { $nin: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
    isActive: true,
  });

  // Fetch the default shift policy as a fallback for users with null assigned shifts
  const defaultShift = await ShiftPolicy.findOne({ isDefault: true });

  const results = [];

  const chunkSize = 20;
  for (let i = 0; i < employees.length; i += chunkSize) {
    const chunk = employees.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (employee) => {
        try {
          const policyIdToUse =
            employee.assignedShiftPolicyId || defaultShift?._id.toString();

          if (!policyIdToUse) {
            throw new Error(
              `No shift assigned to employee and no default shift exists.`,
            );
          }

          const attendance = await computeAttendanceFromEvents({
            employeeId: employee.employeeId,
            date: input.date,
            shiftPolicyId: policyIdToUse,
          });

          return {
            employeeId: employee.employeeId,
            success: true,
            attendance,
          };
        } catch (error) {
          console.error(
            `Attendance generation failed for ${employee.employeeId}:`,
            error instanceof Error ? error.message : error,
          );

          return {
            employeeId: employee.employeeId,
            success: false,
            reason: error instanceof Error ? error.message : "Unknown Error",
          };
        }
      }),
    );
    results.push(...chunkResults);
  }

  return results;
}
