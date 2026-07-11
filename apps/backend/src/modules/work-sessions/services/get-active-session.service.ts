import { WorkSession } from "../model/work-session.model";

export const getActiveSession = async (employeeId: string) => {
  return await WorkSession.findOne({
    employeeId,

    status: "ACTIVE",
  })
    .sort({
      createdAt: -1,
    })
    .lean();
};
