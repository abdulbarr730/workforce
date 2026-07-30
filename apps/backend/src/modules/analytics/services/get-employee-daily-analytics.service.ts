import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";

export const getEmployeeDailyAnalytics = async (
  employeeId: string,
  date: string,
) => {
  const attendance = await AttendanceRecord.findOne({
    employeeId,
    date,
  }).lean();

  const analytics = await EmployeeDailyAnalytics.findOne({
    employeeId,
    date,
  }).lean();

  if (!attendance) return null;

  return {
    ...attendance,
    actualProductiveMinutes: analytics ? Math.floor(analytics.productiveSeconds / 60) : attendance.productiveMinutes,
    focusScore: analytics ? analytics.focusScore : 0,
  };
};
