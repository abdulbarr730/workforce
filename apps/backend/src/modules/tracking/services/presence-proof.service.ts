import { ActivityEvent } from "../model/activity-event.model";
import { EventType } from "../../../_shared/types";
import {
  getBusinessDate,
  getBusinessDayBounds,
} from "../../attendance/services/shift-schedule.service";

/**
 * Current desktop agents emit USER_ACTIVITY only on real keyboard/mouse input
 * (OS idle clock ≤ 3s). They also flush an ACTIVE_WINDOW every 5 minutes even
 * when an unlocked PC sits untouched, so for those agents ACTIVE_WINDOW is not
 * proof that the employee is present — it opened false sessions at midnight.
 *
 * Decided per business day: if the agent sent any USER_ACTIVITY that day,
 * only input proves presence. On a day with none (an older agent build, or a
 * machine where the input signal failed) ACTIVE_WINDOW is the fallback — but
 * only when the foreground window actually changes (see window switches),
 * never a single repeated window from an idle PC. A 14-day lookback used to
 * mark such days ABSENT despite a full day of window activity.
 */
const CAPABLE_TTL_MS = 6 * 60 * 60 * 1000;
const NOT_CAPABLE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { value: boolean; expiresAt: number }>();

const remember = (key: string, value: boolean) => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + (value ? CAPABLE_TTL_MS : NOT_CAPABLE_TTL_MS),
  });
  return value;
};

export const agentSendsInputProof = async (
  employeeId: string,
  knownEvents: Array<{ employeeId?: string; type?: string }> = [],
  businessDate: string = getBusinessDate(),
): Promise<boolean> => {
  const key = `${employeeId}|${businessDate}`;
  if (
    knownEvents.some(
      (event) =>
        event.type === EventType.USER_ACTIVITY &&
        String(event.employeeId) === employeeId,
    )
  ) {
    return remember(key, true);
  }

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { start, end } = getBusinessDayBounds(businessDate);
  const found = await ActivityEvent.exists({
    employeeId,
    type: EventType.USER_ACTIVITY,
    timestamp: { $gte: start, $lte: end },
  });
  return remember(key, Boolean(found));
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
