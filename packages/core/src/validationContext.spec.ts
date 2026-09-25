import { describe, test, expect } from 'vitest';
import { Path } from '@finnair/path';
import { Groups, ValidationContext, ValidatorOptions } from './validators.js';
import { V } from './V.js';

/**
 * Unit tests for ValidationContext's path-scoped cycle detection, driving enterValidation and
 * leaveValidation directly. A cycle-detecting enterValidation (returns true) has no side effect,
 * so it can be used to probe which paths are currently guarded without mutating state. The single
 * -> array promotion and the array branches are exercised explicitly.
 */
describe('ValidationContext cycle detection', () => {
  const context = () => new ValidationContext({});
  const left = Path.of('left');
  const right = Path.of('right');
  const middle = Path.of('middle');

  describe('single-path entry', () => {
    test('a fresh object is not a cycle', () => {
      expect(context().enterValidation({}, left)).toBe(false);
    });

    test('re-entering as a descendant is a cycle', () => {
      const ctx = context();
      const obj = {};
      expect(ctx.enterValidation(obj, left)).toBe(false);
      expect(ctx.enterValidation(obj, left.property('x'))).toBe(true);
    });

    test('the same object at the same path is not a cycle (allOf/anyOf/oneOf)', () => {
      const ctx = context();
      const obj = {};
      expect(ctx.enterValidation(obj, left)).toBe(false);
      expect(ctx.enterValidation(obj, left)).toBe(false);
    });

    test('leave deletes the entry so the object can be entered again', () => {
      const ctx = context();
      const obj = {};
      ctx.enterValidation(obj, left);
      ctx.leaveValidation(obj, left);
      expect(ctx.enterValidation(obj, left.property('x'))).toBe(false);
    });
  });

  describe('promotion to an array of paths', () => {
    test('a second concurrent, non-descendant path promotes and both branches guard descendants', () => {
      const ctx = context();
      const obj = {};
      expect(ctx.enterValidation(obj, left)).toBe(false);
      expect(ctx.enterValidation(obj, right)).toBe(false); // promote to [left, right]
      expect(ctx.enterValidation(obj, left.property('x'))).toBe(true); // matches entry 0
      expect(ctx.enterValidation(obj, right.property('y'))).toBe(true); // matches entry 1 (scans past 0)
    });

    test('a further non-descendant path is pushed onto the array and then guards its descendants', () => {
      const ctx = context();
      const obj = {};
      ctx.enterValidation(obj, left);
      ctx.enterValidation(obj, right); // [left, right]
      expect(ctx.enterValidation(obj, middle)).toBe(false); // array branch, no match -> push
      expect(ctx.enterValidation(obj, middle.property('z'))).toBe(true);
    });
  });

  describe('leaving array entries', () => {
    test('leave removes only the settled path, leaving siblings guarded', () => {
      const ctx = context();
      const obj = {};
      ctx.enterValidation(obj, left);
      ctx.enterValidation(obj, right); // [left, right]
      ctx.leaveValidation(obj, left); // array branch: found, spliced, length 1 remains
      expect(ctx.enterValidation(obj, right.property('y'))).toBe(true); // right still guarded
      expect(ctx.enterValidation(obj, left.property('x'))).toBe(false); // left no longer guarded
    });

    test('leaving every path empties and deletes the entry, so re-entry starts clean', () => {
      const ctx = context();
      const obj = {};
      ctx.enterValidation(obj, left);
      ctx.enterValidation(obj, right); // [left, right]
      ctx.leaveValidation(obj, left); // [right]
      ctx.leaveValidation(obj, right); // empty -> delete
      // Back to a single-path entry: a plain re-entry is not a cycle, but its descendant is.
      expect(ctx.enterValidation(obj, middle)).toBe(false);
      expect(ctx.enterValidation(obj, middle.property('z'))).toBe(true);
    });

    test('leave with a path not in the array is a no-op', () => {
      const ctx = context();
      const obj = {};
      ctx.enterValidation(obj, left);
      ctx.enterValidation(obj, right); // [left, right]
      ctx.leaveValidation(obj, middle); // not present: findIndex -> -1, nothing removed
      expect(ctx.enterValidation(obj, left.property('x'))).toBe(true);
      expect(ctx.enterValidation(obj, right.property('y'))).toBe(true);
    });
  });

  test('leaving an object that was never entered is a no-op', () => {
    expect(() => context().leaveValidation({}, left)).not.toThrow();
  });
});

