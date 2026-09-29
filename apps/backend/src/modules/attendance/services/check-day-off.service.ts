import { Holiday } from "../model/holiday.model";
import { LeaveRequest } from "../model/leave-request.model";
import { User } from "../../users/model/user.model";

const toDateKey = (value: unknown) => {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
};

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
): Promise<{
  status: "LEAVE" | "HOLIDAY" | "WEEKEND";
  label: string;
} | null> {
  // 1. Admin Configuration: Check for a Global Company Holiday.
  // Holiday wins first so Saturday holidays show the actual holiday name.
  const holiday = await Holiday.findOne({
    date,
    isActive: true,
    workingEmployeeIds: { $ne: employeeId },
  });
  if (holiday) return { status: "HOLIDAY", label: holiday.name };

  // 2. HR Override: Check for an Approved Leave Request.
  // Compare as plain dates: older rows store "2026-09-04T00:00:00.000Z",
  // which as text sorts after "2026-09-04", so the first day of such a leave
  // used to be marked ABSENT. Half-day leave is not a day off; attendance
  // handles it (see approvedHalfDayLeaveFor).
  const approvedLeaves = await LeaveRequest.find({
    employeeId,
    status: "APPROVED",
  })
    .select("type startDate endDate")
    .lean();
  const approvedLeave = approvedLeaves.find(
    (leave) =>
      String(leave.type).toUpperCase() !== "HALF_DAY" &&
      toDateKey(leave.startDate) <= date &&
      toDateKey(leave.endDate) >= date,
  );

  if (approvedLeave) return { status: "LEAVE", label: "Approved Leave" };

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
    return { status: "WEEKEND", label: "Weekly Off" };
  }

  // If none of the above match, it is a mandatory working day.
  return null;
}

/** Whether the employee has an approved half-day leave on this date. */
export async function approvedHalfDayLeaveFor(employeeId: string, date: string) {
  const leaves = await LeaveRequest.find({
    employeeId,
    status: "APPROVED",
    type: { $in: ["HALF_DAY", "Half Day", "half_day"] },
  })
    .select("startDate endDate")
    .lean();
  return leaves.some(
    (leave) =>
      toDateKey(leave.startDate) <= date && toDateKey(leave.endDate) >= date,
  );
}
