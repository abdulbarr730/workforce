import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";

export const getEmployeeDailyAnalytics = async (
  employeeId: string,

  date: string,
) => {
  return await EmployeeDailyAnalytics.findOne({
    employeeId,

    date,
  }).lean();
};