/**
 * `ValidatorOptions` declares every field `readonly`, so mutating one was always a type error.
 * `ValidationContext` freezes the object it is given, which makes that contract hold at runtime
 * too - and keeps a memoized validator's pinned options from drifting out from under its cache.
 */
describe('ValidationContext option immutability', () => {
  test('freezes the options object it is given', () => {
    const options: ValidatorOptions = { ignoreUnknownProperties: true };

    new ValidationContext(options);

    expect(Object.isFrozen(options)).toBe(true);
  });

  test('keeps the same object, rather than freezing a copy', () => {
    // A memoized validator compares `ctx.options` by identity as its fast path, so the context must
    // expose the very object it was given.
    const options: ValidatorOptions = {};

    const ctx = new ValidationContext(options);

    expect(ctx.options).toBe(options);
  });

  test('a declared-readonly field cannot be written at runtime either', () => {
    const options = { ignoreUnknownProperties: true } as { ignoreUnknownProperties?: boolean };

    new ValidationContext(options);

    expect(() => {
      options.ignoreUnknownProperties = false;
    }).toThrow(TypeError);
    expect(options.ignoreUnknownProperties).toBe(true);
  });

  test('accepts an already frozen options object', () => {
    const options = Object.freeze<ValidatorOptions>({ ignoreUnknownEnumValues: true });

    const ctx = new ValidationContext(options);

    expect(ctx.options).toBe(options);
    expect(ctx.options.ignoreUnknownEnumValues).toBe(true);
  });

  test('nothing reachable through the options is left mutable', () => {
    // Object.freeze does not recurse, but it does not need to here: the only object an option can
    // hold is a Group, which freezes itself. The other fields are booleans and a function.
    const groups = new Groups();
    const group = groups.define('group');
    const options: ValidatorOptions = { group };

    new ValidationContext(options);

    expect(Object.isFrozen(options)).toBe(true);
    expect(Object.isFrozen(options.group)).toBe(true);
  });
});

describe('Validator entry points freeze the options they are given', () => {
  test("validate() freezes the caller's options", async () => {
    const options: ValidatorOptions = { ignoreUnknownProperties: true };

    await V.string().validate('x', options);

    expect(Object.isFrozen(options)).toBe(true);
  });

  test("getValid() freezes the caller's options", async () => {
    const options: ValidatorOptions = { ignoreUnknownProperties: true };

    await V.string().getValid('x', options);

    expect(Object.isFrozen(options)).toBe(true);
  });

  test('a failed validation freezes them just the same', async () => {
    const options: ValidatorOptions = { ignoreUnknownProperties: true };

    expect((await V.string().validate(123 as any, options)).isSuccess()).toBe(false);

    expect(Object.isFrozen(options)).toBe(true);
  });

  test('the same options object can be reused across validations', async () => {
    const options: ValidatorOptions = { ignoreUnknownProperties: true };

    expect((await V.string().validate('x', options)).isSuccess()).toBe(true);
    expect((await V.string().validate('y', options)).isSuccess()).toBe(true);
    expect(await V.string().getValid('z', options)).toBe('z');
  });

  test('omitting options is unaffected', async () => {
    expect(await V.string().getValid('x')).toBe('x');
    expect((await V.string().validate('x')).isSuccess()).toBe(true);
  });

  test('validateGroup() builds its own options object, leaving the caller nothing to be frozen', async () => {
    const groups = new Groups();
    const group = groups.define('group');

    expect((await V.string().validateGroup('x', group)).isSuccess()).toBe(true);

    // The group was already immutable before any validation - see the group immutability tests.
    expect(group.includes('group')).toBe(true);
  });
});
