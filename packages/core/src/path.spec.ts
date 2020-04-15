import { property, Path, index, ROOT, PathComponent } from './path';

describe('path', () => {
  test('toJSON', () =>
    expect(
      property('s p a c e s')
        .index(5)
        .property('regular')
        .toJSON(),
    ).toEqual('$["s p a c e s"][5].regular'));

  test('Weird properties', () =>
    expect(
      property('@foo')
        .property('a5')
        .property('http://xmlns.com/foaf/0.1/name')
        .toJSON(),
    ).toEqual('$["@foo"].a5["http://xmlns.com/foaf/0.1/name"]'));

  describe('of', () => {
    test('equal to path constructed by builder', () => expect(Path.of(0, 'foo')).toEqual(index(0).property('foo')));

    test('without root', () => expect(Path.of(0, 'foo')).toEqual(index(0).property('foo')));

    test('alias for root', () => expect(Path.of()).toEqual(ROOT));
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
});
