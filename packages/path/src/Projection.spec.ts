import { describe, test, expect } from 'vitest'
import { projection, Projection } from './Projection.js';
import moment from 'moment';
import { PathMatcher, UnionMatcher } from './PathMatcher.js';
import { AnyProperty, AnyIndex, IndexMatcher, PathExpression, PropertyMatcher } from './matchers.js';
import { Path, PathComponent } from './Path.js';
import { JsonReplacer, JsonValue, jsonClone } from './jsonClone.js';
import { setOwnProperty } from './properties.js';

/** 
 * Test oracle: straightforward projection of a full JSON clone. Always paths are applied last and win over excludes. 
 * Keys are in input order, and objects and arrays that are not selected themselves are in the output only if something below them is.
 */
function referenceMap(input: any, includes: PathMatcher[] = [], excludes: PathMatcher[] = [], always: PathMatcher[] = [], replacer?: JsonReplacer): JsonValue {
  const allowGaps = [...includes, ...excludes, ...always].some(matcher => matcher.allowGaps);
  const safeInput = jsonClone(input, replacer);
  if (!includes.length && !excludes.length) {
    return safeInput;
  }
  if (typeof safeInput !== 'object' || safeInput === null) {
    // Nothing below a primitive can be selected
    const root = (matchers: PathMatcher[]) => matchers.some(matcher => !matcher.expressions.length);
    return root(always) || ((!includes.length || root(includes)) && !root(excludes)) ? safeInput : null;
  }
  const empty = () => (Array.isArray(safeInput) ? [] : {});
  const selected: Path[] = includes.length ? [] : [Path.ROOT];
  const select = (path: Path) => (selected.push(path), true);
  let output: any = includes.length ? empty() : jsonClone(safeInput);
  includes.forEach(matcher => matcher.find(safeInput, (path, value) => ((output = path.set(output, jsonClone(value))), select(path))));
  excludes.forEach(matcher => matcher.find(output, path => ((output = path.length ? path.unset(output) : null), true)));
  always.forEach(matcher => matcher.find(safeInput, (path, value) => ((output = path.set(output ?? empty(), jsonClone(value))), select(path))));
  output = withoutEmptyParents(output, Path.ROOT, selected) ?? (output === null ? null : empty());
  output = inInputOrder(output, safeInput);
  return allowGaps ? referenceRemoveGaps(output) : output;
}

function withoutEmptyParents(value: any, path: Path, selected: Path[]): any {
  if (!value || typeof value !== 'object' || selected.some(selectedPath => path.startsWith(selectedPath))) {
    return value;
  }
  if (Array.isArray(value)) {
    const result: any[] = [];
    value.forEach((item, index) => {
      const child = withoutEmptyParents(item, path.index(index), selected);
      if (child !== undefined) {
        result[index] = child;
      }
    });
    return result.length ? result : undefined;
  }
  const result = {};
  for (const key of Object.keys(value)) {
    const child = withoutEmptyParents(value[key], path.property(key), selected);
    if (child !== undefined) {
      setOwnProperty(result, key, child);
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function inInputOrder(output: any, input: any): any {
  if (Array.isArray(output)) {
    const result = new Array(output.length);
    for (const index of Object.keys(output)) {
      result[Number(index)] = inInputOrder(output[Number(index)], input[Number(index)]);
    }
    return result;
  }
  if (output && typeof output === 'object') {
    const result = {};
    for (const key of Object.keys(input)) {
      if (Object.hasOwn(output, key)) {
        setOwnProperty(result, key, inInputOrder(output[key], input[key]));
      }
    }
    return result;
  }
  return output;
}

function referenceRemoveGaps(value: any): any {
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      value = value.filter(item => item !== undefined).map(referenceRemoveGaps);
    } else {
      for (const key in value) {
        value[key] = referenceRemoveGaps(value[key]);
      }
    }
  }
  return value;
}

type Outcome = { value: JsonValue } | { error: string };

function outcome(fn: () => JsonValue): Outcome {
  try {
    return { value: fn() };
  } catch (error) {
    return { error: String(error) };
  }
}

/** Structural description that captures key order, array holes and prototypes, and tolerates own `constructor` keys. */
function shape(value: any): any {
  if (Array.isArray(value)) {
    return { array: value.length, entries: Object.entries(value).map(([key, item]) => [key, shape(item)]) };
  }
  if (typeof value === 'function') {
    return { function: value.name };
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype) {
      return { instance: proto?.constructor?.name ?? null, json: JSON.stringify(value) };
    }
    return { object: Object.keys(value).map(key => [key, shape(value[key])]) };
  }
  return { primitive: value };
}

