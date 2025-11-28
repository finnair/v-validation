
import { describe, test, expect } from 'vitest';
import { Diff } from './Diff.js';
import { Node, Path } from '@finnair/path';
import { Change } from './DiffNode.js';

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
});

class CustomPrimitive {
  constructor(public readonly value: number) {}
}
