import { ActivityEvent } from "../model/activity-event.model";
import { EventType } from "../../../_shared/types";

/**
 * Current desktop agents emit USER_ACTIVITY only on real keyboard/mouse input
 * (OS idle clock ≤ 3s). They also flush an ACTIVE_WINDOW every 5 minutes even
 * when an unlocked PC sits untouched, so for those agents ACTIVE_WINDOW is not
 * proof that the employee is present — it opened false sessions at midnight.
 *
 * ACTIVE_WINDOW stays a presence fallback only for employees whose agent has
 * never sent USER_ACTIVITY (older releases).
 */
const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const CAPABLE_TTL_MS = 6 * 60 * 60 * 1000;
const NOT_CAPABLE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { value: boolean; expiresAt: number }>();

const remember = (employeeId: string, value: boolean) => {
  cache.set(employeeId, {
    value,
    expiresAt: Date.now() + (value ? CAPABLE_TTL_MS : NOT_CAPABLE_TTL_MS),
  });
  return value;
};

export const agentSendsInputProof = async (
  employeeId: string,
  knownEvents: Array<{ employeeId?: string; type?: string }> = [],
): Promise<boolean> => {
  if (
    knownEvents.some(
      (event) =>
        event.type === EventType.USER_ACTIVITY &&
        String(event.employeeId) === employeeId,
    )
  ) {
    return remember(employeeId, true);
  }

  const cached = cache.get(employeeId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const found = await ActivityEvent.exists({
    employeeId,
    type: EventType.USER_ACTIVITY,
    timestamp: { $gte: new Date(Date.now() - LOOKBACK_MS) },
  });
  return remember(employeeId, Boolean(found));
};

export const isMacTelemetry = (event: any) => {
  const platform = String(event?.metadata?.platform || "").toLowerCase();
  const os = String(event?.metadata?.os || "").toLowerCase();
  return (
    platform === "darwin" ||
    platform.includes("mac") ||
    os.includes("mac") ||
    os.includes("darwin")
  );
};

/** Whether an ACTIVE_WINDOW event may stand in for human presence. */
export const windowEventProvesPresence = (
  event: any,
  inputProofCapable: boolean,
) => !inputProofCapable && !isMacTelemetry(event);
