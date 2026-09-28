/**
 * Debounced background queue for telemetry-derived data (daily analytics and
 * attendance).
 *
 * Every agent uploads a batch every ~30s, and recomputing both documents means
 * replaying the employee's whole day of events. Doing that inline on every
 * batch pinned the CPU on a small VPS. Instead each employee/day is recomputed
 * at most once per MIN_INTERVAL_MS (trailing, so the latest batch is always
 * reflected), with a small global concurrency limit, off the request path.
 */
type RecomputeTask = () => Promise<void>;

const MIN_INTERVAL_MS = 60_000;
const TICK_MS = 5_000;
const MAX_CONCURRENT = 2;
// A recompute that never settles (e.g. a stalled DB call) must not hold a
// slot forever: two stuck jobs would freeze attendance for everyone.
const STUCK_AFTER_MS = 2 * 60_000;

const pending = new Map<string, RecomputeTask>();
const lastStartedAt = new Map<string, number>();
const running = new Map<string, number>();
let timer: NodeJS.Timeout | null = null;

const pruneHistory = (now: number) => {
  if (lastStartedAt.size < 5_000) return;
  for (const [key, startedAt] of lastStartedAt) {
    if (now - startedAt > MIN_INTERVAL_MS && !pending.has(key)) {
      lastStartedAt.delete(key);
    }
  }
};

const releaseStuck = (now: number) => {
  for (const [key, startedAt] of running) {
    if (now - startedAt > STUCK_AFTER_MS) {
      console.warn(`[Recompute] ${key} still running after ${STUCK_AFTER_MS / 1000}s; freeing its slot.`);
      running.delete(key);
    }
  }
};

const drain = () => {
  const now = Date.now();
  releaseStuck(now);
  // An employee's first refresh of the day (their login showing up) goes
  // ahead of routine refreshes for people already present.
  const ordered = Array.from(pending.entries()).sort(
    ([a], [b]) => Number(lastStartedAt.has(a)) - Number(lastStartedAt.has(b)),
  );
  for (const [key, task] of ordered) {
    if (running.size >= MAX_CONCURRENT) break;
    if (running.has(key)) continue;
    if (now - (lastStartedAt.get(key) ?? 0) < MIN_INTERVAL_MS) continue;

    pending.delete(key);
    running.set(key, now);
    lastStartedAt.set(key, now);
    task()
      .catch((err) => {
        console.error(`[Recompute] Derived data refresh failed for ${key}:`, err);
      })
      .finally(() => {
        if (running.get(key) === now) running.delete(key);
      });
  }
  pruneHistory(now);
};

const ensureTimer = () => {
  if (timer) return;
  timer = setInterval(drain, TICK_MS);
  timer.unref();
};

/**
 * Schedules `task` for `key`. A newer task for the same key replaces an older
 * pending one, so only the latest state is computed.
 */
export const scheduleDerivedRecompute = (key: string, task: RecomputeTask) => {
  pending.set(key, task);
  ensureTimer();
  // First refresh for a key (e.g. the day's first login) runs right away.
  if (!lastStartedAt.has(key)) drain();
};
