import { Device } from "../model/device.model";
import { User } from "../../users/model/user.model";

const DEFAULT_IDLE_TIMEOUT_MINUTES = 10;

const validMinutes = (value: unknown) => {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 120
    ? Math.round(minutes)
    : null;
};

// Last value handed to each agent, to log only real changes.
const lastServed = new Map<string, number>();

/**
 * Idle timeout an employee's agent must use.
 *
 * An employee can have several device records (reinstalls, old laptops,
 * records briefly unlinked on sign-in). The admin's most recent save wins,
 * whichever of those records it landed on; then the calling device's own
 * value; then the 10-minute default.
 */
export async function resolveAgentIdleTimeout(
  employeeId: string,
  deviceId?: string,
) {
  const device = deviceId ? await Device.findOne({ deviceId }) : null;
  const deviceBelongsToEmployee =
    !!device && (!device.employeeId || device.employeeId === employeeId);

  const adminSet = await Device.findOne({
    $or: [
      { employeeId },
      ...(deviceId && deviceBelongsToEmployee ? [{ deviceId }] : []),
    ],
    idleTimeoutSetAt: { $ne: null },
  })
    .select("deviceId idleTimeoutMinutes idleTimeoutSetAt")
    .sort({ idleTimeoutSetAt: -1 })
    .lean();

  const user = await User.findOne({ employeeId })
    .select("idleTimeoutMinutes idleTimeoutSetAt")
    .lean();

  let idleTimeoutMinutes = DEFAULT_IDLE_TIMEOUT_MINUTES;
  let source = "default";
  const userMinutes = validMinutes((user as any)?.idleTimeoutMinutes);
  const userSetAt = (user as any)?.idleTimeoutSetAt
    ? new Date((user as any).idleTimeoutSetAt).getTime()
    : 0;
  const adminMinutes = validMinutes(adminSet?.idleTimeoutMinutes);
  const adminSetAt = adminSet?.idleTimeoutSetAt
    ? new Date(adminSet.idleTimeoutSetAt as Date).getTime()
    : 0;
  const deviceMinutes = validMinutes(device?.idleTimeoutMinutes);
  if (userMinutes !== null && userSetAt >= adminSetAt) {
    idleTimeoutMinutes = userMinutes;
    source = `employee setting at ${new Date(userSetAt).toISOString()}`;
  } else if (adminMinutes !== null) {
    idleTimeoutMinutes = adminMinutes;
    source = `admin-set on ${adminSet?.deviceId} at ${new Date(adminSet!.idleTimeoutSetAt as Date).toISOString()}`;
  } else if (deviceMinutes !== null) {
    idleTimeoutMinutes = deviceMinutes;
    source = `device record ${deviceId}`;
  }

  const key = `${employeeId}|${deviceId || "-"}`;
  const previous = lastServed.get(key);
  if (previous !== idleTimeoutMinutes) {
    lastServed.set(key, idleTimeoutMinutes);
    console.log(
      `[IdleTimeout] ${employeeId} device=${deviceId || "none"} -> ${idleTimeoutMinutes} min` +
        `${previous !== undefined ? ` (was ${previous})` : ""} from ${source}`,
    );
  }

  return { device, idleTimeoutMinutes };
}
