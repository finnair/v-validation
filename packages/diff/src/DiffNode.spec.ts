
import { describe, test, expect } from 'vitest';
import { DiffNode, DiffNodeConfig } from './DiffNode';
import { Path } from '@finnair/path';

const strictOptionalPropertiesConfig: DiffNodeConfig = { filter: () => true };

describe('DiffNode', () => {
  describe('getPatch', () => {
    const object: any = {
      string: 'string',
      undefined: undefined,
      object: { number: 1 },
      array: [ 1, { boolean: true } ],
    };
    
    test('new string value', () => {
      expect(Array.from(new DiffNode({ newValue: 'string' }).patch))
      .toEqual([{ path: Path.ROOT, value: 'string' }]);
    });
    test('new object value', () => {
      expect(Array.from(new DiffNode({ newValue: object }).patch))
      .toEqual([{ path: Path.ROOT, value: object }]);
    });
    test('nested modification', () => {
      const clone = structuredClone(object);
      delete clone.object;
      clone.array[1].boolean = false;
      clone.array[1].newProp = 'newProp';

      expect(Array.from(new DiffNode({ oldValue: object, newValue: clone }).patch))
        .toEqual([
          { path: Path.of('object') },
          { path: Path.of('array', 1, 'boolean'), value: false },
          { path: Path.of('array', 1, 'newProp'), value: 'newProp' },
        ]);
      expect(Array.from(new DiffNode({ oldValue: clone, newValue: object }).patch))
        .toEqual([
          { path: Path.of('array', 1, 'boolean'), value: true },
          { path: Path.of('array', 1, 'newProp') },
          { path: Path.of('object'), value: { number: 1 } },
        ]);
    });
  });
  describe('type changes', () => {
    test('undefined to string', () => {
      const change = new DiffNode({ oldValue: undefined, newValue: 'string'}, strictOptionalPropertiesConfig).getScalarChange(true)!;
      expect(change).toEqual({ path: Path.ROOT, oldValue: undefined, newValue: 'string' });
      expect('oldValue' in change).toBe(true);
    });
    test('missing to string', () => {
      const change = new DiffNode({ newValue: 'string' }, strictOptionalPropertiesConfig).getScalarChange(true)!;
      expect(change).toEqual({ path: Path.ROOT, newValue: 'string' });
      expect('oldValue' in change).toBe(false);
    });
    describe('array to object', () => {
      const node = new DiffNode({ oldValue: [1], newValue: {'0': 1} }, strictOptionalPropertiesConfig);
      test('scalar', () => {
        expect(Array.from(node.getScalarChanges(true))).toEqual([
          { path: Path.ROOT, oldValue: [], newValue: {} },
          { path: Path.of(0), oldValue: 1 },
          { path: Path.of('0'), newValue: 1 },
        ]);
      });
      test('patch', () => {
        expect(Array.from(node.patch)).toEqual([
          { path: Path.ROOT, value: { '0': 1 } }
        ]);
      });
    });
    describe('object to array', () => {
      const node = new DiffNode({ oldValue: {'0': 1}, newValue: [1] }, strictOptionalPropertiesConfig);
      test('scalar', () => {
        expect(Array.from(node.getScalarChanges(true))).toEqual([
          { path: Path.ROOT, oldValue: {}, newValue: [] },
          { path: Path.of('0'), oldValue: 1 },
          { path: Path.of(0), newValue: 1 },
        ]);
      });
      test('patch', () => {
        expect(Array.from(node.patch)).toEqual([
          { path: Path.ROOT, value: [1] }
        ]);
      });
    });
    describe('string to object', () => {
      const node = new DiffNode({ oldValue: 'string', newValue: { string: 'string' } });
      test('scalar', () => {
        expect(Array.from(node.getScalarChanges(true))).toEqual([
          { path: Path.ROOT, oldValue: 'string', newValue: {} },
          { path: Path.of('string'), newValue: 'string' },
        ]);
      });
      test('patch', () => {
        expect(Array.from(node.patch)).toEqual([
          { path: Path.ROOT, value: { string: 'string' } }
        ]);
      });
    });
    describe('object to boolean', () => {
      const node = new DiffNode({ oldValue: { boolean: true }, newValue: true });
      test('scalar', () => {
        expect(Array.from(node.getScalarChanges(true))).toEqual([
          { path: Path.ROOT, oldValue: {}, newValue: true },
          { path: Path.of('boolean'), oldValue: true },
        ]);
      });
      test('patch', () => {
        expect(Array.from(node.patch)).toEqual([
          { path: Path.ROOT, value: true }
        ]);
      });
    });
  });
});
