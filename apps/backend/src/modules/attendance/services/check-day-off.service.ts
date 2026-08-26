import { Holiday } from "../model/holiday.model";
import { LeaveRequest } from "../model/leave-request.model";
import { User } from "../../users/model/user.model";

// Map JS Date.getDay() integers to your ShiftDay enums
const DAY_MAP = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export async function checkDayOffStatus(
  employeeId: string,
  date: string, // "YYYY-MM-DD"
  activeShiftDays: string[],
): Promise<"LEAVE" | "HOLIDAY" | "WEEKEND" | null> {
  // 1. HR Override: Check for an Approved Leave Request
  // This takes priority. If they are on approved sick leave during a holiday, it remains leave.
  const approvedLeave = await LeaveRequest.findOne({
    employeeId,
    status: "APPROVED",
    startDate: { $lte: date },
    endDate: { $gte: date },
  });

  if (approvedLeave) return "LEAVE";

  // 2. Admin Configuration: Check for a Global Company Holiday
  const holiday = await Holiday.findOne({
    date,
    isActive: true,
    workingEmployeeIds: { $ne: employeeId },
  });
  if (holiday) return "HOLIDAY";

  // 3. Employee working days win over generic shift days. Most employees work
  // Mon-Sat by default, but admins can now mark a person's actual working days
  // from the Employees page.
  // We append T12:00:00Z to prevent UTC timezone shifts from giving the wrong day
  const dateObj = new Date(`${date}T12:00:00Z`);
  const dayName = DAY_MAP[dateObj.getUTCDay()];
  const employee = await User.findOne({ employeeId })
    .select("workingDays")
    .lean();
  const employeeWorkingDays =
    employee?.workingDays && employee.workingDays.length > 0
      ? employee.workingDays
      : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

  if (!employeeWorkingDays.includes(dayName) || !activeShiftDays.includes(dayName)) {
    return "WEEKEND";
  }

  // If none of the above match, it is a mandatory working day.
  return null;
}
