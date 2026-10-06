import { describe, test, expect, vi } from 'vitest';
import { Path } from '@finnair/path';
import { Diff, DiffConfig, Patch } from './Diff.js';

const strictOptionalProperties: DiffConfig = { filter: () => true, includeObjects: true };

describe('Diff.patch', () => {
  const object: any = {
    string: 'string',
    undefined: undefined,
    object: { number: 1 },
    array: [1, { boolean: true }],
  };

  test('new string value', () => expect(Diff.patch(undefined, 'string')).toEqual([{ path: Path.ROOT, value: 'string' }]));

  test('new object value', () => expect(Diff.patch(undefined, object)).toEqual([{ path: Path.ROOT, value: object }]));

  test('removed value', () => expect(Diff.patch(object, undefined)).toEqual([{ path: Path.ROOT }]));

  test('no changes', () => expect(Diff.patch(object, structuredClone(object))).toEqual([]));

  test('nested modification', () => {
    const clone = structuredClone(object);
    delete clone.object;
    clone.array[1].boolean = false;
    clone.array[1].newProp = 'newProp';

    expect(Diff.patch(object, clone)).toEqual([
      { path: Path.of('object') },
      { path: Path.of('array', 1, 'boolean'), value: false },
      { path: Path.of('array', 1, 'newProp'), value: 'newProp' },
    ]);
    expect(new Diff().patch(clone, object)).toEqual([
      { path: Path.of('array', 1, 'boolean'), value: true },
      { path: Path.of('array', 1, 'newProp') },
      { path: Path.of('object'), value: { number: 1 } },
    ]);
  });

  test('applied on top of a concurrently modified version', () => {
    const base = { id: 1, name: 'base', tags: ['a'], details: { color: 'red', size: 1 } };
    const client = { ...structuredClone(base), name: 'client', details: { color: 'blue', size: 1 } };
    const latest = { ...structuredClone(base), tags: ['a', 'b'], details: { color: 'red', size: 2 } };

    const merged = Diff.patch(base, client).reduce((value: any, patch) => patch.path.set(value, patch.value), structuredClone(latest));

    expect(merged).toEqual({ id: 1, name: 'client', tags: ['a', 'b'], details: { color: 'blue', size: 2 } });
  });
});

