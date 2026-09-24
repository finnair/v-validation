import { describe, test, expect } from 'vitest';
import { V } from './V.js';
import { Path } from '@finnair/path';
import { defaultViolations } from './validators.js';
import { isPlainObject, JsonValueValidator } from './jsonValue.js';

describe('isPlainObject', () => {
  test.each([[null], [undefined], ['a'], [1]])('rejects %s', value => expect(isPlainObject(value)).toBe(false));

  test('accepts {} and Object.create(null)', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });
});

describe('V.jsonValue', () => {
  test('returns one shared instance per combination, regardless of order and duplicates', () => {
    expect(V.jsonValue('object', 'array')).toBe(V.jsonValue('array', 'object', 'array'));
    expect(V.jsonValue('object')).not.toBe(V.jsonValue('array'));
  });

  test('allows every type when called without arguments', () => {
    expect(V.jsonValue()).toBe(V.jsonValue('string', 'boolean', 'number', 'null', 'array', 'object'));
  });

  test('restricts the root value', async () => {
    expect((await V.jsonValue('object').validate('a')).isSuccess()).toBe(false);
    expect(await V.jsonValue('object').getValid({ a: 'b' })).toEqual({ a: 'b' });
  });

  test('rejects an unknown type', () => {
    expect(() => V.jsonValue('date' as any)).toThrow(/unknown type date/);
    expect(() => new JsonValueValidator(['date' as any])).toThrow(/unknown type date/);
  });
});

describe('JsonValueValidator', () => {
  const json = new JsonValueValidator();

  test.each([['string'], [true], [0], [-1.5], [null], [[]], [{}], [{ a: [1, 'b', null, { c: false }] }]])('accepts %j', async value => {
    expect(await json.getValid(value)).toEqual(value);
  });

  test.each([[undefined], [NaN], [Infinity], [-Infinity], [1n], [Symbol('s')], [() => 1], [new Date()], [new Map()], [new String('s')], [Object.create({})], [[undefined]], [{ a: undefined }]])(
    'rejects %s',
    async value => {
      expect((await json.validate(value)).isSuccess()).toBe(false);
    },
  );

  test('clones objects and arrays', async () => {
    const input = { a: [{ b: 1 }] };
    const output: any = await json.getValid(input);
    expect(output).not.toBe(input);
    expect(output.a).not.toBe(input.a);
    expect(output.a[0]).not.toBe(input.a[0]);
  });

  test('clones a null-prototype object into a plain object', async () => {
    const input = Object.assign(Object.create(null), { a: 1 });
    const output: any = await json.getValid(input);
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(output).toEqual({ a: 1 });
  });

  test('freezes the output under V.frozen', async () => {
    const output: any = await V.frozen(json).getValid({ a: [{ b: 1 }] });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.a)).toBe(true);
    expect(Object.isFrozen(output.a[0])).toBe(true);
  });

  test('keeps a __proto__ key as an own property', async () => {
    const output: any = await json.getValid(JSON.parse('{"__proto__": {"x": 1}}'));
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.hasOwn(output, '__proto__')).toBe(true);
    expect(output.x).toBeUndefined();
  });

  test('allow restricts only the root value', async () => {
    const objectOnly = new JsonValueValidator(['object']);
    expect(await objectOnly.getValid({ a: 1, b: ['c'] })).toEqual({ a: 1, b: ['c'] });
    expect((await objectOnly.validate('a')).isSuccess()).toBe(false);
    expect((await objectOnly.validate([])).isSuccess()).toBe(false);
  });

  test.each([
    ['string', 'a'],
    ['boolean', true],
    ['number', 1],
    ['null', null],
    ['array', []],
    ['object', {}],
  ] as const)('rejects %s when not allowed', async (type, value) => {
    const others = new JsonValueValidator(['string', 'boolean', 'number', 'null', 'array', 'object'].filter(t => t !== type) as any);
    expect((await others.validate(value)).isSuccess()).toBe(false);
  });

  test('rejects an empty allow list', () => {
    expect(() => new JsonValueValidator([])).toThrow();
  });

  test('dependsOnFreezeContext only when arrays or objects are allowed', () => {
    expect(json.dependsOnFreezeContext()).toBe(true);
    expect(new JsonValueValidator(['array']).dependsOnFreezeContext()).toBe(true);
    expect(new JsonValueValidator(['string', 'number']).dependsOnFreezeContext()).toBe(false);
  });

  test('rejects an array cycle', async () => {
    const input: any[] = [];
    input.push(input);
    const result = await json.validate(input);
    expect(result.getViolations()).toEqual([defaultViolations.cycle(Path.of(0))]);
  });
});
