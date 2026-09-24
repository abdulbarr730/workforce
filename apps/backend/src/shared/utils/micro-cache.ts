/**
 * Tiny in-memory TTL cache with in-flight request coalescing.
 *
 * Hot read endpoints (live stats, device inventory) are polled by every
 * desktop agent and dashboard tab. Identical requests arriving within the TTL
 * share one computation instead of each re-reading the day's telemetry.
 */
type Entry<T> = { value: T; expiresAt: number };

export class MicroCache<T> {
  private values = new Map<string, Entry<T>>();
  private inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  /** `fresh` skips a cached value but still joins a computation in flight. */
  async getOrCompute(
    key: string,
    compute: () => Promise<T>,
    options: { fresh?: boolean } = {},
  ): Promise<T> {
    const cached = this.values.get(key);
    if (!options.fresh && cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = compute()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  invalidate(predicate?: (key: string) => boolean) {
    if (!predicate) {
      this.values.clear();
      return;
    }
    for (const key of this.values.keys()) {
      if (predicate(key)) this.values.delete(key);
    }
  }

  private set(key: string, value: T) {
    if (this.values.size >= this.maxEntries) {
      const now = Date.now();
      for (const [k, entry] of this.values) {
        if (entry.expiresAt <= now) this.values.delete(k);
      }
      if (this.values.size >= this.maxEntries) {
        const oldestKey = this.values.keys().next().value;
        if (oldestKey !== undefined) this.values.delete(oldestKey);
      }
    }
    this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}
