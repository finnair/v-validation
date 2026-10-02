import { describe, test, expect } from 'vitest';
import { Path } from '@finnair/path';
import { Diff, DiffConfig } from './Diff.js';

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
