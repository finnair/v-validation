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
  private lookups = 0;
  private hits = 0;
  private stales = 0;
  private misses = 0;
  private stored = 0;
  private skipped = 0;
  private evicted = 0;

  constructor(options: BasicMemoizeStatsLoggerOptions = {}) {
    this.every = options.every ?? 1000;
    if (!Number.isInteger(this.every) || this.every < 1) {
      throw new Error(`every must be an integer >= 1, got ${this.every}`);
    }
    this.name = options.name;
    this.log = options.log ?? logJson;
  }

  hit(): void {
    this.lookup();
    this.hits++;
  }

  stale(): void {
    this.lookup();
    this.stales++;
  }

  miss(): void {
    this.lookup();
    this.misses++;
  }

  store(): void {
    this.stored++;
  }

  skip(): void {
    this.skipped++;
  }

  evict(): void {
    this.evicted++;
  }

  /** Logs and resets the current window, unless it is empty. */
  flush(): void {
    if (this.lookups === 0) {
      return;
    }
    const stats: MemoizeStats = {
      name: this.name,
      lookups: this.lookups,
      hits: this.hits,
      stale: this.stales,
      misses: this.misses,
      stored: this.stored,
      skipped: this.skipped,
      failed: this.stales + this.misses - this.stored - this.skipped,
      evicted: this.evicted,
      hitRatio: Math.round((this.hits / this.lookups) * 10000) / 10000,
    };
    this.lookups = this.hits = this.stales = this.misses = this.stored = this.skipped = this.evicted = 0;
    this.log(stats);
  }

  private lookup() {
    if (this.lookups >= this.every) {
      this.flush();
    }
    this.lookups++;
  }
}