describe('Diff.applyPatch', () => {
  const oldValue = () => ({
    id: 1,
    name: 'old',
    tags: ['a', 'b', 'c'],
    details: { color: 'red', size: 1 },
    removed: { nested: true },
    kept: { deep: { value: 1 } },
  });
  const newValue = () => ({
    id: 1,
    name: 'new',
    tags: ['a', 'c'],
    details: { color: 'blue', size: 1, added: [1] },
    kept: { deep: { value: 1 } },
    created: { value: 'created' },
  });

  describe.each([false, true])('clone: %s', clone => {
    test('turns the old value into the new one', () => {
      const result = Diff.applyPatch(oldValue(), Diff.patch(oldValue(), newValue()), { clone });
      expect(result).toEqual(newValue());
      expect(Object.keys(result)).toEqual(['id', 'name', 'tags', 'details', 'kept', 'created']);
    });

    test('replaces the root', () => {
      expect(Diff.applyPatch({ a: 1 }, [{ path: Path.ROOT, value: [1] }], { clone })).toEqual([1]);
    });

    test('removes the root', () => {
      expect(Diff.applyPatch({ a: 1 }, [{ path: Path.ROOT }], { clone })).toBeUndefined();
    });

    test('creates missing parents', () => {
      expect(Diff.applyPatch({}, [{ path: Path.of('a', 0, 'b'), value: 1 }], { clone })).toEqual({ a: [{ b: 1 }] });
    });

    test('applies nested patches in order', () => {
      const patches = [
        { path: Path.of('a', 'b'), value: 1 },
        { path: Path.of('a'), value: { c: 2 } },
        { path: Path.of('a', 'd'), value: 3 },
      ];
      expect(Diff.applyPatch({ a: { x: 0 } }, patches, { clone })).toEqual({ a: { c: 2, d: 3 } });
    });
  });

  test('modifies the input in place by default', () => {
    const input: any = oldValue();
    const details = input.details;
    const result = Diff.applyPatch(input, Diff.patch(oldValue(), newValue()));
    expect(result).toBe(input);
    expect(result.details).toBe(details);
    expect(input).toEqual(newValue());
  });

  test('clone leaves the input untouched, shares nothing with it and inserts patch values as is', () => {
    const input: any = oldValue();
    const patches = Diff.patch(oldValue(), newValue());
    const result = Diff.applyPatch(input, patches, { clone: true });

    expect(input).toEqual(oldValue());
    expect(result.kept).not.toBe(input.kept);
    expect(result.kept.deep).not.toBe(input.kept.deep);
    expect(result.created).toBe(patches.find(patch => patch.path.equals(Path.of('created')))!.value);
  });

  test('clone converts to JSON, but not the parts that patches replace', () => {
    const replaced = vi.fn(() => 'replaced');
    const kept = vi.fn(() => 'kept');
    const input = { a: { nested: { toJSON: replaced } }, b: { toJSON: kept }, c: [{ toJSON: replaced }, 1] };

    const result = Diff.applyPatch(input, [{ path: Path.of('a'), value: 'a' }, { path: Path.of('c', 0) }], { clone: true });

    expect(result).toEqual({ a: 'a', b: 'kept', c: [undefined, 1] });
    expect(replaced).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledWith('b');
  });

  test('clone omits values that have no JSON representation', () => {
    const input = { a: { f: () => 1, u: undefined, s: Symbol('s') }, b: [() => 1, undefined] };
    expect(Diff.applyPatch(input, [{ path: Path.of('a', 'x'), value: 1 }], { clone: true })).toEqual({ a: { x: 1 }, b: [null, null] });
  });

  describe('clonePatchValues', () => {
    test('clones patch values in place too', () => {
      const input: any = { a: 1 };
      const value = { date: new Date(0) };
      const result = Diff.applyPatch(input, [{ path: Path.of('b'), value }], { clonePatchValues: true });
      expect(result).toBe(input);
      expect(result.b).toEqual({ date: '1970-01-01T00:00:00.000Z' });
      expect(result.b).not.toBe(value);
    });

    test('a root patch value gets the empty key', () => {
      const replacer = vi.fn((_key: string, value: any) => value);
      expect(Diff.applyPatch({ a: 1 }, [{ path: Path.ROOT, value: { b: 2 } }], { clonePatchValues: true, replacer })).toEqual({ b: 2 });
      expect(replacer.mock.calls.map(call => call[0])).toEqual(['', 'b']);
    });

    test('applies the replacer with the patched key', () => {
      const replacer = (key: string, value: any) => (key === 'upper' ? value.toUpperCase() : value);
      const patches = [
        { path: Path.of('upper'), value: 'a' },
        { path: Path.of('nested'), value: { upper: 'b' } },
      ];
      expect(Diff.applyPatch({}, patches, { clone: true, clonePatchValues: true, replacer })).toEqual({ upper: 'A', nested: { upper: 'B' } });
    });

    test('a value without a JSON representation removes a property and is null in an array', () => {
      const patches = [
        { path: Path.of('a'), value: () => 1 },
        { path: Path.of('b', 0), value: () => 1 },
        { path: Path.of('c') },
      ];
      expect(Diff.applyPatch({ a: 1, b: [1, 2], c: 3 }, patches, { clonePatchValues: true })).toEqual({ b: [null, 2] });
    });

    test('is the same as a JSON round-trip of the patched result', () => {
      const replacer = (key: string, value: any) => (key === 'secret' ? undefined : value);
      const input = { list: [1, 2], secret: 's', kept: 1 };
      const patches = [
        { path: Path.of('list', 1), value: { secret: 's', date: new Date(0) } },
        { path: Path.of('added'), value: { secret: 's', n: NaN } },
      ];
      const expected = JSON.parse(JSON.stringify(Diff.applyPatch(structuredClone(input), patches), replacer));
      const result = Diff.applyPatch(input, patches, { clone: true, clonePatchValues: true, replacer });
      expect(JSON.stringify(result)).toEqual(JSON.stringify(expected));
    });
  });

  describe('clone is the same as patching a JSON round-trip', () => {
    const roundTrip = (input: any, patches: Patch[], replacer?: any) =>
      patches.reduce((root, patch) => patch.path.set(root, patch.value), JSON.parse(JSON.stringify(input, replacer)));

    const expectRoundTrip = (input: any, patches: Patch[], replacer?: any) => {
      const result = Diff.applyPatch(input, patches, { clone: true, replacer });
      // Stringified to compare key order too
      expect(JSON.stringify(result)).toEqual(JSON.stringify(roundTrip(input, patches, replacer)));
    };

    test('replaced properties without a JSON value move to the end', () => {
      const input = { a: undefined, b: () => 1, c: { toJSON: () => undefined }, d: 1 };
      expectRoundTrip(input, [
        { path: Path.of('a'), value: 'a' },
        { path: Path.of('b'), value: 'b' },
        { path: Path.of('c'), value: 'c' },
      ]);
    });

    test('replacer function gets the actual keys and holders', () => {
      const replacer = function (this: any, key: string, value: any) {
        if (key === 'secret') {
          return undefined;
        }
        return key === 'upper' && typeof value === 'string' ? value.toUpperCase() : value;
      };
      const input = {
        secret: 's',
        upper: 'u',
        nested: { secret: 's', upper: 'u', list: [{ upper: 'x' }, { upper: 'y' }], replaced: { upper: 'r' } },
        date: new Date(0),
      };
      expectRoundTrip(
        input,
        [
          { path: Path.of('secret'), value: 'patched' },
          { path: Path.of('nested', 'list', 1, 'upper'), value: 'z' },
          { path: Path.of('nested', 'replaced'), value: { upper: 'p' } },
        ],
        replacer,
      );
    });

    test('replacer array selects and orders keys', () => {
      const input = { c: 3, b: { a: 1, b: 2, c: 3 }, a: 1 };
      expectRoundTrip(
        input,
        [
          { path: Path.of('a'), value: 'a' },
          { path: Path.of('b', 'c'), value: 'c' },
          { path: Path.of('x'), value: 'x' },
        ],
        ['b', 'a', 'c'],
      );
    });

    test('Diff.patch result', () => {
      expectRoundTrip(oldValue(), Diff.patch(oldValue(), newValue()));
    });

    test('patches below a primitive, null or missing value', () => {
      expectRoundTrip({ a: 1, b: null, c: 'c' }, [
        { path: Path.of('a', 'x'), value: 1 },
        { path: Path.of('b', 0), value: 2 },
        { path: Path.of('missing', 'y'), value: 3 },
      ]);
    });

    test('patches that do not fit the type of the value replace it', () => {
      expectRoundTrip({ object: { x: 1 }, array: [1, 2] }, [
        { path: Path.of('object', 0), value: 'index' },
        { path: Path.of('array', 'x'), value: 'property' },
      ]);
    });

    test('patches below the same array element', () => {
      expectRoundTrip({ list: [{ x: 1, y: 2, z: 3 }] }, [
        { path: Path.of('list', 0, 'x'), value: 'x' },
        { path: Path.of('list', 0, 'y'), value: 'y' },
      ]);
    });

    test('patch below an array element without a JSON representation', () => {
      expectRoundTrip({ list: [{ toJSON: () => undefined }, 1] }, [{ path: Path.of('list', 0, 'x'), value: 'x' }]);
    });
  });

  test('clone throws on a circular structure along a patched path', () => {
    const input: any = { a: { b: 1 } };
    input.a.self = input;
    expect(() => Diff.applyPatch(input, [{ path: Path.of('a', 'b'), value: 2 }], { clone: true })).toThrow(TypeError);
  });
});

