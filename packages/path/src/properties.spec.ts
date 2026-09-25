import { describe, test, expect } from 'vitest';
import { getProperty, setOwnProperty } from './properties.js';

describe('getProperty', () => {
  test('gets own property', () => expect(getProperty({ name: 'value' }, 'name')).toEqual('value'));

  test('gets array index', () => expect(getProperty(['a', 'b'], 1)).toEqual('b'));

  test('gets inherited property', () => expect(getProperty(Object.create({ name: 'value' }), 'name')).toEqual('value'));

  test('gets inherited getter', () => {
    class Foo {
      get name() {
        return 'value';
      }
    }
    expect(getProperty(new Foo(), 'name')).toEqual('value');
  });

  test('inherited __proto__ is undefined', () => expect(getProperty({}, '__proto__')).toBeUndefined());

  test('gets own __proto__ property', () => expect(getProperty(JSON.parse('{"__proto__":"value"}'), '__proto__')).toEqual('value'));
});

describe('setOwnProperty', () => {
  test('sets a string property', () => {
    const obj: any = {};
    setOwnProperty(obj, 'name', 'value');
    expect(obj).toEqual({ name: 'value' });
  });

  test('sets an array index', () => {
    const arr: any[] = [];
    setOwnProperty(arr, 1, 'value');
    expect(arr).toEqual([undefined, 'value']);
    expect(arr.length).toBe(2);
  });

  test('overwrites an existing property', () => {
    const obj: any = { name: 'old' };
    setOwnProperty(obj, 'name', 'new');
    expect(obj).toEqual({ name: 'new' });
  });

  test('sets __proto__ as an own, enumerable and writable property without changing the prototype', () => {
    const obj: any = {};
    const value = { polluted: true };
    setOwnProperty(obj, '__proto__', value);
    expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
    expect(Object.hasOwn(obj, '__proto__')).toBe(true);
    expect(obj.__proto__).toBe(value);
    expect(obj.polluted).toBeUndefined();
    expect(Object.keys(obj)).toEqual(['__proto__']);
    expect(JSON.stringify(obj)).toEqual('{"__proto__":{"polluted":true}}');

    obj.__proto__ = 'overwritten';
    expect(obj.__proto__).toBe('overwritten');
    expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
  });
});
