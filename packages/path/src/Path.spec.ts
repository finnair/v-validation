import { describe, test, expect } from 'vitest'
import { Path, PathComponent } from './Path.js';
import { PathMatcher } from './PathMatcher.js';
import { AnyProperty, AnyIndex } from './matchers.js';
import path from 'path';

describe('path', () => {
  test('toJSON', () => expect(Path.property('s p a c e s').index(5).property('regular').toJSON()).toEqual('$["s p a c e s"][5].regular'));

  test('Weird properties', () =>
    expect(Path.property('@foo').property('a5').property('http://xmlns.com/foaf/0.1/name').toJSON()).toEqual('$["@foo"].a5["http://xmlns.com/foaf/0.1/name"]'));

  describe('of', () => {
    test('equal to path constructed by builder', () => expect(Path.of(0, 'foo')).toEqual(Path.index(0).property('foo')));

    test('without root', () => expect(Path.of(0, 'foo')).toEqual(Path.index(0).property('foo')));

    test('alias for root', () => expect(Path.of()).toEqual(Path.ROOT));
  });

  describe('iterable path', () => {
    test('use path in for..of', () => {
      const components: PathComponent[] = [];
      for (const component of Path.of(0, 'foo', 'bar')) {
        components.push(component);
      }
      expect(components).toEqual([0, 'foo', 'bar']);
    });

    test('use path in Array.from', () => {
      expect(Array.from(Path.of(0, 'foo', 'bar'))).toEqual([0, 'foo', 'bar']);
    });

    test('componentAt', () => {
      const path = Path.of('foo', 0, 'bar');
      expect(path.componentAt(0)).toEqual('foo');
      expect(path.componentAt(1)).toEqual(0);
      expect(path.componentAt(2)).toEqual('bar');
    });

    test('length', () => {
      expect(Path.of('foo', 0, 'bar').length).toEqual(3);
    });
  });

  describe('get', () => {
    test('get root', () => expect(Path.ROOT.get('root')).toEqual('root'));

    test('get property of root', () => expect(Path.of('name').get({ name: 'name' })).toEqual('name'));

    test('get property of child', () => expect(Path.of('child', 'name').get({ child: { name: 'name' } })).toEqual('name'));

    test('get index of root', () => expect(Path.of(1).get([1, 2])).toEqual(2));

    test('get index of of child', () => expect(Path.of('child', 1).get({ child: [1, 2] })).toEqual(2));

    test('get property of string', () => expect(Path.of('length').get('string')).toBeUndefined());

    test('get property of nested string', () => expect(Path.of('child', 'name', 'length').get({ child: { name: 'string' } })).toBeUndefined());

    test('get index of string', () => expect(Path.of(0).get('string')).toBeUndefined());

    test('get index of nested string', () => expect(Path.of('child', 'name', 0).get({ child: { name: 'string' } })).toBeUndefined());
  });

  describe('set', () => {
    test('set root', () => expect(Path.of().set('root', { foo: 'baz' })).toEqual({ foo: 'baz' }));

    test('creates necessary nested objects', () => expect(Path.of(0, 'array', 1, 'name').set([], 'name')).toEqual([{ array: [undefined, { name: 'name' }] }]));

    test("doesn't replace root object with array", () =>
      expect(Path.of(0, 'array', 1, 'name').set({}, 'name')).toEqual({ 0: { array: [undefined, { name: 'name' }] } }));

    test('creates root object if necessary', () =>
      expect(Path.of(0, 'array', 1, 'name').set(undefined, 'name')).toEqual([{ array: [undefined, { name: 'name' }] }]));

    test('truncates undefined tail from an array', () => {
      const obj = { array: [1, undefined, 3] };
      Path.of('array', 2).set(obj, undefined);
      expect(obj).toEqual({ array: [1] });
      expect(obj.array.length).toBe(1);
      expect(obj.array[2]).toBeUndefined();
    });

    test('does not create undefined intermediate', () => {
      expect('nested' in Path.of('nested', 'value').set({}, undefined)).toBe(false);
    });
  });

  describe('unset', () => {
    test('deletes property when setting undefined value', () => expect(Path.of('name').unset({ name: 'name' })).toEqual({}));

    test("delete doesn't create intermediate objects", () => expect(Path.of('nested', 'name').unset({})).toEqual({}));
  });

  test('connectTo', () => {
    const parent = Path.of('parent');
    const child = Path.of('child');
    expect(Array.from(child.connectTo(parent))).toEqual(['parent', 'child']);
  });

  test('concat', () => {
    const parent = Path.of('parent');
    const child = Path.of('child');
    expect(Array.from(parent.concat(child))).toEqual(['parent', 'child']);
  });

  test('parent', () => {
    const path = Path.of('parent', 'nested', 0);
    let parent: undefined | Path = path.parent()!;
    expect(parent).toEqual(Path.of('parent', 'nested'));
    parent = parent.parent()!;
    expect(parent).toEqual(Path.of('parent'));
    parent = parent.parent()!;
    expect(parent).toBe(Path.ROOT);
    parent = parent.parent();
    expect(parent).toBeUndefined();
    // original is not modified
    expect(path).toEqual(Path.of('parent', 'nested', 0));
  });

  test('child', () => {
    expect(Path.of('foo').child(1).child('bar')).toEqual(Path.of('foo', 1, 'bar'));
  });

  describe('equals', () => {
    test('equal path', () => {
      expect(Path.of('foo', 0).equals(Path.of('foo', 0))).toBe(true);
    });
    test('non equal path', () => {
      expect(Path.of('foo', 0).equals(Path.of('foo', 1))).toBe(false);
    });
    test('string and number indexes are equal', () => {
      expect(Path.of('foo', 0).equals(Path.of('foo', "0"))).toBe(true);
    });
    test('shorter path', () => {
      expect(Path.of('foo', 'bar').equals(Path.of('foo'))).toBe(false);
    })
    test('longer path', () => {
      expect(Path.of('foo').equals(Path.of('foo', 'bar'))).toBe(false);
    })
  });

  describe('validate components', () => {
    test('string is not valid index', () => {
      const component: any = 'foo';
      expect(() => Path.of().index(component)).toThrow();
    });

    test('decimal is not valid index', () => {
      const component: any = 1.2;
      expect(() => Path.of().index(component)).toThrow();
    });

    test('negative value is not valid index', () => {
      const component: any = -1;
      expect(() => Path.of().index(component)).toThrow();
    });

    test('number is not valid property', () => {
      const component: any = 0;
      expect(() => Path.of().property(component)).toThrow();
    });

    test('array is not valid property', () => {
      const component: any = [];
      expect(() => Path.of().property(component)).toThrow();
    });

    describe('of', () => {
      test('decimal is not a valid component', () => {
        const component: any = 1.2;
        expect(() => Path.of(component)).toThrow();
      });

      test('negative value is not a valid component', () => {
        const component: any = -1;
        expect(() => Path.of(component)).toThrow();
      });

      test('array is not a valid component', () => {
        const component: any = [];
        expect(() => Path.of(component)).toThrow();
      });
    });
  });

  test('documentation example', () => {
    const array: any = [1, 2];
    array.property = 'stupid thing to do';
    expect(PathMatcher.of(AnyProperty).findValues(array)).toEqual([1, 2, 'stupid thing to do']);
    expect(PathMatcher.of(AnyIndex).findValues(array)).toEqual([1, 2]);
  });
});
