import { AttendanceRecord } from "../../attendance/model/attendance-record.model";

export const getEmployeeTrendAnalytics = async (
  employeeId: string,
  days: number,
) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const formattedDate = startDate.toISOString().split("T")[0];

  return await AttendanceRecord.find({
    employeeId,
    date: {
      $gte: formattedDate,
    },
  })
    .sort({
      date: 1,
    })
    .lean();
};
