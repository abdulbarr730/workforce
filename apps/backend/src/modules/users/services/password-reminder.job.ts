import { User } from "../model/user.model";
import { isEmailConfigured, sendPasswordExpiryReminder } from "../../../shared/services/email.service";
import { logger } from "../../../shared/logger/logger";

const HOUR = 60 * 60 * 1000;

/**
 * Once per issued one-time password / link: if it expires within 24 hours
 * and the person still hasn't set their own password, remind them by email.
 */
export async function sendPasswordReminders() {
  if (!isEmailConfigured()) return;
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * HOUR);
  const users: any[] = await (User as any)
    .find({
      deletedAt: null,
      isActive: { $ne: false },
      passwordReminderSentAt: null,
      $or: [
        { mustChangePassword: true, tempPasswordExpiresAt: { $gt: now, $lte: soon } },
        { passwordResetExpiresAt: { $gt: now, $lte: soon } },
      ],
    })
    .select("email name employeeId mustChangePassword tempPasswordExpiresAt passwordResetExpiresAt")
    .lean();

  for (const user of users) {
    const tempDue =
      user.mustChangePassword &&
      user.tempPasswordExpiresAt &&
      new Date(user.tempPasswordExpiresAt) > now &&
      new Date(user.tempPasswordExpiresAt) <= soon;
    const kind = tempDue ? "PASSWORD" : "LINK";
    const expiresAt = new Date(tempDue ? user.tempPasswordExpiresAt : user.passwordResetExpiresAt);
    const result = await sendPasswordExpiryReminder({
      to: user.email,
      name: user.name,
      employeeId: user.employeeId,
      expiresAt,
      kind,
    });
    // Not sent: try again next hour.
    if (result.status !== "SENT") continue;
    await User.updateOne({ _id: user._id }, { $set: { passwordReminderSentAt: new Date() } });
  }
}

export function startPasswordReminderJob() {
  const run = () =>
    sendPasswordReminders().catch((error) =>
      logger.error?.(`Password reminder job failed: ${error instanceof Error ? error.message : error}`),
    );
  setTimeout(run, 60 * 1000);
  setInterval(run, HOUR);
}