describe('type changes', () => {
  test('undefined to string', () => {
    const change = Diff.changeset(undefined, 'string', strictOptionalProperties).get('$')!;
    expect(change).toEqual({ path: Path.ROOT, oldValue: undefined, newValue: 'string' });
    expect('oldValue' in change).toBe(true);
  });

  test('missing to string', () => {
    expect(Diff.pathsAndValues('string', strictOptionalProperties)).toEqual(new Map([['$', { path: Path.ROOT, value: 'string' }]]));
  });

  describe('array to object', () => {
    const oldValue: any = [1];
    const newValue: any = { '0': 1 };

    test('changeset', () => {
      expect(Array.from(Diff.changeset(oldValue, newValue, strictOptionalProperties).values())).toEqual([
        { path: Path.ROOT, oldValue: [], newValue: {} },
        { path: Path.of(0), oldValue: 1 },
        { path: Path.of('0'), newValue: 1 },
      ]);
    });

    test('patch', () => expect(Diff.patch(oldValue, newValue, strictOptionalProperties)).toEqual([{ path: Path.ROOT, value: { '0': 1 } }]));
  });

  describe('object to array', () => {
    const oldValue: any = { '0': 1 };
    const newValue: any = [1];

    test('changeset', () => {
      expect(Array.from(Diff.changeset(oldValue, newValue, strictOptionalProperties).values())).toEqual([
        { path: Path.ROOT, oldValue: {}, newValue: [] },
        { path: Path.of('0'), oldValue: 1 },
        { path: Path.of(0), newValue: 1 },
      ]);
    });

    test('patch', () => expect(Diff.patch(oldValue, newValue, strictOptionalProperties)).toEqual([{ path: Path.ROOT, value: [1] }]));
  });

  describe('string to object', () => {
    const oldValue: any = 'string';
    const newValue: any = { string: 'string' };

    test('changeset', () => {
      expect(Array.from(Diff.changeset(oldValue, newValue, { includeObjects: true }).values())).toEqual([
        { path: Path.ROOT, oldValue: 'string', newValue: {} },
        { path: Path.of('string'), newValue: 'string' },
      ]);
    });

    test('patch', () => expect(Diff.patch(oldValue, newValue)).toEqual([{ path: Path.ROOT, value: { string: 'string' } }]));
  });

  describe('object to boolean', () => {
    const oldValue: any = { boolean: true };
    const newValue: any = true;

    test('changeset', () => {
      expect(Array.from(Diff.changeset(oldValue, newValue, { includeObjects: true }).values())).toEqual([
        { path: Path.ROOT, oldValue: {}, newValue: true },
        { path: Path.of('boolean'), oldValue: true },
      ]);
    });

    test('patch', () => expect(Diff.patch(oldValue, newValue)).toEqual([{ path: Path.ROOT, value: true }]));
  });
});
