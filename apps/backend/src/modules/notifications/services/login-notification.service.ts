import { notificationService } from "../../../shared/services/notification.service";
import { dispatchDiscordAuthNotification } from "./discord-notification.service";

const formatIndiaTime = (value: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);

/**
 * Announces that an employee started work: dashboard toast + Discord login
 * channel. Called for the first real work session of the business day (every
 * employee, whether or not they re-signed in to the agent) and for explicit
 * mid-day re-logins.
 */
export const announceEmployeeLogin = async (input: {
  employeeId: string;
  employeeName: string;
  at: Date;
}) => {
  const message = `${input.employeeName} (${input.employeeId}) has logged in at ${formatIndiaTime(input.at)}.`;
  notificationService.broadcast("auth_event", {
    title: "User Logged In",
    message,
    employeeId: input.employeeId,
    type: "LOGIN",
  });
  await dispatchDiscordAuthNotification({
    title: "User Logged In",
    message,
    employeeName: input.employeeName,
    employeeId: input.employeeId,
    eventType: "LOGIN",
  });
};
