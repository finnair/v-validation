import { PathMatcher, AnyIndex, AnyProperty, UnionMatcher } from '@finnair/path';
import { parsePathMatcher } from './parsePathMatcher';

const basicExpressions = `$.prop[123][*].*["foo\\nbar\\\\"]['\\"quoted\\u00E4\\"']`;

describe('parsePathMatcher', () => {
  describe('parse', () => {
    test('parse $', () => expect(parsePathMatcher('$')).toEqual(PathMatcher.of()));

    test('parse all cases', () =>
      expect(parsePathMatcher(basicExpressions)).toEqual(PathMatcher.of('prop', 123, AnyIndex, AnyProperty, 'foo\nbar\\', '"quotedä"')));

    test('parse union of all expression types', () =>
      expect(parsePathMatcher(`$[identifier,"double quoted",'single quoted',123]`)).toEqual(
        PathMatcher.of(new UnionMatcher(['identifier', 'double quoted', 'single quoted', 123])),
      ));

    test('parse union of two expression', () => expect(parsePathMatcher(`$[123,456]`)).toEqual(PathMatcher.of(new UnionMatcher([123, 456]))));
  });

  describe('toJSON', () => {
    test('toString returns original string', () => {
      expect(parsePathMatcher(basicExpressions).toJSON()).toEqual(`$.prop[123][*].*["foo\\nbar\\\\"]["\\"quotedä\\""]`);
    });
  });

  test.each(['', '$.$', '$.white space', '$[0.1]', '$[foo', 'foo', '$"misquoted\'', '$[ "whitespace" ]'])(`"%s" is not valid path`, path =>
    expect(() => parsePathMatcher(path)).toThrow(),
  );

  test('documentation example', () =>
    expect(parsePathMatcher(`$.array[0][*].*['union',"of",properties,1]`)).toEqual(
      PathMatcher.of('array', 0, AnyIndex, AnyProperty, new UnionMatcher(['union', 'of', 'properties', 1])),
    ));
});
