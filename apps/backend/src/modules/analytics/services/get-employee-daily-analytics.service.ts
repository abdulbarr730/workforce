import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";

export const getEmployeeDailyAnalytics = async (
  employeeId: string,
  date: string,
) => {
  // VPS backend still writes to EmployeeDailyAnalytics, so we read from it 
  // and map it to match the new AttendanceRecord structure the frontend expects.
  const record = await EmployeeDailyAnalytics.findOne({
    employeeId,
    date,
  }).lean();

  if (!record) return null;

  return {
    ...record,
    productiveMinutes: Math.floor((record.productiveSeconds || 0) / 60),
    idleMinutes: Math.floor((record.idleSeconds || 0) / 60),
    breakMinutes: 0,
    awayWorkingMinutes: 0,
    attendanceStatus: "PRESENT",
  };
};
