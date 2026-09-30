import { notificationService } from "../../../shared/services/notification.service";
import { dispatchDiscordAuthNotification } from "./discord-notification.service";
import { User } from "../../users/model/user.model";
import { UserRole } from "../../../_shared/constants";
import { getBusinessDate } from "../../attendance/services/shift-schedule.service";

const NOT_ANNOUNCED_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

const formatIndiaTime = (value: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);

/**
 * Announces an employee's login for today exactly once: dashboard toast +
 * Discord login channel.
 *
 * Driven by attendance: called whenever today's attendance has a login time
 * (it is recomputed after every telemetry upload), so every present employee
 * is announced with the same login time the attendance page shows. A
 * per-employee "announced date" is claimed atomically first, so repeated
 * recomputes, restarts or parallel runs can never post twice; if Discord
 * fails the claim is released and the next recompute retries.
 */
export const announceDailyLoginOnce = async (input: {
  employeeId: string;
  date: string;
  loginTime: Date;
}) => {
  if (input.date !== getBusinessDate()) return;
  const claimed = await User.findOneAndUpdate(
    {
      employeeId: input.employeeId,
      loginAnnouncedDate: { $ne: input.date },
      // Only employees are announced, never admin accounts.
      role: { $nin: NOT_ANNOUNCED_ROLES },
    },
    { $set: { loginAnnouncedDate: input.date } },
    { projection: { name: 1, employeeId: 1 } },
  ).lean();
  if (!claimed) return;

  const employeeName = String((claimed as any).name || input.employeeId);
  const message = `${employeeName} (${input.employeeId}) has logged in at ${formatIndiaTime(new Date(input.loginTime))}.`;
  notificationService.broadcast("auth_event", {
    title: "User Logged In",
    message,
    employeeId: input.employeeId,
    type: "LOGIN",
  });
  const delivered = await dispatchDiscordAuthNotification({
    title: "User Logged In",
    message,
    employeeName,
    employeeId: input.employeeId,
    eventType: "LOGIN",
  });
  if (delivered === false) {
    await User.updateOne(
      { employeeId: input.employeeId, loginAnnouncedDate: input.date },
      { $set: { loginAnnouncedDate: null } },
    );
  }
};
