import { property, Path, index, ROOT } from './path';

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
    test('equal to path constructed by builder', () => expect(Path.of('$', 0, 'foo')).toEqual(index(0).property('foo')));

    test('without root', () => expect(Path.of(0, 'foo')).toEqual(index(0).property('foo')));

    test('alias for root', () => expect(Path.of()).toEqual(ROOT));
  });
});
