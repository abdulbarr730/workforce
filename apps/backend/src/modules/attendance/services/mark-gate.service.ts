import { AttendanceMarkSettings } from "../model/attendance-mark.model";

let cache: { value: { markRequired: boolean; requiredFrom: string | null }; at: number } | null =
  null;

/**
 * Whether a day's login comes only from "Mark Attendance" (or an admin),
 * not from laptop activity. Off until an admin switches it on; days before it
 * was switched on are never affected. Cached briefly: attendance is
 * recalculated very often.
 */
export async function markGateFor(date: string) {
  if (!cache || Date.now() - cache.at > 30_000) {
    const doc: any = await AttendanceMarkSettings.findOne({ key: "default" })
      .select("markRequired requiredFrom")
      .lean();
    cache = {
      value: { markRequired: doc?.markRequired === true, requiredFrom: doc?.requiredFrom || null },
      at: Date.now(),
    };
  }
  const { markRequired, requiredFrom } = cache.value;
  return Boolean(markRequired && requiredFrom && date >= requiredFrom);
}

/** Forget the cached setting (after an admin changes it). */
export const resetMarkGateCache = () => {
  cache = null;
};
