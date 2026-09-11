import { describe, test, expect } from 'vitest';
import { Path } from '@finnair/path';
import { ValidationContext } from './validators.js';

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
