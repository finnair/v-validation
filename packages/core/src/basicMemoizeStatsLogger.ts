import type { MemoizeStatsLogger } from './memoizeValidator.js';

/** Counts of a {@link BasicMemoizeStatsLogger} window, as logged. */
export interface MemoizeStats {
  readonly name?: string;
  readonly lookups: number;
  readonly hits: number;
  readonly stale: number;
  readonly misses: number;
  readonly stored: number;
  readonly skipped: number;
  /** Validations that failed after a `stale` or `miss`. */
  readonly failed: number;
  readonly evicted: number;
  /** `hits / lookups` */
  readonly hitRatio: number;
}

export interface BasicMemoizeStatsLoggerOptions {
  /** Number of lookups per logged window. Defaults to 1000. */
  readonly every?: number;
  /** Identifies the memoized validator in the log. */
  readonly name?: string;
  /** Logs a window. Defaults to logging `stats` as a JSON row with `console.log`. */
  readonly log?: (stats: MemoizeStats) => void;
}

function logJson(stats: MemoizeStats) {
  console.log(JSON.stringify(stats));
}

/**
 * Counts cache events and logs them as {@link MemoizeStats} every `every` lookups, by default as a
 * JSON row with `console.log`, e.g.
 *
 * ```json
 * {"name":"leg","lookups":1000,"hits":870,"stale":30,"misses":100,"stored":125,"skipped":0,"failed":5,"evicted":95,"hitRatio":0.87}
 * ```
 *
 * Counts are reset after each window, so each one describes the latest lookups. A window is logged
 * when the next lookup starts, so that it contains only complete operations; call `flush` to log a
 * partial window, e.g. on shutdown. Use one logger per memoized validator.
 */
export class BasicMemoizeStatsLogger implements MemoizeStatsLogger {
  private readonly every: number;
  private readonly name?: string;
  private readonly log: (stats: MemoizeStats) => void;
  private stats: MutableStats;

  constructor(options: BasicMemoizeStatsLoggerOptions = {}) {
    this.every = options.every ?? 1000;
    if (!Number.isInteger(this.every) || this.every < 1) {
      throw new Error(`every must be an integer >= 1, got ${this.every}`);
    }
    this.name = options.name;
    this.log = options.log ?? logJson;
    this.stats = this.newStats();
  }

  hit(): void {
    this.lookup();
    this.stats.hits++;
  }

  stale(): void {
    this.lookup();
    this.stats.stale++;
  }

  miss(): void {
    this.lookup();
    this.stats.misses++;
  }

  store(): void {
    this.stats.stored++;
  }

  skip(): void {
    this.stats.skipped++;
  }

  evict(): void {
    this.stats.evicted++;
  }

  /** Logs and resets the current window, unless it is empty. */
  flush(): void {
    const stats = this.stats;
    if (stats.lookups === 0) {
      return;
    }
    stats.failed = stats.stale + stats.misses - stats.stored - stats.skipped;
    stats.hitRatio = Math.round((stats.hits / stats.lookups) * 10000) / 10000;
    this.stats = this.newStats();
    this.log(stats);
  }

  private lookup() {
    if (this.stats.lookups >= this.every) {
      this.flush();
    }
    this.stats.lookups++;
  }

  /** All fields are created up front, so that the object's shape never changes. */
  private newStats(): MutableStats {
    return { name: this.name, lookups: 0, hits: 0, stale: 0, misses: 0, stored: 0, skipped: 0, failed: 0, evicted: 0, hitRatio: 0 };
  }
}

type MutableStats = { -readonly [P in keyof MemoizeStats]: MemoizeStats[P] };
