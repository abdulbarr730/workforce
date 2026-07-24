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

  try {
    const { computeAttendanceFromEvents } = await import("../../attendance/services/compute-attendance.service");
    const { User } = await import("../../users/model/user.model");
    const user = await User.findOne({ employeeId });
    if (user) {
      // Use the session login date to ensure it computes for the correct day (adjust for IST if needed, but local date is usually fine)
      const d = activeSession.loginAt;
      const dateStr = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
      ].join("-");

      await computeAttendanceFromEvents({
        employeeId,
        date: dateStr,
        shiftPolicyId: user.assignedShiftPolicyId?.toString() || ""
      });
    }
  } catch (e) {
    console.error("Failed to compute attendance on session end:", e);
  }

  return activeSession;
};

