import { Path } from '@finnair/path';
import { defaultViolations, FailureCallback, SuccessCallback, ValidationContext, Validator, violationsOf } from './validators.js';

export const DEFAULT_MEMOIZE_MAX_SIZE = 1000;

export interface MemoizeValidatorOptions<Out = unknown, In = unknown> {
  /**
   * Maximum number of input -> result entries to retain. When the cache grows past this, the
   * least-recently-used entry is evicted. Defaults to {@link DEFAULT_MEMOIZE_MAX_SIZE}.
   */
  readonly maxSize?: number;

  /**
   * Predicate deciding whether a successful result should be cached, given the converted `result`
   * and the original `value`. Return `false` to pass the result through without caching it - e.g. to
   * keep outliers (a date outside the last 24 hours) out of the cache so common values are not
   * evicted by rare ones. It runs only on a cache miss, after successful validation. Defaults to
   * caching every successful result.
   */
  readonly shouldCache?: (result: Out, value: In) => boolean;
}

/**
 * Wraps another validator and memoizes its successful results, keyed by the input value. A repeated
 * input is not re-validated: the earlier result is returned directly, so an input that converts to
 * an object (e.g. a Luxon `DateTime` parsed from an ISO string) yields the *same* instance every
 * time it is seen. For a synchronously validated DAG this also means a value shared across the graph
 * converts to one shared output instance.
 *
 * The cache is a bounded LRU keyed by the raw input value, so it works for primitive inputs (parsed
 * strings and numbers) as well as objects (by reference identity). It lives on the validator
 * instance and persists across `validate()` calls. `Map` iteration order is insertion order, so the
 * oldest live key is evicted first and a cache hit re-inserts its key to mark it most recently used.
 *
 * Only successes are cached: a failure's violations carry the `path` at which the value appeared, so
 * replaying them elsewhere would report the wrong path, and the input might yet be valid in another
 * position. An optional `shouldCache` predicate can further exclude successful results from the
 * cache (e.g. outliers), so that rare values do not evict common ones. Memoization assumes the
 * wrapped validator is a pure function of its input - a validator whose result depends on the active
 * group or on `ValidatorOptions` should not be wrapped, since the cache key is the input alone.
 *
 * Only synchronous validators are supported. An asynchronous result settles after `validatePathV2`
 * returns, with no guarantee of when - or whether - the value becomes available, so it cannot be
 * cached or returned meaningfully. Wrapping an async validator fails with an `Async` violation.
 */
export class MemoizeValidator<Out = unknown, In = unknown> extends Validator<Out, In> {
  private readonly cache = new Map<In, Out>();
  /**
   * Cursor over the cache's keys, used to find the eviction victim. `Map` iterators are live and
   * advance in insertion order, so reusing one cursor visits each key at most once instead of
   * re-scanning the table from the front on every eviction - `keys().next()` has to skip the
   * entries deleted by earlier evictions, which makes a fresh iterator per eviction cost
   * O(deleted) and the eviction path degrade with `maxSize`. Held in a mutable box because the
   * instance itself is frozen.
   */
  private readonly evictCursor: { it: Iterator<In> };
  readonly maxSize: number;
  private readonly shouldCache?: (result: Out, value: In) => boolean;

  constructor(
    readonly validator: Validator<Out, In>,
    options: MemoizeValidatorOptions<Out, In> = {},
  ) {
    super();
    this.maxSize = options.maxSize ?? DEFAULT_MEMOIZE_MAX_SIZE;
    if (!Number.isInteger(this.maxSize) || this.maxSize < 1) {
      throw new Error(`maxSize must be an integer >= 1, got ${this.maxSize}`);
    }
    this.shouldCache = options.shouldCache;
    this.evictCursor = { it: this.cache.keys() };
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    const cache = this.cache;
    if (cache.has(value)) {
      const result = cache.get(value)!;
      cache.delete(value);
      cache.set(value, result);
      return success(result);
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
          if (this.shouldCache === undefined || this.shouldCache(result, value)) {
            cache.set(value, result);
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
   * Removes the least recently used entry, which is the cursor's next key: a hit re-inserts its key
   * at the back and each eviction removes the key the cursor just returned, so every live key sits
   * at or after the cursor. Eviction only runs with more than `maxSize` (>= 1) entries cached, so
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
    this.cache.delete(next.value as In);
  }

  skipUndefined(): boolean {
    return this.validator.skipUndefined();
  }
}
