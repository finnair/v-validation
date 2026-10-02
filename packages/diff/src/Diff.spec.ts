
import { describe, test, expect } from 'vitest';
import { Node, Path } from '@finnair/path';
import { Change, Diff, arrayOrPlainObject } from './Diff.js';

describe('Diff', () => {
  const defaultDiff = new Diff();

  describe('helpers', () => {
    const object = { 
      object: { string: "string"}, 
      array: [0], 
      'undefined': undefined, 
      'null': null
    };
    describe('allPaths', () => {
      test('with default filter (without undefined values)', () => {
        const paths = defaultDiff.allPaths(object);
        expect(paths).toEqual(new Set([ '$.object.string', '$.array[0]', '$.null']));
      });
      test('including undefined paths', () => {
        const paths = new Diff({ filter: () => true }).allPaths(object);
        expect(paths).toEqual(new Set([ '$.object.string', '$.array[0]', '$.undefined', '$.null']));
      });
      test('including objects', () => {
        const paths = new Diff({ includeObjects: true}).allPaths(object);
        expect(paths).toEqual(new Set([ '$.object', '$.object.string', '$.array', '$.array[0]', '$.null']));
      });
      test('array', () => {
        const paths = new Diff().allPaths([object]);
        expect(paths).toEqual(new Set([ '$[0].object.string',  '$[0].array[0]', '$[0].null' ]));
      });
    });
  
    describe('pathsAndValues', () => {
      test('all pathsAndValues with default filter (without undefined values)', () => {
        const pathsAndValues = defaultDiff.pathsAndValues(object);
        expect(pathsAndValues).toEqual(new Map<string, Node>([ 
          ['$.object.string', { path: Path.of('object', 'string'), value: 'string' }], 
          ['$.array[0]', { path: Path.of('array', 0), value: 0 }], 
          ['$.null', { path: Path.of('null'), value: null }],
        ]));
      });
      test('all, including undefined pathsAndValues', () => {
        const pathsAndValues = new Diff({ filter: () => true }).pathsAndValues(object);
        expect(pathsAndValues).toEqual(new Map<string, Node>([ 
          ['$.object.string', { path: Path.of('object', 'string'), value: 'string' }], 
          ['$.array[0]', { path: Path.of('array', 0), value: 0 }], 
          ['$.undefined', { path: Path.of('undefined'), value: undefined }],
          ['$.null', { path: Path.of('null'), value: null }],
        ]));
      });
      test('including objects', () => {
        const pathsAndValues = new Diff({ includeObjects: true}).pathsAndValues(object);
        expect(pathsAndValues).toEqual(new Map<string, Node>([ 
          ['$', { path: Path.ROOT, value: {} }], 
          ['$.object', { path: Path.of('object'), value: {} }], 
          ['$.object.string', { path: Path.of('object', 'string'), value: 'string' }], 
          ['$.array', { path: Path.of('array'), value: [] }], 
          ['$.array[0]', { path: Path.of('array', 0), value: 0 }], 
          ['$.null', { path: Path.of('null'), value: null }],
        ]));
      });
    });
  });

  test('handle null', async () => {
    const diff = defaultDiff.changedPaths(null, null);
    const expected = new Set([]);
    expect(diff).toEqual(expected);
  });

  test('only primitives, arrays and plain objects are supported', () => {
    expect(() => defaultDiff.allPaths(new Set([1]))).toThrow('only primitives, arrays and plain objects are supported, got "Set"')
  })

  describe('plain objects', () => {
    test('arrayOrPlainObject', () => {
      expect(arrayOrPlainObject({})).toBe('object');
      expect(arrayOrPlainObject(Object.create(null))).toBe('object');
      expect(arrayOrPlainObject([])).toBe('array');
      expect(arrayOrPlainObject(Object.create({ a: 1 }))).toBeUndefined();
      expect(arrayOrPlainObject(new (class Foo {})())).toBeUndefined();
      expect(arrayOrPlainObject(null)).toBeUndefined();
      expect(arrayOrPlainObject('string')).toBeUndefined();
    });

    test('null prototype objects are supported', () => {
      const oldValue = Object.assign(Object.create(null), { a: 1, b: Object.assign(Object.create(null), { c: 2 }) });
      const newValue = Object.assign(Object.create(null), { a: 2, b: { c: 2, d: 3 } });
      expect(defaultDiff.changeset(oldValue, newValue)).toEqual(new Map<string, Change>([
        ['$.a', { path: Path.of('a'), oldValue: 1, newValue: 2 }],
        ['$.b.d', { path: Path.of('b', 'd'), newValue: 3 }],
      ]));
      expect(defaultDiff.patch(oldValue, newValue)).toEqual([
        { path: Path.of('a'), value: 2 },
        { path: Path.of('b', 'd'), value: 3 },
      ]);
    });

    test('inherited properties are not silently ignored', () => {
      const inherited = Object.create({ a: 1 });
      expect(() => defaultDiff.changeset({}, inherited)).toThrow('only primitives, arrays and plain objects are supported, got "Object"');
      expect(() => defaultDiff.changeset({ nested: {} }, { nested: inherited })).toThrow('only primitives, arrays and plain objects are supported, got "Object"');
    });

    test('class instances are not supported', () => {
      class Foo { a = 1 }
      expect(() => defaultDiff.allPaths({ foo: new Foo() })).toThrow('only primitives, arrays and plain objects are supported, got "Foo"');
    });

    test('class instances are supported as custom primitives', () => {
      class Foo { constructor(readonly a: number) {} }
      const diff = new Diff({ isPrimitive: value => value instanceof Foo });
      const oldFoo = new Foo(1);
      const newFoo = new Foo(2);
      expect(diff.changeset({ foo: oldFoo }, { foo: newFoo })).toEqual(new Map<string, Change>([
        ['$.foo', { path: Path.of('foo'), oldValue: oldFoo, newValue: newFoo }],
      ]));
    });
  });
  
  describe('nested object', () => {
    const oldObject = {
      object: {
        name: 'Alexis',
      },
      array: [
        { name:'Foo' }
      ]
    };
    const newObject = {};

    describe('remove nested object', () => {
      test('with includeObjects: false', () => {
        const paths = defaultDiff.changedPaths(oldObject, newObject);
        const expected = new Set(['$.object.name', '$.array[0].name']);
        expect(paths).toEqual(expected);
      });
      
      test('with includeObjects: true', () => {
        const paths = new Diff({ includeObjects: true }).changedPaths(oldObject, newObject);
        const expected = new Set(['$.object', '$.object.name', '$.array', '$.array[0]', '$.array[0].name']);
        expect(paths).toEqual(expected);
      });
    });

    describe('add nested object', () => {
      test('with includeObjects: false', () => {
        const paths = defaultDiff.changedPaths(newObject, oldObject);
        const expected = new Set(['$.object.name', '$.array[0].name']);
        expect(paths).toEqual(expected);
      });
      
      test('with includeObjects: true', () => {
        const diff = new Diff({ includeObjects: true }).changedPaths(newObject, oldObject);
        const expected = new Set(['$.object', '$.object.name', '$.array', '$.array[0]', '$.array[0].name']);
        expect(diff).toEqual(expected);
      });
    });
  });

  describe('CustomPrimitive', () => {
    const diff = new Diff({ isPrimitive: (value: any) => value instanceof CustomPrimitive, isEqual: (a: any, b: any) => {
      if (a instanceof CustomPrimitive && b instanceof CustomPrimitive) {
        return a.value === b.value;
      }
      return false;
    }})
    test('no change', () => {
      expect(diff.changeset({ custom: new CustomPrimitive(1) }, { custom: new CustomPrimitive(1) })).toEqual(new Map());
    });
    test('change', () => {
      expect(diff.changeset({ custom: new CustomPrimitive(1) }, { custom: new CustomPrimitive(2) })).toEqual(new Map([
        ['$.custom', <Change>{ path: Path.of('custom'), oldValue: new CustomPrimitive(1), newValue: new CustomPrimitive(2)}]
      ]));
    });
  });

  describe('path/id based primitive', () => {
    const diff = new Diff({ isPrimitive: (_: any, path: Path) => path.componentAt(0) === 'nested', isEqual: (a: any, b: any, path: Path) => {
      if (path.componentAt(0) === 'nested') {
        return a.id === b.id;
      }
      return false;
    }})
    test('objects with same id are equal', () => {
      expect(diff.changeset({ nested: { id: 1, value: 'foo' } }, { nested: { id: 1, value: 'bar' } })).toEqual(new Map([]));
    });
    test('objects with different id are not equal', () => {
      expect(diff.changeset({ nested: { id: 1, value: 'foo' } }, { nested: { id: 2, value: 'foo' } })).toEqual(new Map([
        ['$.nested', <Change>{ path: Path.of('nested'), oldValue: { id: 1, value: 'foo' }, newValue: { id: 2, value: 'foo' } }]
      ]));
    });
  });

  test('property value is added, removed and changed', async () => {
    const right: any = {
      name: 'oldName',
      age: 20,
    };
    const left: any  = {
      name: 'changedName',
      lastName: 'Added lastName',
    };
    const diff = defaultDiff.changeset(right, left);
    const expected = new Map([
      ['$.name', <Change>{ path: Path.of('name'), oldValue: 'oldName', newValue: 'changedName'}], 
      ['$.lastName', <Change>{ path: Path.of('lastName'), newValue: 'Added lastName' }], 
      ['$.age', <Change>{ path: Path.of('age'), oldValue: 20 }]
    ]);
    expect(diff).toEqual(expected);
  });
  
  test('addItemToArray', async () => {
    const oldObject = {
      names: [],
    };
    const newObject = {
      names: ['Alexis'],
    };
    const diff = defaultDiff.changedPaths(oldObject, newObject);
    const expected = new Set(['$.names[0]']);
    expect(diff).toEqual(expected);
  });
  
  test('addItemToArray with items', async () => {
    const oldObject = {
      persons: [],
    };
    const newObject = {
      persons: [{ name: 'Alexis' }],
    };
    const diff = defaultDiff.changedPaths(oldObject, newObject);
    const expected = new Set(['$.persons[0].name']);
    expect(diff).toEqual(expected);
  });
  
  test('addItemToArray with multiple items', async () => {
    const oldObject = {
      persons: [{ firstName: 'Alexis' }],
    };
    const newObject = {
      persons: [{ firstName: 'Alexis', lastName: 'Doe' }, { firstName: 'Riley' }],
    };
    const diff = defaultDiff.changedPaths(oldObject, newObject);
    const expected = new Set(['$.persons[0].lastName', '$.persons[1].firstName']);
    expect(diff).toEqual(expected);
  });
  
  test('nested arrays', () => {
    const oldObject = {
      array: [[[{ name: 'foo' }]]],
    };
    const newObject = {
      array: [[[{ name: 'bar' }]]],
    };
    const diff = defaultDiff.changedPaths(oldObject, newObject);
    const expected = new Set(['$.array[0][0][0].name']);
    expect(diff).toEqual(expected);
  });

  describe('identical references', () => {
    test('are not walked', () => {
      const shared = {
        nested: {
          get value(): string {
            throw new Error('identical subtree should not be read');
          },
        },
      };
      expect(defaultDiff.changeset({ shared, a: 1 }, { shared, a: 2 })).toEqual(new Map([['$.a', { path: Path.of('a'), oldValue: 1, newValue: 2 }]]));
      expect(defaultDiff.changeset(shared, shared).size).toBe(0);
    });

    test('with includeObjects', () => {
      const shared = { a: [1] };
      expect(new Diff({ includeObjects: true }).changeset({ shared }, { shared }).size).toBe(0);
    });
  });

  test('array holes are undefined elements', () => {
    const holes = [1, , 3]; // eslint-disable-line no-sparse-arrays
    expect(defaultDiff.changedPaths(holes, [1, undefined, 3])).toEqual(new Set());
    expect(new Diff({ filter: () => true }).changeset(holes, [1, 2, 3])).toEqual(
      new Map([['$[1]', { path: Path.of(1), oldValue: undefined, newValue: 2 }]]),
    );
  });

  test('keys are path strings', () => {
    const changeset = defaultDiff.changeset({ 'needs quotes': 1, a: [{ b: 1 }] }, { 'needs quotes': 2, a: [{ b: 2 }] });
    expect(Array.from(changeset.keys())).toEqual(Array.from(changeset.values(), change => change.path.toJSON()));
    expect(Array.from(changeset.keys())).toEqual(['$["needs quotes"]', '$.a[0].b']);
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
    const keys = ['a', 'b', 'c', '0', '1'];

    function value(rnd: () => number, depth: number): any {
      const r = depth > 3 ? 0.5 + rnd() * 0.5 : rnd();
      if (r < 0.3) {
        const object: any = {};
        keys.forEach(key => rnd() < 0.5 && (object[key] = value(rnd, depth + 1)));
        return object;
      }
      if (r < 0.5) {
        return Array.from({ length: Math.floor(rnd() * 4) }, () => value(rnd, depth + 1));
      }
      return [1, 2, 'x', null, true][Math.floor(rnd() * 5)];
    }

    /** Mutates a copy, sharing some unchanged branches by reference. */
    function mutate(rnd: () => number, original: any, depth: number): any {
      if (rnd() < 0.15) {
        return value(rnd, depth);
      }
      if (Array.isArray(original)) {
        return rnd() < 0.3 ? original : original.map(item => mutate(rnd, item, depth + 1));
      }
      if (original && typeof original === 'object') {
        if (rnd() < 0.3) {
          return original;
        }
        const copy: any = {};
        Object.keys(original).forEach(key => rnd() < 0.9 && (copy[key] = mutate(rnd, original[key], depth + 1)));
        return copy;
      }
      return original;
    }

    test('applying changeset with objects or patch to the old value results in the new value', () => {
      const diff = new Diff({ includeObjects: true });
      for (let seed = 1; seed <= 500; seed++) {
        const rnd = random(seed);
        const oldValue = Object.fromEntries(keys.map(key => [key, value(rnd, 1)]));
        const newValue = mutate(rnd, oldValue, 0);
        let changed: any = structuredClone(oldValue);
        diff.changeset(oldValue, newValue).forEach(change => (changed = change.path.set(changed, change.newValue)));
        expect(changed).toEqual(newValue);
        let patched: any = structuredClone(oldValue);
        Diff.patch(oldValue, newValue).forEach(patch => (patched = patch.path.set(patched, patch.value)));
        expect(patched).toEqual(newValue);
      }
    });
  });
});

class CustomPrimitive {
  constructor(public readonly value: number) {}
}
