import { Path, PathComponent, ROOT, property, index } from './path';

describe('path', () => {
  test('toJSON', () =>
    expect(
      Path.property('s p a c e s')
        .index(5)
        .property('regular')
        .toJSON(),
    ).toEqual('$["s p a c e s"][5].regular'));

  test('Weird properties', () =>
    expect(
      Path.property('@foo')
        .property('a5')
        .property('http://xmlns.com/foaf/0.1/name')
        .toJSON(),
    ).toEqual('$["@foo"].a5["http://xmlns.com/foaf/0.1/name"]'));

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

    test('Path.get', () => {
      const path = Path.of('foo', 0, 'bar');
      expect(path.get(0)).toEqual('foo');
      expect(path.get(1)).toEqual(0);
      expect(path.get(2)).toEqual('bar');
    });

    test('Path.length', () => {
      expect(Path.of('foo', 0, 'bar').length).toEqual(3);
    });
  });

  describe('set', () => {
    test('set root', () => expect(Path.of().set('root', { foo: 'baz' })).toEqual({ foo: 'baz' }));

    test('creates necessary nested objects', () => expect(Path.of(0, 'array', 1, 'name').set([], 'name')).toEqual([{ array: [undefined, { name: 'name' }] }]));

    test("doesn't replace root object with array", () =>
      expect(Path.of(0, 'array', 1, 'name').set({}, 'name')).toEqual({ 0: { array: [undefined, { name: 'name' }] } }));

    test('creates root object if necessary', () =>
      expect(Path.of(0, 'array', 1, 'name').set(undefined, 'name')).toEqual([{ array: [undefined, { name: 'name' }] }]));
  });

  describe('unset', () => {
    test('deletes property when setting undefined value', () => expect(Path.of('name').unset({ name: 'name' })).toEqual({}));

    test("delete doesn't create intermediate objects", () => expect(Path.of('nested', 'name').unset({})).toEqual({}));
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

  describe('@deprecated', () => {
    test('newRoot', () => expect(Path.newRoot()).toBe(Path.ROOT));

    test('ROOT', () => expect(ROOT).toBe(Path.ROOT));

    test('property', () => expect(property('test')).toEqual(Path.property('test')));

    test('index', () => expect(index(0)).toEqual(Path.index(0)));
  });
});
