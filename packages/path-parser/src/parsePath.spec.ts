import { parsePath } from './parsePath';
import { Path } from '@finnair/v-validation-core';

describe('parsePath', () => {
  test('root', () => expect(parsePath('$')).toEqual(Path.ROOT));

  test('all components', () =>
    expect(parsePath(`$.prop[123]["foo\\nbar\\\\"]['\\"quoted\\u00E4\\"']`)).toEqual(Path.of('prop', 123, 'foo\nbar\\', '"quotedä"')));

  test('unicode escaped single quote', () => expect(Array.from(parsePath(`$['\\u0027']`))).toEqual(["'"]));

  test.each([
    '',
    `$['single'quote']`,
    `$['single\'quote']`,
    '$.$',
    '$.white space',
    '$[0,1]',
    '$[0.1]',
    '$[foo',
    'foo',
    '$"misquoted\'',
    '$[ "whitespace" ]',
  ])(`"%s" is not valid path`, path => expect(() => parsePath(path)).toThrow());

  test('documentation examples', () => {
    expect(parsePath(`$['\\u0027']`)).toEqual(Path.of("'"));
    expect(Array.from(parsePath(`$.array[1]["\\"property\\" with spaces and 'quotes'"]`))).toEqual(['array', 1, `"property" with spaces and 'quotes'`]);
  });
});
