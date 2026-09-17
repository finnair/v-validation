import { Path } from '@finnair/path';
import { defaultViolations, FailureCallback, SuccessCallback, ValidationContext, Validator, violationsOf } from './validators.js';

export const DEFAULT_MEMOIZE_MAX_SIZE = 1000;

/**
 * Order in which entries are evicted once the cache is full.
 *
 * - `fifo` evicts in insertion order and never touches the cache on a hit, so a hit is a single
 *   lookup. The default: it is faster whenever the cache can hold most of the working set, which is
 *   the point of sizing `maxSize` (and narrowing `shouldCache`) so that eviction is rare.
 * - `lru` additionally re-inserts an entry on every hit to mark it most recently used, which keeps
 *   hot values alive at the cost of two extra `Map` operations per hit. Only worth it for a cache
 *   deliberately smaller than its working set over skewed input, where the better hit rate pays for
 *   the bookkeeping.
 */
export type MemoizeEvictionPolicy = 'fifo' | 'lru';

export interface MemoizeValidatorOptions<Out = unknown, In = unknown, K=In> {
  /**
   * Maximum number of input -> result entries to retain. When the cache grows past this, one entry
   * is evicted in {@link evictionPolicy} order. Defaults to {@link DEFAULT_MEMOIZE_MAX_SIZE}.
   */
  readonly maxSize?: number;

  /**
   * Which entry to evict when the cache is full. Defaults to `fifo`; see
   * {@link MemoizeEvictionPolicy} for when `lru` is worth its per-hit cost.
   */
  readonly evictionPolicy?: MemoizeEvictionPolicy;

  /**
   * Predicate deciding whether a successful result should be cached, given the converted `result`
   * and the original `value`. Return `false` to pass the result through without caching it - e.g. to
   * keep outliers (a date outside the last 24 hours) out of the cache so common values are not
   * evicted by rare ones. It runs only on a cache miss, after successful validation. Defaults to
   * caching every successful result.
   */
  readonly shouldCache?: (result: Out, value: In) => boolean;

  /**
   * Derives the cache key from the raw input, instead of using the input itself. The key must be a
   * primitive: keys are compared the way `Map` compares them, so a freshly built object is a new
   * key every time and never hits.
   *
   * This is what makes caching *objects* useful - an input object is otherwise keyed by identity,
   * so an equal-but-distinct object always misses. Keying by, say, id and version lets any copy of
   * a known version hit:
   *
   * ```ts
   * V.memoize(leg, { cacheKeyFn: (value: any) => `${value.id}:${value.version}` })
   * ```
   *
   * The key must identify the payload completely. Two inputs that share a key are the same value as
   * far as the cache is concerned, so the second one's result is discarded in favour of the first -
   * a payload that changes without its key changing serves stale results for as long as it is
   * cached. It runs on every validation, hit or miss, so keep it cheap.
   */
  readonly cacheKeyFn?: (value: undefined | In) => K;
}

/**
 * Wraps another validator and memoizes its successful results, keyed by the input value. A repeated
 * input is not re-validated: the earlier result is returned directly, so an input that converts to
 * an object (e.g. a Luxon `DateTime` parsed from an ISO string) yields the *same* instance every
 * time it is seen. For a synchronously validated DAG this also means a value shared across the graph
 * converts to one shared output instance.
 *
 * The cache is bounded and keyed by the raw input value - or by whatever `cacheKeyFn` derives from
 * it - so it works for primitive inputs (parsed
 * strings and numbers) as well as objects (by reference identity). It lives on the validator
 * instance and persists across `validate()` calls. `Map` iteration order is insertion order, so the
 * oldest live key is evicted first; under `lru` a cache hit re-inserts its key to mark it most
 * recently used (see {@link MemoizeEvictionPolicy}).
 *
 * An `undefined` result is not cached, which lets a hit be a single lookup rather than a
 * containment check followed by a read. Wrap the memoized validator rather than the other way round
 * - `V.optionalStrict(V.memoize(...))` - if undefined is an accepted input.
 *
 * Only successes are cached: a failure's violations carry the `path` at which the value appeared, so
 * replaying them elsewhere would report the wrong path, and the input might yet be valid in another
 * position. An optional `shouldCache` predicate can further exclude successful results from the
 * cache (e.g. outliers), so that rare values do not evict common ones. Memoization assumes the
 * wrapped validator is a pure function of its cache key - a validator whose result depends on the
 * active group or on `ValidatorOptions` should not be wrapped, since neither is part of the key.
 *
 * Only synchronous validators are supported. An asynchronous result settles after `validatePathV2`
 * returns, with no guarantee of when - or whether - the value becomes available, so it cannot be
 * cached or returned meaningfully. Wrapping an async validator fails with an `Async` violation.
 */