/** Both implementations get a fresh input, as `always` + `removeGaps` may write into the raw input. */
function expectSameAsReference(makeInput: () => any, includes?: PathMatcher[], excludes?: PathMatcher[], always?: PathMatcher[], replacer?: JsonReplacer): Outcome {
  const actual = outcome(() => Projection.of(includes, excludes, always, replacer).map(makeInput()));
  const expected = outcome(() => referenceMap(makeInput(), includes, excludes, always, replacer));
  if ('value' in actual && 'value' in expected) {
    expect(shape(actual.value)).toStrictEqual(shape(expected.value));
  } else {
    expect(actual).toStrictEqual(expected);
  }
  return actual;
}

class Stringified {
  constructor(private readonly value: string) {}
  toJSON() {
    return `S:${this.value}`;
  }
}

class Wrapper {
  constructor(private readonly inner: any) {}
  toJSON() {
    return this.inner;
  }
}

class KeyDependent {
  toJSON(key: string) {
    return key === 'a' ? { a: `key:${key}`, b: [key] } : `key:${key}`;
  }
}

const sharedFunction = () => 'function';

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
    Object.freeze(obj);
    Object.freeze(obj.object);
    Object.freeze(obj.array);
    Object.freeze(obj.array[0]);
    Object.freeze(obj.array[1]);
    Object.freeze(obj.array[2]);

    test('Returns the a new object without includes and excludes', () => {
      const result = projection(undefined, [])(obj);
      expect(result).not.toBe(obj);
      expect(result).toEqual(obj);
    });

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
    
    test("always index does't leave gaps", () =>
      expect(projection([], [PathMatcher.of(AnyProperty)], [PathMatcher.of('array', 1, 'name')])(obj)).toEqual({
        array: [{ name: 'b' }],
      })
    );

    test("removing gaps retains nulls", () => {
      expect(projection([PathMatcher.of(UnionMatcher.of(1, 2))])([null, null, null, null])).toEqual([null, null]);
    })

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
      const m = moment();
      expect(projection([PathMatcher.of('moment', '_isUTC')])({ moment: m })).toEqual({
        // TODO: Should this be moment: m.toJSON()?
      });
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

    test('always included property', () => 
      expect(projection([PathMatcher.of('non-existing-property')], [PathMatcher.of(AnyProperty)], [PathMatcher.of('id')])(obj))
        .toEqual({ id: 'id' })
    );

    describe('primitive input', () => {
      test('toJSON => null', () => expect(projection()({ toJSON() { return null; } })).toBeNull());

      test('replacer => string', () => expect(projection(undefined, undefined, undefined, () => 'string')({})).toBe('string'));

      test('with excludes', () => {
        expect(projection([], [PathMatcher.of('a')])('string')).toBe('string');
        expect(projection([], [PathMatcher.of()])('string')).toBeNull();
      });

      test('with includes', () => {
        expect(projection([PathMatcher.of('a')])(5)).toBeNull();
        expect(projection([PathMatcher.of()])(5)).toBe(5);
        expect(projection([PathMatcher.of('a')], [], [PathMatcher.of()])(5)).toBe(5);
      });

      test('nothing selected from an object is an empty object', () => expect(projection([PathMatcher.of('a')])({ b: 1 })).toStrictEqual({}));

      test.each([
        ['undefined', undefined],
        ['function', () => 1],
        ['symbol', Symbol('symbol')],
      ])('input without JSON value: %s', (type, input) => {
        expect(() => projection()(input)).toThrow(new TypeError(`${type} value can't be serialized in JSON`));
        expect(() => projection([PathMatcher.of('a')])(input)).toThrow(new TypeError(`${type} value can't be serialized in JSON`));
      });

      test('bigint is converted only if it is in the output', () => {
        expect(projection([PathMatcher.of('a')])(1n)).toBeNull();
        expect(() => projection([], [PathMatcher.of('a')])(1n)).toThrow("BigInt value can't be serialized in JSON");
      });

      test('boxed and non-finite values', () => {
        expect(projection([PathMatcher.of('a')])({ a: Object('a'), b: NaN })).toStrictEqual({ a: 'a' });
        expect(projection([], [PathMatcher.of('a')])({ a: Object('a'), b: NaN, c: [Infinity] })).toStrictEqual({ b: null, c: [null] });
        expect(projection([PathMatcher.of('length')])(Object('string'))).toBeNull();
      });
    });

    describe('circular structure', () => {
      const circular = () => {
        const object: any = { id: 1, child: { name: 'child' } };
        object.child.parent = object;
        return object;
      };

      test('throws TypeError if it is in the output', () => {
        expect(() => projection()(circular())).toThrow(new TypeError('Converting circular structure to JSON'));
        expect(() => projection([PathMatcher.of('child')])(circular())).toThrow(new TypeError('Converting circular structure to JSON'));
        expect(() => projection([PathMatcher.of('child', 'parent', 'id')])(circular())).toThrow(new TypeError('Converting circular structure to JSON'));
      });

      test('is not converted if it is not in the output', () => {
        expect(projection([PathMatcher.of('id'), PathMatcher.of('child', 'name')])(circular())).toStrictEqual({ id: 1, child: { name: 'child' } });
        expect(projection([], [PathMatcher.of('child', 'parent')])(circular())).toStrictEqual({ id: 1, child: { name: 'child' } });
      });
    });

    describe('root include', () => {
      test('includes everything', () => expect(projection([PathMatcher.of()])(obj)).toEqual(obj));

      test('with other includes', () => expect(projection([PathMatcher.of('id'), PathMatcher.of()])(obj)).toEqual(obj));

      test('with exclude', () => {
        const { object, ...expected } = obj;
        expect(projection([PathMatcher.of()], [PathMatcher.of('object')])(obj)).toEqual(expected);
      });
    });

    describe('root exclude', () => {
      test('returns null', () => expect(projection([], [PathMatcher.of()])(obj)).toBeNull());

      test('returns null with includes', () => expect(projection([PathMatcher.of('id')], [PathMatcher.of()])(obj)).toBeNull());

      test('returns null for array input', () => expect(projection([], [PathMatcher.of()])([1, 2])).toBeNull());

      test('with always', () => expect(projection([PathMatcher.of('id')], [PathMatcher.of()], [PathMatcher.of('name')])(obj)).toStrictEqual({ name: 'name' }));

      test('with always of array input', () => expect(projection([], [PathMatcher.of()], [PathMatcher.of(1)])([1, 2])).toStrictEqual([2]));

      test('with root always', () => expect(projection([], [PathMatcher.of()], [PathMatcher.of()])(obj)).toStrictEqual(obj));
    });

    describe('null values', () => {
      test('include through null array element', () =>
        expect(projection([PathMatcher.of('array', AnyIndex, 'name')])({ array: [null, { name: 'b' }] })).toStrictEqual(
          projection([PathMatcher.of('array', AnyIndex, 'name')])({ array: [{}, { name: 'b' }] }),
        ));

      test('include through null property', () => expect(projection([PathMatcher.of('id'), PathMatcher.of('nil', 'x')])({ id: 'id', nil: null })).toEqual({ id: 'id' }));

      test('exclude through null array element', () =>
        expect(projection([], [PathMatcher.of('array', AnyIndex, 'name')])({ array: [null, { name: 'b', value: 1 }] })).toEqual({ array: [null, { value: 1 }] }));
    });

    describe('output keeps JSON types', () => {
      const input = { array: [1, 2], object: { 1: 'one', length: 2 } };

      test('any property of an array', () => expect(projection([PathMatcher.of('array', AnyProperty)])(input)).toStrictEqual({ array: [1, 2] }));

      test('array length is not a property', () => expect(projection([PathMatcher.of('array', 'length')])(input)).toStrictEqual({}));

      test('array index is not a property', () => expect(projection([PathMatcher.of('array', '1')])(input)).toStrictEqual({}));

      test('numeric property is not an index', () => expect(projection([PathMatcher.of('object', 1)])(input)).toStrictEqual({}));

      test('object properties named like array properties', () =>
        expect(projection([PathMatcher.of('object', UnionMatcher.of('1', 'length'))])(input)).toStrictEqual({ object: { 1: 'one', length: 2 } }));

      test('root array', () => {
        expect(projection([PathMatcher.of('1')])([1, 2])).toStrictEqual([]);
        expect(projection([PathMatcher.of(AnyProperty)])([1, 2])).toStrictEqual([1, 2]);
      });

      test('exclude of array index as property', () => expect(projection([], [PathMatcher.of('array', '0')])(input)).toStrictEqual(input));

      test('inherited properties are not accessible', () => {
        const inherited = () => Object.assign(Object.create({ inherited: 'i' }), { own: 'o' });
        expect(projection([PathMatcher.of('inherited'), PathMatcher.of('own')])(inherited())).toStrictEqual({ own: 'o' });
        expect(projection([PathMatcher.of(AnyProperty)])(inherited())).toStrictEqual({ own: 'o' });
        expect(projection([], [PathMatcher.of('own')])(inherited())).toStrictEqual({});
        expect(projection([PathMatcher.of('own')], [], [PathMatcher.of('inherited')])(inherited())).toStrictEqual({ own: 'o' });
      });
    });

    describe('always', () => {
      test('converts values to JSON', () =>
        expect(Projection.of([PathMatcher.of('id')], [], [PathMatcher.of('date')]).map({ id: 'id', date: new Date(0) })).toStrictEqual({
          id: 'id',
          date: '1970-01-01T00:00:00.000Z',
        }));

      test('cannot include fields from within a moment', () =>
        expect(projection([PathMatcher.of('id')], [], [PathMatcher.of('moment', '_isUTC')])({ id: 'id', moment: moment() })).toEqual({ id: 'id' }));

      test('applies replacer', () =>
        expect(
          Projection.of([PathMatcher.of('id')], [], [PathMatcher.of('secret')], (key, value) => (key === 'secret' ? undefined : value)).map({ id: 'id', secret: 'secret' }),
        ).toStrictEqual({ id: 'id' }));

      test('does not share objects with input', () => {
        const input = { id: 'id', object: { name: 'name' } };
        const result: any = Projection.of([PathMatcher.of('id')], [], [PathMatcher.of('object')]).map(input);
        expect(result).toEqual(input);
        expect(result.object).not.toBe(input.object);
      });

      test('does not modify input when removing gaps', () => {
        const array = [1, 2];
        const input = { id: 'id', list: [1], object: { array } };
        Projection.of([PathMatcher.of('list', 0)], [], [PathMatcher.of('object')]).map(input);
        expect(input.object.array).toBe(array);
      });

      test('works with frozen input when removing gaps', () => {
        const input = Object.freeze({ list: Object.freeze([1]), object: Object.freeze({ array: Object.freeze([1, 2]) }) });
        expect(Projection.of([PathMatcher.of('list', 0)], [], [PathMatcher.of('object')]).map(input)).toEqual({ list: [1], object: { array: [1, 2] } });
      });

      describe('with excludes', () => {
        test('converts values to JSON', () =>
          expect(Projection.of([], [PathMatcher.of('date')], [PathMatcher.of('date')]).map({ id: 'id', date: new Date(0) })).toStrictEqual({
            id: 'id',
            date: '1970-01-01T00:00:00.000Z',
          }));

        test('applies replacer', () =>
          expect(
            Projection.of([PathMatcher.of('id')], [PathMatcher.of('secret')], [PathMatcher.of('secret')], (key, value) => (key === 'secret' ? undefined : value)).map({
              id: 'id',
              secret: 'secret',
            }),
          ).toStrictEqual({ id: 'id' }));

        test('does not share objects with input', () => {
          const input = { id: 'id', object: { name: 'name' } };
          const result: any = Projection.of([PathMatcher.of('id')], [PathMatcher.of('object')], [PathMatcher.of('object')]).map(input);
          expect(result).toEqual(input);
          expect(result.object).not.toBe(input.object);
        });

        test('wins over exclude of a nested path', () =>
          expect(Projection.of([PathMatcher.of('id')], [PathMatcher.of('object', 'name')], [PathMatcher.of('object')]).map({ id: 'id', object: { name: 'name' } })).toStrictEqual({
            id: 'id',
            object: { name: 'name' },
          }));
      });
    });
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

    test('always included property', () => {
      const projection = Projection.of([PathMatcher.of('non-existing-property')], [PathMatcher.of(AnyProperty)], [PathMatcher.of('id')]);
      expect(projection.match(Path.of('id'))).toBe(true);
      expect(projection.match(Path.of('name'))).toBe(false);
    });

    test('ancestors of always paths match', () => {
      const projection = Projection.of([PathMatcher.of('id')], [PathMatcher.of('object')], [PathMatcher.of('object', 'name')]);
      expect(projection.match(Path.of('object'))).toBe(true);
      expect(projection.match(Path.of('object', 'name', 'first'))).toBe(true);
      expect(projection.match(Path.of('object', 'other'))).toBe(false);
      expect(projection.match(Path.of('other'))).toBe(false);
      expect(projection.match(Path.of('other', 'deeper', 0))).toBe(false);
      expect(projection.match(Path.of('id', 'deeper', 0))).toBe(true);
    });

    test('excluded root', () => {
      const projection = Projection.of([], [PathMatcher.of()], [PathMatcher.of('id')]);
      expect(projection.match(Path.of())).toBe(true);
      expect(projection.match(Path.of('id'))).toBe(true);
      expect(projection.match(Path.of('name'))).toBe(false);
    });
  });
});

