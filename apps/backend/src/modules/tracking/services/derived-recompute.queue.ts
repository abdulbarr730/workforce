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

const pending = new Map<string, RecomputeTask>();
const lastStartedAt = new Map<string, number>();
const running = new Set<string>();
let timer: NodeJS.Timeout | null = null;

const pruneHistory = (now: number) => {
  if (lastStartedAt.size < 5_000) return;
  for (const [key, startedAt] of lastStartedAt) {
    if (now - startedAt > MIN_INTERVAL_MS && !pending.has(key)) {
      lastStartedAt.delete(key);
    }
  }
};

const drain = () => {
  const now = Date.now();
  for (const [key, task] of pending) {
    if (running.size >= MAX_CONCURRENT) break;
    if (running.has(key)) continue;
    if (now - (lastStartedAt.get(key) ?? 0) < MIN_INTERVAL_MS) continue;

    pending.delete(key);
    running.add(key);
    lastStartedAt.set(key, now);
    task()
      .catch((err) => {
        console.error(`[Recompute] Derived data refresh failed for ${key}:`, err);
      })
      .finally(() => {
        running.delete(key);
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
