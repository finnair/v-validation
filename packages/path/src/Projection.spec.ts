import { describe, test, expect } from 'vitest'
import { projection, Projection } from './Projection.js';
import moment from 'moment';
import { PathMatcher, UnionMatcher } from './PathMatcher.js';
import { AnyProperty, AnyIndex } from './matchers.js';
import { Path } from './Path.js';

describe('project', () => {
  describe('map', () => {
    const obj = {
      id: 'id',
      name: 'name',
      object: {
        name: 'nested',
      },
      array: [
        {
          name: 'a',
          value: 123,
        },
        {
          name: 'b',
          value: 456,
        },
        {
          name: 'c',
          value: 789,
        },
      ],
    };

    test('Returns original object without includes or excludes', () => expect(projection(undefined, [])(obj)).toBe(obj));

    test('Returns a clone with include', () => expect(projection([PathMatcher.of(AnyProperty)], undefined)(obj)).not.toBe(obj));

    test('Returns a clone with exclude', () => expect(projection(undefined, [PathMatcher.of('foo')])(obj)).not.toBe(obj));

    test('exclude', () => {
      // Compare JSON rountrip to normalize undefined values
      expect(projection([], [PathMatcher.of('name'), PathMatcher.of('array', AnyIndex, 'value'), PathMatcher.of('object')])(obj)).toEqual({
        id: 'id',
        array: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      });
    });

    test('include', () => {
      expect(projection([PathMatcher.of('id'), PathMatcher.of('array', AnyIndex, 'name')])(obj)).toEqual({
        id: 'id',
        array: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      });
    });

    test("include index does't leave gaps", () => expect(projection([PathMatcher.of('array', 1, 'value')])(obj)).toEqual({ array: [{ value: 456 }] }));

    test("exclude index does't leave gaps", () =>
      expect(projection([PathMatcher.of('array')], [PathMatcher.of('array', 1), PathMatcher.of('array', AnyIndex, 'name')])(obj)).toEqual({
        array: [{ value: 123 }, { value: 789 }],
      }));

    test('include only array', () => {
      expect(projection([PathMatcher.of('array')])(obj)).toEqual({
        array: [
          { name: 'a', value: 123 },
          { name: 'b', value: 456 },
          { name: 'c', value: 789 },
        ],
      });
    });

    test('cannot include fields from within a moment', () => {
      expect(projection([PathMatcher.of('moment', '_isUTC')])({ moment: moment() })).toEqual({});
    });

    test('excludes should not create an empty object', () =>
      expect(projection([], [PathMatcher.of(AnyProperty), PathMatcher.of('object', 'name')])(obj)).toEqual({}));

    test('include properties', () => {
      expect(projection([PathMatcher.of('id'), PathMatcher.of('name')])(obj)).toEqual({
        id: 'id',
        name: 'name',
      });
    });

    test('include union of indexes should', () =>
      expect(projection([PathMatcher.of('array', new UnionMatcher([0, 2]))])(obj)).toEqual({
        array: [
          {
            name: 'a',
            value: 123,
          },
          {
            name: 'c',
            value: 789,
          },
        ],
      }));

    test('include union of properties', () =>
      expect(projection([PathMatcher.of(new UnionMatcher(['id', 'name']))])(obj)).toEqual({
        id: 'id',
        name: 'name',
      }));

    test('projection of PathMatcher instance', () => expect(projection([PathMatcher.of('foo')])).toBeDefined());

    test('object is not valid PathMatcher', () => expect(() => projection([{} as any])).toThrow());
  });

  describe('match', () => {
    test('everything matches if there are no includes or excludes', () => {
      const projection = Projection.of();
      expect(projection.match(Path.of())).toBe(true);
      expect(projection.match(Path.of('property'))).toBe(true);
      expect(projection.match(Path.of(1))).toBe(true);
    });

    test('includes partial match', () => {
      const projection = Projection.of([PathMatcher.of(1), PathMatcher.of('property')]);
      expect(projection.match(Path.of())).toBe(true);
      expect(projection.match(Path.of('property'))).toBe(true);
      expect(projection.match(Path.of('property', 'nested'))).toBe(true);
      expect(projection.match(Path.of(1))).toBe(true);
      expect(projection.match(Path.of(1, 2))).toBe(true);
    });

    test("doesn't include sibling path", () => {
      const projection = Projection.of([PathMatcher.of('property', 'nested')]);
      expect(projection.match(Path.of('property', 'nested2'))).toBe(false);
    });

    test('excludes by prefix', () => {
      const projection = Projection.of([], [PathMatcher.of('property2'), PathMatcher.of('property', 'nested')]);
      expect(projection.match(Path.of('property', 'nested'))).toBe(false);
      expect(projection.match(Path.of('property', 'nested', 0))).toBe(false);
      expect(projection.match(Path.of('property', 'nested2'))).toBe(true);
      expect(projection.match(Path.of('property'))).toBe(true);
      expect(projection.match(Path.of('property2'))).toBe(false);
      expect(projection.match(Path.of('property2', 0))).toBe(false);
      expect(projection.match(Path.of('anything other'))).toBe(true);
    });

    test('include & exclude', () => {
      const projection = Projection.of([PathMatcher.of('property'), PathMatcher.of(1)], [PathMatcher.of(1, 0), PathMatcher.of('property', 'nested')]);
      expect(projection.match(Path.of())).toBe(true);
      expect(projection.match(Path.of('property', 'nested'))).toBe(false);
      expect(projection.match(Path.of('property', 'nested2'))).toBe(true);
      expect(projection.match(Path.of('property'))).toBe(true);
      expect(projection.match(Path.of('property2'))).toBe(false);

      expect(projection.match(Path.of(0))).toBe(false);
      expect(projection.match(Path.of(1))).toBe(true);
      expect(projection.match(Path.of(1, 0))).toBe(false);
      expect(projection.match(Path.of(1, 1))).toBe(true);
    });
  });
});
