/**
 * A small in-memory cache with a time-to-live and a size cap. When full,
 * expired entries are dropped first, then the oldest.
 */
export class TtlCache<K, V> {
  private entries = new Map<K, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** The cached value, or undefined if missing or expired. */
  get(key: K): { value: V } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return { value: entry.value };
  }

  set(key: K, value: V): void {
    const now = this.now();
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      for (const [k, entry] of this.entries) {
        if (entry.expires <= now) this.entries.delete(k);
      }
      // Maps iterate in insertion order, so this drops the oldest.
      for (const k of this.entries.keys()) {
        if (this.entries.size < this.maxEntries) break;
        this.entries.delete(k);
      }
    }
    this.entries.set(key, { value, expires: now + this.ttlMs });
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
