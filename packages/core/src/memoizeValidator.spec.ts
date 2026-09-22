import { describe, test, expect } from 'vitest';
import { Path } from '@finnair/path';
import { V } from './V.js';
import { defaultViolations, Validator } from './validators.js';
import { DEFAULT_MEMOIZE_MAX_SIZE } from './memoizeValidator.js';
import { Groups, ValidatorConfigurationError } from './validators.js';

const ROOT = Path.ROOT;

describe('MemoizeValidator', () => {
  // A validator that counts how many times it actually runs and returns a fresh object each time,
  // so a cache hit is observable both as an unchanged count and as an identical output reference.
  const counting = () => {
    const state = { calls: 0 };
    const validator = V.fn((value: any) => {
      state.calls++;
      return { value };
    });
    return { state, validator };
  };

  test('validates a repeated input only once and returns the same result reference', async () => {
    const { state, validator } = counting();
    const memo = V.memoize(validator);

    const first = (await memo.validate('x')).getValue();
    const second = (await memo.validate('x')).getValue();

    expect(state.calls).toBe(1);
    expect(second).toBe(first);
    expect(first).toEqual({ value: 'x' });
  });

  test('validates distinct inputs separately', async () => {
    const { state, validator } = counting();
    const memo = V.memoize(validator);

    await memo.validate('x');
    await memo.validate('y');
    await memo.validate('x');

    expect(state.calls).toBe(2);
  });

  test('memoizes parsed values so a primitive input maps to one shared instance', async () => {
    // Stand-in for a Vluxon parse: an ISO-like string converted to an object.
    const memo = V.memoize(V.fn((value: string) => ({ parsedFrom: value })));

    const a = (await memo.validate('2026-09-11')).getValue();
    const b = (await memo.validate('2026-09-11')).getValue();

    expect(b).toBe(a);
  });

  test('does not cache an undefined result, so it re-validates', async () => {
    // Skipping undefined lets a hit be a single lookup. The result is still correct; only the
    // wrapped validator runs again. Wrap from the outside - V.optionalStrict(V.memoize(...)) - when
    // undefined is an accepted input.
    let calls = 0;
    const memo = V.memoize(
      V.fn(() => {
        calls++;
        return undefined;
      }),
    );

    expect((await memo.validate('x')).getValue()).toBeUndefined();
    expect((await memo.validate('x')).getValue()).toBeUndefined();
    expect(calls).toBe(2);
  });

  test('an uncached undefined result does not disturb the entries around it', async () => {
    let calls = 0;
    const memo = V.memoize(
      V.fn((value: any) => {
        calls++;
        return value === 'skip' ? undefined : { value };
      }),
    );

    expect((await memo.validate('skip')).getValue()).toBeUndefined();
    const kept = (await memo.validate('keep')).getValue();
    expect((await memo.validate('skip')).getValue()).toBeUndefined();

    expect((await memo.validate('keep')).getValue()).toBe(kept);
    // 'skip' ran twice (never cached), 'keep' once.
    expect(calls).toBe(3);
  });

  test('does not cache failures', async () => {
    let calls = 0;
    const memo = V.memoize(
      V.fn(() => {
        calls++;
        throw new Error('always fails');
      }),
    );

    const first = await memo.validate('x');
    const second = await memo.validate('x');

    expect(first.isSuccess()).toBe(false);
    expect(second.isSuccess()).toBe(false);
    expect(calls).toBe(2);
  });

  test('a synchronously validated DAG converts a shared value to one shared output instance', async () => {
    // Interface is needed since the tree structure is recursive and TypeScript requires a named type for self-references.
    interface Tree {
      name: string;
      left?: Tree;
      right?: Tree;
    }
    const tree: Validator<Tree> = V.memoize(
      V.objectType()
        .properties({
          name: V.string(),
          left: V.optionalStrict(V.proxy(() => tree)),
          right: V.optionalStrict(V.proxy(() => tree)),
        })
        .build(),
    );

    const shared = { name: 'shared' };
    const result: any = await tree.getValid({ name: 'root', left: shared, right: shared });

    expect(result.left).toEqual({ name: 'shared' });
    expect(result.left).toBe(result.right);
  });

  describe('eviction', () => {
    // Distinct inputs only, so both policies evict the same entry; per-policy behaviour on a hit is
    // covered under 'evictionPolicy'.
    test('evicts the oldest entry past maxSize', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { maxSize: 2 });

      await memo.validate('a'); // [a]
      await memo.validate('b'); // [a, b]
      await memo.validate('c'); // [b, c] - 'a' evicted
      expect(state.calls).toBe(3);

      await memo.validate('a'); // miss: re-validated
      expect(state.calls).toBe(4);

      await memo.validate('c'); // still cached
      expect(state.calls).toBe(4);
    });

    test('keeps evicting correctly well past maxSize', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { maxSize: 3 });

      for (let i = 0; i < 50; i++) {
        await memo.validate(`v${i}`);
      }
      expect(state.calls).toBe(50);

      // Only the last three remain.
      await memo.validate('v49');
      await memo.validate('v48');
      await memo.validate('v47');
      expect(state.calls).toBe(50);

      await memo.validate('v46');
      expect(state.calls).toBe(51);
    });
  });

  describe('resetCache', () => {
    test('empties the cache, so a repeated input is validated again', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator);

      await memo.validate('x');
      await memo.validate('x');
      expect(state.calls).toBe(1);

      memo.resetCache();

      await memo.validate('x');
      expect(state.calls).toBe(2);
    });

    test('the cache works again afterwards', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator);

      await memo.validate('x');
      memo.resetCache();

      const first = (await memo.validate('x')).getValue();
      const second = (await memo.validate('x')).getValue();

      expect(state.calls).toBe(2);
      expect(second).toBe(first);
    });

    test('a result held from before the reset is not the one served after it', async () => {
      const memo = V.memoize(V.fn((value: any) => ({ value })));

      const before = (await memo.validate('x')).getValue();
      memo.resetCache();
      const after = (await memo.validate('x')).getValue();

      expect(after).not.toBe(before);
      expect(after).toEqual(before);
    });

    test('eviction still works after a reset', async () => {
      // The eviction cursor is live when clear() runs, which permanently exhausts it, so a reset
      // has to replace it or eviction would fall back to rebuilding one every time.
      const { state, validator } = counting();
      const memo = V.memoize(validator, { maxSize: 2 });

      await memo.validate('a');
      await memo.validate('b');
      memo.resetCache();

      await memo.validate('c');
      await memo.validate('d');
      await memo.validate('e'); // 'c' evicted
      expect(state.calls).toBe(5);

      await memo.validate('d'); // still cached
      await memo.validate('e'); // still cached
      expect(state.calls).toBe(5);

      await memo.validate('c'); // evicted, so re-validated
      expect(state.calls).toBe(6);
    });

    test('lru recency is tracked again after a reset', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { maxSize: 2, evictionPolicy: 'lru' });

      await memo.validate('a');
      memo.resetCache();

      await memo.validate('a');
      await memo.validate('b');
      await memo.validate('a'); // hit -> 'a' becomes most recent
      expect(state.calls).toBe(3);

      await memo.validate('c'); // evicts 'b'
      await memo.validate('a'); // survived
      expect(state.calls).toBe(4);
    });

    test('resetting an empty cache is a no-op', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator);

      memo.resetCache();
      memo.resetCache();

      expect((await memo.validate('x')).isSuccess()).toBe(true);
      expect(state.calls).toBe(1);
    });

    test('leaves the rest of the configuration alone', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { maxSize: 2, shouldCache: result => (result.value as string) !== 'skip' });

      await memo.validate('skip');
      await memo.validate('skip');
      expect(state.calls).toBe(2);

      memo.resetCache();

      // shouldCache and maxSize still apply.
      await memo.validate('skip');
      await memo.validate('skip');
      expect(state.calls).toBe(4);
      expect((memo as any).cache.size).toBe(0);
    });
  });

  describe('options', () => {
    // Options can change what a validator produces, and they are not part of the cache key, so a
    // result cached under one set must not be served under another.
    const groups = new Groups();
    const g1 = groups.define('g1');
    const g2 = groups.define('g2');

    test('accepts the options it was pinned to', async () => {
      const memo = V.memoize(V.string(), { options: { group: g1 } });

      expect((await memo.validate('x', { group: g1 })).isSuccess()).toBe(true);
    });

    test('rejects a different group', async () => {
      const memo = V.memoize(V.string(), { options: { group: g1 } });

      await expect(memo.validate('x', { group: g2 })).rejects.toThrow(ValidatorConfigurationError);
      await expect(memo.validate('x')).rejects.toThrow(/Unsupported validator options/);
    });

    test('pinning nothing accepts only a validation that passes nothing', async () => {
      const memo = V.memoize(V.string());

      expect((await memo.validate('x')).isSuccess()).toBe(true);
      await expect(memo.validate('x', { group: g1 })).rejects.toThrow(ValidatorConfigurationError);
      await expect(memo.validate('x', { ignoreUnknownProperties: true })).rejects.toThrow(ValidatorConfigurationError);
    });

    test('compares the ignore flags leniently, so an explicit false equals an omitted one', async () => {
      const memo = V.memoize(V.string(), {
        options: { ignoreUnknownProperties: false, ignoreUnknownEnumValues: false },
      });

      expect((await memo.validate('x')).isSuccess()).toBe(true);
      expect((await memo.validate('x', {})).isSuccess()).toBe(true);
      await expect(memo.validate('x', { ignoreUnknownProperties: true })).rejects.toThrow(ValidatorConfigurationError);
    });

    test('accepts each pinned ignore flag when it matches', async () => {
      const memo = V.memoize(V.string(), { options: { ignoreUnknownProperties: true, ignoreUnknownEnumValues: true } });

      expect((await memo.validate('x', { ignoreUnknownProperties: true, ignoreUnknownEnumValues: true })).isSuccess()).toBe(true);
      await expect(memo.validate('x', { ignoreUnknownProperties: true })).rejects.toThrow(ValidatorConfigurationError);
    });

    test('ignores warnLogger, which cannot change the result', async () => {
      const memo = V.memoize(V.string(), { options: {} });

      expect((await memo.validate('x', { warnLogger: () => {} })).isSuccess()).toBe(true);
    });

    test('the mismatch propagates from a nested position', async () => {
      const parent = V.object({ properties: { a: V.memoize(V.string(), { options: { group: g1 } }) } });

      await expect(parent.validate({ a: 'x' }, { group: g2 })).rejects.toThrow(ValidatorConfigurationError);
    });

    test('getValid reports it as the configuration error too, not a ValidationError', async () => {
      const memo = V.memoize(V.string(), { options: { group: g1 } });

      await expect(memo.getValid('x', { group: g2 })).rejects.toThrow(ValidatorConfigurationError);
    });

    test('nothing is cached under the wrong options', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { options: { group: g1 } });

      await expect(memo.validate('x', { group: g2 })).rejects.toThrow(ValidatorConfigurationError);
      expect(state.calls).toBe(0);

      expect((await memo.validate('x', { group: g1 })).isSuccess()).toBe(true);
      expect(state.calls).toBe(1);
    });
  });

  describe('cacheKeyFn', () => {
    test('defaults to keying by the input value itself', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator);

      await memo.validate('a');
      await memo.validate('a');
      await memo.validate('b');

      expect(state.calls).toBe(2);
    });

    test('keys by a derived value, so distinct inputs sharing a key hit the cache', async () => {
      const { state, validator } = counting();
      // The motivating case: an object cached by id and version rather than by identity.
      const memo = V.memoize(validator, { cacheKeyFn: (value: any) => `${value.id}:${value.version}` });

      const first = (await memo.validate({ id: 'a', version: 1, payload: 'x' })).getValue();
      // A different object, but the same id and version - served from cache.
      const second = (await memo.validate({ id: 'a', version: 1, payload: 'y' })).getValue();

      expect(state.calls).toBe(1);
      expect(second).toBe(first);
    });

    test('a changed key misses, so a new version is re-validated', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { cacheKeyFn: (value: any) => `${value.id}:${value.version}` });

      await memo.validate({ id: 'a', version: 1 });
      await memo.validate({ id: 'a', version: 2 });
      await memo.validate({ id: 'b', version: 1 });
      expect(state.calls).toBe(3);

      await memo.validate({ id: 'a', version: 1 });
      expect(state.calls).toBe(3);
    });

    test('a stale key returns the earlier result: the key must identify the payload', async () => {
      // Documented consequence of keying by a derived value - two payloads sharing a key are the
      // same as far as the cache is concerned, so a mutation without a version bump serves stale.
      const memo = V.memoize(
        V.fn((value: any) => ({ name: value.name })),
        { cacheKeyFn: (value: any) => value.id },
      );

      expect((await memo.validate({ id: 1, name: 'original' })).getValue()).toEqual({ name: 'original' });
      expect((await memo.validate({ id: 1, name: 'changed' })).getValue()).toEqual({ name: 'original' });
    });

    test('without a key function, distinct objects never hit - identity is the key', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator);

      await memo.validate({ id: 'a' });
      await memo.validate({ id: 'a' });

      expect(state.calls).toBe(2);
    });

    test('is called for hits as well as misses', async () => {
      const keys: unknown[] = [];
      const memo = V.memoize(
        V.fn((value: any) => ({ value })),
        {
          cacheKeyFn: (value: any) => {
            keys.push(value);
            return value.id;
          },
        },
      );

      await memo.validate({ id: 'a' });
      await memo.validate({ id: 'a' });

      expect(keys).toHaveLength(2);
    });

    test('receives the raw input while shouldCache receives the converted result', async () => {
      const seen: Array<[unknown, unknown]> = [];
      const memo = V.memoize(
        V.fn((value: any) => ({ converted: value.id })),
        {
          cacheKeyFn: (value: any) => value.id,
          shouldCache: (result, value) => {
            seen.push([result, value]);
            return true;
          },
        },
      );

      const input = { id: 'a' };
      const result = (await memo.validate(input)).getValue();

      expect(seen).toEqual([[result, input]]);
    });

    test('eviction and lru recency use the derived key', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, {
        maxSize: 2,
        evictionPolicy: 'lru',
        cacheKeyFn: (value: any) => value.id,
      });

      await memo.validate({ id: 'a' });
      await memo.validate({ id: 'b' });
      await memo.validate({ id: 'a' }); // hit by key -> 'a' becomes most recent
      expect(state.calls).toBe(2);

      await memo.validate({ id: 'c' }); // evicts 'b'
      expect(state.calls).toBe(3);

      await memo.validate({ id: 'a' }); // survived
      expect(state.calls).toBe(3);

      await memo.validate({ id: 'b' }); // evicted
      expect(state.calls).toBe(4);
    });

    test('KNOWN LIMITATION: a key function returning a fresh object never hits', async () => {
      // Map keys are compared by identity, so a derived key must be a primitive.
      const { state, validator } = counting();
      const memo = V.memoize(validator, { cacheKeyFn: (value: any) => ({ id: value.id }) as any });

      await memo.validate({ id: 'a' });
      await memo.validate({ id: 'a' });

      expect(state.calls).toBe(2);
    });

    test('handles an undefined input', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { cacheKeyFn: value => (value === undefined ? 'none' : (value as any).id) });

      await memo.validate(undefined as any);
      await memo.validate(undefined as any);

      expect(state.calls).toBe(1);
    });
  });

  describe('evictionPolicy', () => {
    test('defaults to fifo: a hit does not protect an entry from eviction', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { maxSize: 2 });

      await memo.validate('a'); // [a]
      await memo.validate('b'); // [a, b]
      await memo.validate('a'); // hit, but recency is not tracked -> still [a, b]
      expect(state.calls).toBe(2);

      await memo.validate('c'); // [b, c] - 'a' evicted despite the hit
      expect(state.calls).toBe(3);

      await memo.validate('a'); // miss
      expect(state.calls).toBe(4);
    });

    test('lru: a hit refreshes recency so the hit entry survives', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { maxSize: 2, evictionPolicy: 'lru' });

      await memo.validate('a'); // [a]
      await memo.validate('b'); // [a, b]
      await memo.validate('a'); // hit -> [b, a]
      expect(state.calls).toBe(2);

      await memo.validate('c'); // [a, c] - 'b' evicted, 'a' survived
      expect(state.calls).toBe(3);

      await memo.validate('a'); // still cached
      expect(state.calls).toBe(3);
    });

    test('fifo evicts in insertion order', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator, { maxSize: 2, evictionPolicy: 'fifo' });

      await memo.validate('a');
      await memo.validate('b');
      await memo.validate('c'); // 'a' evicted
      await memo.validate('b'); // still cached
      expect(state.calls).toBe(3);
      await memo.validate('a'); // re-validated
      expect(state.calls).toBe(4);
    });

    test('rejects an unknown policy', () => {
      expect(() => V.memoize(V.string(), { evictionPolicy: 'mru' as any })).toThrow();
    });
  });

  describe('shouldCache', () => {
    test('caches only results the predicate accepts, so rejected ones re-validate', async () => {
      const { state, validator } = counting();
      // Cache only even-valued inputs; odd inputs pass through uncached.
      const memo = V.memoize(validator, { shouldCache: result => (result.value as number) % 2 === 0 });

      await memo.validate(2); // cached
      await memo.validate(2); // hit
      expect(state.calls).toBe(1);

      await memo.validate(3); // not cached
      await memo.validate(3); // re-validated
      expect(state.calls).toBe(3);
    });

    test('receives both the converted result and the original input', async () => {
      const seen: Array<[unknown, unknown]> = [];
      const memo = V.memoize(
        V.fn((value: string) => ({ parsedFrom: value })),
        {
          shouldCache: (result, value) => {
            seen.push([result, value]);
            return true;
          },
        },
      );

      const result = (await memo.validate('x')).getValue();
      expect(seen).toEqual([[result, 'x']]);
    });
  });

  describe('asynchronous validators are rejected', () => {
    const asyncPassthrough = () => {
      const state = { calls: 0 };
      const validator = V.fn((value: any) => {
        state.calls++;
        return Promise.resolve({ value });
      });
      return { state, validator };
    };

    test('fails validation with an async-not-supported error rather than caching', async () => {
      const { state, validator } = asyncPassthrough();
      const memo = V.memoize(validator);

      const result = await memo.validate('x');

      expect(result.isSuccess()).toBe(false);
      expect(result.getViolations()).toEqual([defaultViolations.async(ROOT)]);
      expect(state.calls).toBe(1);
    });

    test('does not cache the late async result: every attempt re-validates and fails', async () => {
      const { state, validator } = asyncPassthrough();
      const memo = V.memoize(validator);

      expect((await memo.validate('x')).isSuccess()).toBe(false);
      // Let the abandoned microtask run before the second attempt.
      await Promise.resolve();
      expect((await memo.validate('x')).isSuccess()).toBe(false);

      expect(state.calls).toBe(2);
    });

    test('an async validator that eventually rejects is still rejected up front and its late failure is ignored', async () => {
      let calls = 0;
      const memo = V.memoize(
        V.fn(() => {
          calls++;
          return Promise.reject(new Error('rejected later'));
        }),
      );

      const result = await memo.validate('x');
      // Let the abandoned rejection microtask run; it must be a harmless no-op.
      await Promise.resolve();

      expect(result.isSuccess()).toBe(false);
      expect(result.getViolations()).toEqual([defaultViolations.async(ROOT)]);
      expect(calls).toBe(1);
    });

    test('routes a synchronous throw from the wrapped validator through the failure callback (not the async path)', async () => {
      class Throwing extends Validator<any> {
        calls = 0;
        validatePathV2(): void {
          this.calls++;
          throw new Error('boom');
        }
      }
      const throwing = new Throwing();
      const memo = V.memoize(throwing);

      const first = await memo.validate('x');
      const second = await memo.validate('x');

      expect(first.isSuccess()).toBe(false);
      expect(second.isSuccess()).toBe(false);
      // Reported as the thrown error, not as an Async violation, and never cached (re-validated).
      expect(first.getViolations()[0].type).toBe('Error');
      expect(throwing.calls).toBe(2);
    });

    test('ignores a throw that happens after the validator already settled', async () => {
      // A misbehaving validator that delivers a result and then throws: the settled outcome wins and
      // the spurious throw is swallowed rather than reported a second time.
      class SettleThenThrow extends Validator<any> {
        validatePathV2(value: any, path: any, ctx: any, success: any): void {
          success(value);
          throw new Error('after settle');
        }
      }
      const memo = V.memoize(new SettleThenThrow());

      const first = await memo.validate('x');
      const second = await memo.validate('x');

      expect(first.isSuccess()).toBe(true);
      expect(first.getValue()).toBe('x');
      expect(second.getValue()).toBe('x'); // cached from the successful settle
    });

    test('surfaces as a violation at the property path when nested, without crashing', async () => {
      const parent = V.objectType()
        .properties({ when: V.memoize(V.fn((value: any) => Promise.resolve(value))) })
        .build();

      const result = await parent.validate({ when: 'x' });

      expect(result.isSuccess()).toBe(false);
      expect(result.getViolations()).toEqual([defaultViolations.async(Path.of('when'))]);
    });
  });

  describe('options', () => {
    test('defaults to DEFAULT_MEMOIZE_MAX_SIZE', async () => {
      const { state, validator } = counting();
      const memo = V.memoize(validator);

      for (let i = 0; i < DEFAULT_MEMOIZE_MAX_SIZE; i++) {
        await memo.validate(`v${i}`);
      }
      const callsAfterFill = state.calls;
      await memo.validate('v0'); // still within the default window, so cached

      expect(callsAfterFill).toBe(DEFAULT_MEMOIZE_MAX_SIZE);
      expect(state.calls).toBe(DEFAULT_MEMOIZE_MAX_SIZE);
    });

    test('rejects a non-positive or non-integer maxSize', () => {
      expect(() => V.memoize(V.string(), { maxSize: 0 })).toThrow();
      expect(() => V.memoize(V.string(), { maxSize: -1 })).toThrow();
      expect(() => V.memoize(V.string(), { maxSize: 1.5 })).toThrow();
    });
  });

  test('evicts from a fresh cursor if the eviction cursor is exhausted', async () => {
    // The cursor cannot run out while the invariant in evictOldest holds, so force the state to
    // check the fallback still evicts exactly one entry rather than letting the cache grow.
    const { state, validator } = counting();
    const memo = V.memoize(validator, { maxSize: 2 });

    await memo.validate('a');
    await memo.validate('b');
    (memo as any).evictCursor.it = new Map().keys();

    await memo.validate('c');

    expect((memo as any).cache.size).toBe(2);
    expect(state.calls).toBe(3);
    // 'a' was the oldest, so it is the one dropped.
    await memo.validate('c');
    expect(state.calls).toBe(3);
  });

  test('delegates skipUndefined to the wrapped validator', () => {
    const wrappedFalse = V.string();
    const wrappedTrue = V.optionalStrict(V.string());

    expect(V.memoize(wrappedFalse).skipUndefined()).toBe(wrappedFalse.skipUndefined());
    expect(V.memoize(wrappedTrue).skipUndefined()).toBe(wrappedTrue.skipUndefined());
  });
});
