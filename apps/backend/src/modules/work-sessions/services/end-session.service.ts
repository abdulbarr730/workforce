import { WorkSession } from "../model/work-session.model";

interface EndSessionInput {
  completedTasks: string[];

  pendingTasks: string[];

  blockers: string;

  eodReport: string;
}

export const endSession = async (
  employeeId: string,

  payload: EndSessionInput,
) => {
  const activeSession = await WorkSession.findOne({
    employeeId,

    status: "ACTIVE",
  });

  if (!activeSession) {
    throw new Error("No active session found");
  }

  const logoutAt = new Date();

  const totalWorkedSeconds = Math.floor(
    (logoutAt.getTime() - activeSession.loginAt.getTime()) / 1000,
  );

  activeSession.logoutAt = logoutAt;

  activeSession.status = "COMPLETED";

  activeSession.completedTasks = payload.completedTasks;

  activeSession.pendingTasks = payload.pendingTasks;

  activeSession.blockers = payload.blockers;

  activeSession.eodReport = payload.eodReport;

  activeSession.totalWorkedSeconds = totalWorkedSeconds;

  await activeSession.save();

  return activeSession;
};