export class MemoizeValidator<Out = unknown, In = unknown, K = In> extends Validator<Out, In> {
  private readonly cache = new Map<K, Out>();
  /**
   * Cursor over the cache's keys, used to find the eviction victim. `Map` iterators are live and
   * advance in insertion order, so reusing one cursor visits each key at most once instead of
   * re-scanning the table from the front on every eviction - `keys().next()` has to skip the
   * entries deleted by earlier evictions, which makes a fresh iterator per eviction cost
   * O(deleted) and the eviction path degrade with `maxSize`. Held in a mutable box because the
   * instance itself is frozen.
   */
  private readonly evictCursor: { it: Iterator<K> };
  readonly maxSize: number;
  private readonly shouldCache?: (result: Out, value: In) => boolean;
  private readonly cacheKeyFn: (value: undefined | In) => K;
  /** True for `lru`; kept as a boolean so the hit path tests a flag rather than compares strings. */
  private readonly refreshOnHit: boolean;

  constructor(
    readonly validator: Validator<Out, In>,
    options: MemoizeValidatorOptions<Out, In, K> = {},
  ) {
    super();
    this.maxSize = options.maxSize ?? DEFAULT_MEMOIZE_MAX_SIZE;
    if (!Number.isInteger(this.maxSize) || this.maxSize < 1) {
      throw new Error(`maxSize must be an integer >= 1, got ${this.maxSize}`);
    }
    const evictionPolicy = options.evictionPolicy ?? 'fifo';
    if (evictionPolicy !== 'fifo' && evictionPolicy !== 'lru') {
      throw new Error(`evictionPolicy must be 'fifo' or 'lru', got ${evictionPolicy}`);
    }
    this.refreshOnHit = evictionPolicy === 'lru';
    this.shouldCache = options.shouldCache;
    this.cacheKeyFn = options.cacheKeyFn ?? ((input) => input as K);
    this.evictCursor = { it: this.cache.keys() };
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    const cache = this.cache;
    const key = this.cacheKeyFn(value);
    // An `undefined` result is never cached, so a plain `get` distinguishes a hit from a miss.
    const cached = cache.get(key);
    if (cached !== undefined) {
      if (this.refreshOnHit) {
        cache.delete(key);
        cache.set(key, cached);
      }
      return success(cached);
    }
    // `settled` records whether the wrapped validator has produced its outcome synchronously - via a
    // callback or by throwing. If it has not by the time the call returns, the validator is
    // asynchronous and unsupported (reported below). It also neutralizes a late async callback, so a
    // result that arrives after we have given up neither reaches the caller nor pollutes the cache.
    let settled = false;
    try {
      this.validator.validatePathV2(
        value,
        path,
        ctx,
        result => {
          if (settled) {
            return;
          }
          settled = true;
          if (result !== undefined && (this.shouldCache === undefined || this.shouldCache(result, value))) {
            cache.set(key, result);
            if (cache.size > this.maxSize) {
              this.evictOldest();
            }
          }
          success(result);
        },
        error => {
          if (settled) {
            return;
          }
          settled = true;
          failure(error);
        },
      );
    } catch (error) {
      // A validator may signal failure by throwing instead of calling `failure`. Route it through
      // the same failure callback. If it threw only after already settling (a misbehaving
      // validator), the outcome is already delivered, so ignore it rather than reporting twice.
      if (!settled) {
        settled = true;
        return failure(violationsOf(error, path));
      }
      return;
    }
    if (!settled) {
      // The wrapped validator did not settle synchronously, so it is asynchronous and unsupported.
      // Report it once, here; the `settled` guard above then discards the eventual async callback
      // rather than failing (or succeeding) a second time.
      settled = true;
      failure([defaultViolations.async(path)]);
    }
  }

  /**
   * Removes the oldest entry, which is the cursor's next key: entries are appended at the back, an
   * `lru` hit re-inserts its key there, and each eviction removes the key the cursor just returned,
   * so every live key sits at or after the cursor. Eviction only runs with more than `maxSize` (>= 1) entries cached, so
   * the cursor yields a key; it is only ever exhausted if that invariant is broken, and a fresh one
   * then restarts from the oldest key.
   */
  private evictOldest(): void {
    const cursor = this.evictCursor;
    let next = cursor.it.next();
    if (next.done) {
      cursor.it = this.cache.keys();
      next = cursor.it.next();
    }
    this.cache.delete(next.value as K);
  }

  skipUndefined(): boolean {
    return this.validator.skipUndefined();
  }
}
