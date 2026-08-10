import { WorkSession } from "../model/work-session.model";
import { getBusinessDate } from "../../attendance/services/shift-schedule.service";

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

  try {
    const { computeAttendanceFromEvents } =
      await import("../../attendance/services/compute-attendance.service");
    const { User } = await import("../../users/model/user.model");
    const user = await User.findOne({ employeeId });
    if (user) {
      const dateStr = getBusinessDate(activeSession.loginAt);

      await computeAttendanceFromEvents({
        employeeId,
        date: dateStr,
        shiftPolicyId: user.assignedShiftPolicyId?.toString() || "",
      });
    }
  } catch (e) {
    console.error("Failed to compute attendance on session end:", e);
  }

  return activeSession;
};