describe('map equals reference implementation', () => {
  const P = PathMatcher.of;

  const input = () => ({
    id: 'id',
    name: 'name',
    object: { name: 'nested', deep: { x: 1, y: [1, 2] } },
    array: [
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
      { name: 'c', value: 3 },
    ],
    nested: [
      [1, 2],
      [3, [4, 5]],
    ],
    empty: {},
    emptyArray: [],
    nil: null,
    date: new Date(Date.UTC(2026, 0, 1)),
    stringified: new Stringified('x'),
    wrapper: new Wrapper({ inner: { v: 1 }, other: 2 }),
    keyed: { a: new KeyDependent(), b: new KeyDependent() },
    fn: sharedFunction,
    undef: undefined,
  });

  const multiplyNumbers: JsonReplacer = (key, value) => (typeof value === 'number' ? value * 10 : key === 'name' ? undefined : value);
  const replaceObject: JsonReplacer = (key, value) => (key === 'object' ? { replaced: true, name: 'replaced' } : value);
  const replaceWithHolder: JsonReplacer = function (this: any, key, value) {
    return Array.isArray(this) && typeof value === 'object' && value !== null ? { index: key, ...value } : value;
  };
  const startsWithA: PathExpression = {
    allowGaps: false,
    find: (current, callback) => {
      if (typeof current === 'object' && current !== null) {
        for (const key in current) {
          if (key.startsWith('a') && !callback(current[key], key)) {
            return false;
          }
        }
      }
      return true;
    },
    test: component => String(component).startsWith('a'),
    toString: () => '.a*',
  };

  const cases: [string, () => any, PathMatcher[], PathMatcher[]?, PathMatcher[]?, JsonReplacer?][] = [
    ['top-level property', input, [P('id')]],
    ['union of properties', input, [P(UnionMatcher.of('id', 'name'))]],
    ['any property', input, [P(AnyProperty)]],
    ['nested property', input, [P('object', 'deep', 'x')]],
    ['index', input, [P('array', 1, 'value')]],
    ['any index', input, [P('array', AnyIndex, 'name')]],
    ['union of indexes', input, [P('array', UnionMatcher.of(0, 2))]],
    ['nested arrays with any index', input, [P('nested', AnyIndex, 1)]],
    ['nested arrays with indexes', input, [P('nested', 1, 1, 0)]],
    ['pruned sibling index', input, [P('array', 2, 'name')]],
    ['overlapping includes', input, [P('object'), P('object', 'deep', 'x'), P(AnyProperty, 'deep')]],
    ['custom expression', input, [P(startsWithA, AnyIndex, 'name'), P('object', startsWithA)]],
    ['property and wildcard siblings', input, [P('array', 0, 'name'), P('array', AnyIndex, 'value'), P('array', '1'), P(AnyProperty, 2)]],
    ['include and exclude same subtree', input, [P('object')], [P('object', 'deep', 'y')]],
    ['exclude array element', input, [P('array')], [P('array', 1)]],
    ['exclude array tail', input, [P('array')], [P('array', 2)]],
    ['exclude array element with any index', input, [P('array', AnyIndex)], [P('array', AnyIndex, 'value')]],
    ['always outside includes', input, [P('id')], [], [P('name')]],
    ['always overrides exclude', input, [P('object')], [P('object', 'name')], [P('object', 'name')]],
    ['always converts value to JSON', input, [P('id')], [], [P('date')]],
    ['always with exclude', input, [P('id')], [P('object'), P('date')], [P('date'), P('object', 'deep')]],
    ['always with excludes only', input, [], [P('object'), P('date')], [P('object', 'name'), P('date')]],
    ['always wins over exclude of a nested path', input, [P('object')], [P('object', 'deep')], [P('object')]],
    ['exclude with always below', input, [], [P('object')], [P('object', 'deep', 'x')]],
    ['include with always outside includes below an exclude', input, [P('id')], [P('object')], [P('object', 'deep', 'y', 1)]],
    ['include with nested exclude', input, [P('id')], [P('object', 'deep')]],
    ['include parent and child', input, [P('object'), P('object', 'deep', 'x')]],
    ['include child and parent', input, [P('object', 'deep', 'x'), P('object')]],
    ['wildcard include with nested exclude', input, [P(AnyProperty)], [P('object', 'deep')]],
    ['exact include with wildcard exclude', input, [P('object', 'deep')], [P(AnyProperty, AnyProperty, 'x')]],
    ['include and exclude same property', input, [P('object', 'name')], [P('object', 'name')]],
    ['include and exclude same function property', input, [P('fn'), P('id')], [P('fn')]],
    ['include and exclude same array element', input, [P('array', 1)], [P('array', 1)]],
    ['include and exclude all array elements', input, [P('array', 2)], [P('array', AnyIndex)]],
    ['exclude array elements within include', input, [P('array', AnyIndex, 'name')], [P('array', 0)]],
    ['missing include below existing property', input, [P('object', 'missing')]],
    ['include below primitive', input, [P('id', 'x'), P('object', 'name', 'x')]],
    ['exclude below primitive', input, [P('id')], [P('id', 'x')]],
    ['always with exclude and replacer', input, [P('array', 0)], [P('object')], [P('object', 'deep'), P('array', AnyIndex)], multiplyNumbers],
    ['toJSON at root', () => new Wrapper(input()), [P('id'), P('object', 'deep')]],
    ['toJSON at intermediate node', input, [P('wrapper', 'inner', 'v')]],
    ['toJSON at leaf', input, [P('stringified'), P('date')]],
    ['cannot descend into toJSON leaf', input, [P('date', 'getTime'), P('stringified', 'value')]],
    ['key dependent toJSON', input, [P('keyed', 'a', 'b', 0), P('keyed', 'b')]],
    ['key dependent toJSON with any property', input, [P('keyed', AnyProperty)]],
    ['function replacer', input, [P('array', AnyIndex), P('object', 'deep')], [], [], multiplyNumbers],
    ['function replacer replaces intermediate node', input, [P('object', 'name')], [], [], replaceObject],
    ['function replacer uses holder', input, [P('array', 1), P('nested', 0)], [], [], replaceWithHolder],
    ['function replacer at root', input, [P('id')], [], [], (key, value) => (key === '' ? { id: 'replaced' } : value)],
    ['array replacer', input, [P('array', AnyIndex, AnyProperty), P('id'), P('object')], [], [], ['array', 'name', 'id', 'object', 'deep', 0]],
    ['array replacer with wildcard', input, [P(AnyProperty, 'name')], [], [], ['id', 'object', 'name']],
    ['array replacer with duplicate keys', input, [P(AnyProperty)], [], [], ['name', 'id', 'name']],
    ['empty object and arrays', input, [P('empty'), P('emptyArray'), P('emptyArray', 0)]],
    ['null leaf', input, [P('nil')]],
    ['matching through null', input, [P('nil', 'x')]],
    ['function and undefined values', input, [P('fn'), P('undef')]],
    ['array length', input, [P('array', 'length'), P('nested', AnyIndex, 'length')]],
    ['zero-expression include', input, [P()]],
    ['zero-expression include mixed with others', input, [P('id'), P()]],
    ['zero-expression include with exclude', input, [P()], [P('object')]],
    ['zero-expression exclude', input, [P('id'), P('name')], [P()]],
    ['zero-expression exclude with always', input, [P('id')], [P()], [P('name')]],
    ['zero-expression always with exclude', input, [P('id')], [P('object')], [P()]],
    ['primitive root with exclude', () => 'string', [], [P('a')]],
    ['excluded primitive root', () => 'string', [], [P()]],
    ['primitive root with include', () => 5, [P('a')]],
    ['primitive root with root include', () => true, [P(), P('a')]],
    ['null root with root always', () => null, [P('a')], [], [P()]],
    ['primitive root by toJSON', () => new Stringified('root'), [P('a')], [], [P()]],
    ['root array', () => [{ a: 1 }, { b: 2 }, [3]], [P(1), P(AnyIndex, 'a')]],
    ['root array with union of indexes', () => [{ a: 1 }, { b: 2 }, [3]], [P(UnionMatcher.of(0, 2))]],
    ['root array with property', () => [{ a: 1 }, { b: 2 }], [P('length'), P('1', 'b')]],
    ['numeric keys', () => ({ 1: { x: 1 }, arr: [{ x: 1 }, { x: 2 }] }), [P(1, 'x'), P('arr', '1', 'x')]],
    ['union of number and string', () => ({ 1: { x: 1 }, arr: [{ x: 1 }, { x: 2 }] }), [P(UnionMatcher.of(1, 'arr'), UnionMatcher.of(1, 'x'))]],
    ['inherited enumerable property', () => Object.assign(Object.create({ inherited: { x: 1 } }), { own: 1 }), [P('inherited', 'x'), P('own')]],
    ['__proto__ and constructor keys', () => JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1},"a":1}'), [P('__proto__'), P('constructor', 'x')]],
    ['__proto__ nested path', () => JSON.parse('{"__proto__":{"polluted":true,"other":1}}'), [P('__proto__', 'polluted')]],
    ['__proto__ with any property', () => JSON.parse('{"a":{"__proto__":{"polluted":true}}}'), [P(AnyProperty, AnyProperty, 'polluted')]],
  ];

  test.each(cases)('%s', (_name, makeInput, includes, excludes, always, replacer) => {
    expectSameAsReference(makeInput, includes, excludes, always, replacer);
  });

  test('root array keeps included indexes only', () => {
    expect(Projection.of([P(UnionMatcher.of(0, 2))]).map([{ a: 1 }, { b: 2 }, [3]])).toStrictEqual([{ a: 1 }, [3]]);
  });

  test('prototype pollution guard is preserved', () => {
    const result: any = Projection.of([P('__proto__', 'polluted')]).map(JSON.parse('{"__proto__":{"polluted":true,"other":1}}'));
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as any).polluted).toBeUndefined();
    expect(JSON.stringify(result)).toBe('{"__proto__":{"polluted":true}}');
  });

  describe('subtrees that cannot be in the output are not converted to JSON', () => {
    test('bigint outside includes does not throw', () => {
      expect(Projection.of([P('a')]).map({ a: 1, b: 2n, c: [3n] })).toStrictEqual({ a: 1 });
      expect(() => Projection.of([P('b')]).map({ a: 1, b: 2n })).toThrow("BigInt value can't be serialized in JSON");
    });

    test('bigint inside excludes does not throw', () => {
      expect(Projection.of([], [P('b'), P('c', 0)]).map({ a: 1, b: 2n, c: [3n, 4] })).toStrictEqual({ a: 1, c: [4] });
      expect(Projection.of([P('b')], [P('b', 'x')]).map({ a: 1, b: { x: 2n, y: 3 } })).toStrictEqual({ b: { y: 3 } });
    });

    test('toJSON and replacer are not called for excluded paths', () => {
      const toJSONKeys: string[] = [];
      const tracked = { toJSON: (key: string) => (toJSONKeys.push(key), key) };
      expect(Projection.of([], [P('a'), P('c', AnyIndex)], [P('c', 1)]).map({ a: tracked, b: tracked, c: [tracked, tracked] })).toStrictEqual({
        b: 'b',
        c: ['1'],
      });
      expect(toJSONKeys).toEqual(['b', '1']);
    });

    test('toJSON and replacer are called only for included paths and their ancestors', () => {
      const toJSONKeys: string[] = [];
      const replacerKeys: string[] = [];
      const tracked = { toJSON: (key: string) => (toJSONKeys.push(key), { value: key }) };
      const input = { a: { x: tracked, y: tracked }, b: tracked, c: [tracked, tracked] };
      const replacer = (key: string, value: any) => (replacerKeys.push(key), value);

      expect(Projection.of([P('a', 'x'), P('c', 1)], [], [], replacer).map(input)).toStrictEqual({ a: { x: { value: 'x' } }, c: [{ value: '1' }] });
      expect(toJSONKeys).toEqual(['x', '1']);
      expect(replacerKeys).toEqual(['', 'a', 'x', 'value', 'c', '1', 'value']);
    });
  });

  describe('randomized', () => {
    function random(seed: number) {
      return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const keys = ['a', 'b', 'c', 'd', '1', 'length'];
    const indexes = [0, 1, 2, 3];

    function generate(rnd: () => number) {
      const int = (n: number) => Math.floor(rnd() * n);
      const pick = <T>(items: T[]): T => items[int(items.length)];

      function value(depth: number): any {
        const r = depth >= 4 ? 0.5 + rnd() * 0.5 : rnd();
        if (r < 0.3) {
          const obj: any = {};
          for (const key of keys) {
            if (rnd() < 0.5) {
              obj[key] = value(depth + 1);
            }
          }
          return obj;
        }
        if (r < 0.5) {
          return Array.from({ length: int(5) }, () => value(depth + 1));
        }
        if (r < 0.55) {
          return new Wrapper(value(depth + 1));
        }
        if (r < 0.58) {
          return new KeyDependent();
        }
        return pick<any>(['x', 1, 0, true, false, null, undefined, sharedFunction, new Date(Date.UTC(2026, 0, 1)), new Stringified('y')]);
      }

      function expression(): PathExpression {
        const r = rnd();
        if (r < 0.35) return new PropertyMatcher(pick(keys));
        if (r < 0.5) return new IndexMatcher(pick(indexes));
        if (r < 0.65) return UnionMatcher.of(pick<PathComponent>([...keys, ...indexes]), pick<PathComponent>([...keys, ...indexes]), pick<PathComponent>(keys));
        if (r < 0.8) return AnyIndex;
        return AnyProperty;
      }

      function matchers(min: number, max: number) {
        return Array.from({ length: min + int(max - min + 1) }, () => PathMatcher.of(...Array.from({ length: rnd() < 0.03 ? 0 : 1 + int(4) }, expression)));
      }

      const replacers: (JsonReplacer | undefined)[] = [
        undefined,
        undefined,
        undefined,
        (key, value) => (key === 'c' ? undefined : typeof value === 'number' ? value + 1 : value),
        ['a', 'b', 1, 'length'],
      ];
      const root = rnd() < 0.8 ? Object.fromEntries(keys.map(key => [key, value(1)])) : Array.from({ length: 1 + int(4) }, () => value(1));
      return { root, includes: matchers(rnd() < 0.1 ? 0 : 1, 3), excludes: matchers(0, 2), always: matchers(0, 1), replacer: pick(replacers) };
    }

    test('1000 random inputs and projections', () => {
      let succeeded = 0;
      for (let seed = 1; seed <= 1000; seed++) {
        const { includes, excludes, always, replacer } = generate(random(seed));
        const result = expectSameAsReference(() => generate(random(seed)).root, includes, excludes, always, replacer);
        if ('value' in result) {
          succeeded++;
        }
      }
      // Guard against the generator mostly producing inputs where both implementations throw
      expect(succeeded).toBeGreaterThan(800);
    });
  });
});
