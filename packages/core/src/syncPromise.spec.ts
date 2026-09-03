import { describe, test, expect } from 'vitest';
import { Path } from '@finnair/path';
import { V } from './V.js';
import { SyncPromise, ValidationContext } from './validators.js';

describe('SyncPromise', () => {
  test('invokes the handler synchronously when already settled', () => {
    const seen: number[] = [];
    new SyncPromise<number>(resolve => resolve(1)).then(value => seen.push(value));
    expect(seen).toEqual([1]);
  });

  test('invokes the handler when settled later', () => {
    const seen: number[] = [];
    let settle!: (value: number) => void;
    new SyncPromise<number>(resolve => {
      settle = resolve;
    }).then(value => seen.push(value));

    expect(seen).toEqual([]);
    settle(2);
    expect(seen).toEqual([2]);
  });

  test('rejects to the failure handler', () => {
    const seen: string[] = [];
    new SyncPromise<number>((_resolve, reject) => reject(new Error('nope'))).then(
      () => seen.push('resolved'),
      error => seen.push(error.message),
    );
    expect(seen).toEqual(['nope']);
  });

  test('rejects to the failure handler when rejected later', () => {
    const seen: string[] = [];
    let fail!: (error: any) => void;
    new SyncPromise<number>((_resolve, reject) => {
      fail = reject;
    }).then(
      () => seen.push('resolved'),
      error => seen.push(error.message),
    );
    fail(new Error('later'));
    expect(seen).toEqual(['later']);
  });

  test('settling twice is ignored', () => {
    const seen: number[] = [];
    new SyncPromise<number>((resolve, reject) => {
      resolve(1);
      expect(() => resolve(2)).toThrow(/already settled/);
      expect(() => reject(new Error('ignored'))).toThrow(/already settled/);
    }).then(
      value => seen.push(value),
      () => seen.push(-1),
    );
    expect(seen).toEqual([1]);
  });

  test('settling after delivery throws', () => {
    const seen: number[] = [];
    let settle!: (value: number) => void;
    const promise = new SyncPromise<number>(resolve => {
      settle = resolve;
    });
    promise.then(value => seen.push(value));
    settle(1);
    expect(() => settle(2)).toThrow(/already settled/);
    expect(seen).toEqual([1]);
  });

  test('a second subscriber throws instead of being silently dropped', () => {
    const settled = new SyncPromise<number>(resolve => resolve(1));
    settled.then(() => {});
    expect(() => settled.then(() => {})).toThrow(/single subscriber/);

    const pending = new SyncPromise<number>(() => {});
    pending.then(() => {});
    expect(() => pending.then(() => {})).toThrow(/single subscriber/);
  });

  test('SyncPromise.resolve is already fulfilled', () => {
    const seen: number[] = [];
    SyncPromise.resolve(5).then(value => seen.push(value));
    expect(seen).toEqual([5]);
  });

  test('SyncPromise.reject is already rejected', () => {
    const seen: string[] = [];
    SyncPromise.reject<number>(new Error('nope')).then(
      () => seen.push('resolved'),
      error => seen.push(error.message),
    );
    expect(seen).toEqual(['nope']);
  });

  test('factory results are awaitable and single-subscriber like any other', async () => {
    expect(await SyncPromise.resolve('x')).toBe('x');
    await expect(Promise.resolve(SyncPromise.reject<string>(new Error('bad')))).rejects.toThrow('bad');

    const settled = SyncPromise.resolve(1);
    settled.then(() => {});
    expect(() => settled.then(() => {})).toThrow(/single subscriber/);
  });

  test('a SyncPromise built without an executor never settles', async () => {
    const never = new SyncPromise<number>();
    const outcome = await Promise.race([Promise.resolve(never).then(() => 'settled'), new Promise(resolve => setTimeout(() => resolve('pending'), 20))]);
    expect(outcome).toBe('pending');
  });

  test('is awaitable, and Promise.resolve gives a chainable Promise', async () => {
    expect(await new SyncPromise<number>(resolve => resolve(3))).toBe(3);

    const chained = await Promise.resolve(new SyncPromise<number>(resolve => resolve(4))).then(value => value * 10);
    expect(chained).toBe(40);

    await expect(Promise.resolve(new SyncPromise<number>((_resolve, reject) => reject(new Error('boom'))))).rejects.toThrow('boom');
  });
});

describe('public API returns real Promises', () => {
  const validator = V.string();

  test('validate', () => {
    const result = validator.validate('value');
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  test('getValid', () => {
    const result = validator.getValid('value');
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  test('validateGroup', () => {
    const result = validator.validateGroup('value', V.string() as any);
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  test('validatePath returns a SyncPromise - an internal PromiseLike, not a Promise', () => {
    const result = validator.validatePath('value', Path.ROOT, new ValidationContext({}));
    expect(result).toBeInstanceOf(SyncPromise);
    expect(result).not.toBeInstanceOf(Promise);
    // Still awaitable, which is all PromiseLike promises.
    return expect(Promise.resolve(result)).resolves.toEqual('value');
  });
});
