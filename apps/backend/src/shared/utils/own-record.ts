import { AppError } from "./app-error";

/**
 * Nobody decides or edits their own request / attendance (someone else has
 * to), except the Super Admin. Matters most for people who were given
 * approval rights on top of an Employee role.
 */
export const assertNotOwn = (
  user: { role?: string; employeeId?: string } | undefined,
  employeeId: unknown,
  message = "You can't decide your own request. Someone else has to.",
) => {
  if (user?.role === "SUPER_ADMIN") return;
  if (employeeId && user?.employeeId && String(employeeId) === String(user.employeeId)) {
    throw new AppError(message, 403);
  }
};
