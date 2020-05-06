import { PathMatcher, AnyIndex, AnyProperty, Node, IndexMatcher, PropertyMatcher } from './PathMatcher';
import { Path } from './Path';
import { UnionMatcher } from './matchers';

describe('path', () => {
  const obj = {
    id: 'id',
    name: 'name',
    object: {
      id: 'nested id',
      name: 'nested name',
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

  describe('find', () => {
    test('root', () => expect(PathMatcher.of().find('root')).toEqual([new Node(Path.of(), 'root')]));

    test('property of non-object', () => expect(PathMatcher.of('length').find('root')).toEqual([]));

    test('nested object name', () => expect(PathMatcher.of('object', 'name').find(obj)).toEqual([new Node(Path.of('object', 'name'), 'nested name')]));

    test('nested array element values', () =>
      expect(PathMatcher.of('array', AnyIndex, 'value').find(obj)).toEqual([
        new Node(Path.of('array', 0, 'value'), 123),
        new Node(Path.of('array', 1, 'value'), 456),
        new Node(Path.of('array', 2, 'value'), 789),
      ]));

    test('nested object wildcard', () =>
      expect(PathMatcher.of('object', AnyProperty).find(obj)).toEqual([
        new Node(Path.of('object', 'id'), 'nested id'),
        new Node(Path.of('object', 'name'), 'nested name'),
      ]));

    test('non-existing property', () => expect(PathMatcher.of('non-existing', 0).find(obj)).toEqual([]));

    test('non-existing index', () => expect(PathMatcher.of(999, 'property').find(obj)).toEqual([]));

    test("only object's properties are accessible", () => expect(PathMatcher.of('id', 'length').find(obj)).toEqual([]));

    test("only arrays's indexes are accessible", () => expect(PathMatcher.of('object', 0).find(obj)).toEqual([]));

    test('AnyIndex only works on an array', () => expect(PathMatcher.of(AnyIndex).find(obj)).toEqual([]));

    test('AnyProperty only works on an object', () => expect(PathMatcher.of('id', AnyProperty).find(obj)).toEqual([]));

    test('union of properties', () =>
      expect(PathMatcher.of(new UnionMatcher(['id', 'name'])).find(obj)).toEqual([new Node(Path.of('id'), 'id'), new Node(Path.of('name'), 'name')]));

    test('union of indexes', () =>
      expect(PathMatcher.of('array', new UnionMatcher([0, 2]), 'name').find(obj)).toEqual([
        new Node(Path.of('array', 0, 'name'), 'a'),
        new Node(Path.of('array', 2, 'name'), 'c'),
      ]));

    test('union of properties on a string', () => expect(PathMatcher.of('name', new UnionMatcher(['length', 'prototype'])).find(obj)).toEqual([]));
  });

  describe('match', () => {
    test('root', () => expect(PathMatcher.of().match(Path.of())).toBe(true));

    test('property', () => expect(PathMatcher.of('name').match(Path.of('name'))).toBe(true));

    test("property doesn't match", () => expect(PathMatcher.of('name').match(Path.of('Name'))).toBe(false));

    test('index', () => expect(PathMatcher.of(0).match(Path.of(0))).toBe(true));

    test("index doesn't match", () => expect(PathMatcher.of(0).match(Path.of(1))).toBe(false));

    test('any property', () => expect(PathMatcher.of(AnyProperty).match(Path.of('name'))).toBe(true));

    test('any property matches index', () => expect(PathMatcher.of(AnyProperty).match(Path.of(1))).toBe(true));

    test('any index', () => expect(PathMatcher.of(AnyIndex).match(Path.of(123))).toBe(true));

    test("any index doesn't match property", () => expect(PathMatcher.of(AnyIndex).match(Path.of('name'))).toBe(false));

    test('too short path', () => expect(PathMatcher.of('array', 0).match(Path.of('array'))).toBe(false));

    test('too long path', () => expect(PathMatcher.of('array').match(Path.of('array', 0))).toBe(false));

    test('match union index', () => expect(PathMatcher.of(new UnionMatcher([0, 'foo'])).match(Path.of(0))).toBe(true));

    test('match union property', () => expect(PathMatcher.of(new UnionMatcher([0, 'foo'])).match(Path.of('foo'))).toBe(true));

    test('match union not found', () => expect(PathMatcher.of(new UnionMatcher([0, 'foo'])).match(Path.of(1))).toBe(false));
  });

  describe('prefixMatch', () => {
    test('root', () => expect(PathMatcher.of().prefixMatch(Path.of())).toBe(true));

    test('match prefix of path', () => expect(PathMatcher.of('array').prefixMatch(Path.of('array', 0))).toBe(true));

    test("property doesn't match", () => expect(PathMatcher.of('name').prefixMatch(Path.of('Name'))).toBe(false));

    test('index', () => expect(PathMatcher.of(0).prefixMatch(Path.of(0))).toBe(true));

    test("index doesn't match", () => expect(PathMatcher.of(0).prefixMatch(Path.of(1))).toBe(false));

    test('any property', () => expect(PathMatcher.of(AnyProperty).prefixMatch(Path.of('name'))).toBe(true));

    test('any property matches index', () => expect(PathMatcher.of(AnyProperty).prefixMatch(Path.of(1))).toBe(true));

    test('any index', () => expect(PathMatcher.of(AnyIndex).prefixMatch(Path.of(123))).toBe(true));

    test("any index doesn't match property", () => expect(PathMatcher.of(AnyIndex).prefixMatch(Path.of('name'))).toBe(false));

    test('too short path', () => expect(PathMatcher.of('array', 0).prefixMatch(Path.of('array'))).toBe(false));
  });

  describe('findFirst', () => {
    test('first array element', () => expect(PathMatcher.of('array', AnyIndex, 'value').findFirst(obj)).toEqual(new Node(Path.of('array', 0, 'value'), 123)));

    test('last array element', () => expect(PathMatcher.of('array', 2, 'value').findFirst(obj)).toEqual(new Node(Path.of('array', 2, 'value'), 789)));

    test('non-existing array element', () => expect(PathMatcher.of('array', 3, 'value').findFirst(obj)).toBeUndefined());

    test('first property', () => expect(PathMatcher.of(AnyProperty).findFirst(obj)).toEqual(new Node(Path.of('id'), 'id')));

    test('non-existing array element', () => expect(PathMatcher.of(AnyProperty, 'non-existing property').findFirst(obj)).toBeUndefined());
  });

  describe('findValues', () => {
    test('root', () => expect(PathMatcher.of().findValues('root')).toEqual(['root']));

    test('property of non-object', () => expect(PathMatcher.of('length').findValues('root')).toEqual([]));

    test('nested object name', () => expect(PathMatcher.of('object', 'name').findValues(obj)).toEqual(['nested name']));

    test('nested array element values', () => expect(PathMatcher.of('array', AnyIndex, 'value').findValues(obj)).toEqual([123, 456, 789]));

    test('nested object wildcard', () => expect(PathMatcher.of('object', AnyProperty).findValues(obj)).toEqual(['nested id', 'nested name']));
  });

  describe('findFirstValue', () => {
    test('first array element', () => expect(PathMatcher.of('array', AnyIndex, 'value').findFirstValue(obj)).toEqual(123));

    test('last array element', () => expect(PathMatcher.of('array', 2, 'value').findFirstValue(obj)).toEqual(789));

    test('non-existing array element', () => expect(PathMatcher.of('array', 3, 'value').findFirstValue(obj)).toBeUndefined());

    test('first property', () => expect(PathMatcher.of(AnyProperty).findFirstValue(obj)).toEqual('id'));

    test('non-existing array element', () => expect(PathMatcher.of(AnyProperty, 'non-existing property').findFirstValue(obj)).toBeUndefined());

    test('first value of an union', () => expect(PathMatcher.of('array', AnyIndex, new UnionMatcher(['name', 'value'])).findFirstValue(obj)).toEqual('a'));
  });

  describe('matchers', () => {
    test('UnionMatcher requires two components', () => expect(() => new UnionMatcher(['foo'])).toThrow());

    test('IndexMatcher requires a number', () => expect(() => new IndexMatcher('foo' as any)).toThrow());

    test('IndexMatcher requires a number >= 0', () => expect(() => new IndexMatcher(-1)).toThrow());

    test('PropertyMatcher requires a string', () => expect(() => new PropertyMatcher(123 as any)).toThrow());
  });

  describe('toJSON', () => {
    test('all component types', () =>
      expect(PathMatcher.of('property', AnyIndex, '"quoted"', AnyProperty, 0, new UnionMatcher(['"quoted"', 1])).toJSON()).toEqual(
        '$.property[*]["\\"quoted\\""].*[0]["\\"quoted\\"",1]',
      ));
  });

  test('array is not a valid component', () => {
    const array: any = [];
    expect(() => PathMatcher.of(array)).toThrow();
  });
});
