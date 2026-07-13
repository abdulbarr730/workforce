import { Holiday } from "../model/holiday.model";
import { LeaveRequest } from "../model/leave-request.model";

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
  const holiday = await Holiday.findOne({ date, isActive: true });
  if (holiday) return "HOLIDAY";

  // 3. Shift Policy: Check if today is a designated rest day (Weekend)
  // We append T12:00:00Z to prevent UTC timezone shifts from giving the wrong day
  const dateObj = new Date(`${date}T12:00:00Z`);
  const dayName = DAY_MAP[dateObj.getUTCDay()];

  if (!activeShiftDays.includes(dayName)) {
    return "WEEKEND";
  }

  // If none of the above match, it is a mandatory working day.
  return null;
}
