import { jsonClone } from './jsonClone';
import { describe, test, expect } from 'vitest'

class MyClass {
  constructor(public visibleValue: any, public hiddenValue: any) {}
  toJSON() {
    return {
      visibleValue: this.visibleValue,
      date: new Date(Date.UTC(2026, 3, 12, 1, 2, 3, 4)),
      bigint: 123n,
    };
  }
}

const ignoredSymbol = Symbol('ignoredSymbol');

describe('jsonClone', () => {
  const funkyArray: any[] = [
    "string",
    1,
    ignoredSymbol,
    true,
    JSON.stringify,
    new Date(Date.UTC(2027, 4, 12, 1, 2, 3, 4))
  ];
  (<any>funkyArray).ignoredProperty = 'ignoredProperty';

  const funkyObject = {
    string: "string",
    1: 1,
    boolean: true,
    object: {
      plain: "object",
    },
    array: funkyArray,
    myClass: new MyClass('visibleValue', 'hiddenValue'),
    ignoredFunction() {
      return 'ignoredFunction';
    },
    bigint: 456n,
    [ignoredSymbol]: 'ignoredSymbol',
    toJSON(key: string) {
      if (key === '') {
        return {
          ...this
        }
      } else {
        return null;
      }
    }
  };

  test('object with toJSON and replacer function', () => {
    const replacer = (key: string, value: any) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    };

    const clone = jsonClone(funkyObject, replacer);

    expect(clone).toStrictEqual({
      string: "string",
      1: 1,
      boolean: true,
      object: {
        plain: "object",
      },
      array: [
        "string",
        1,
        null,
        true,
        null,
        '2027-05-12T01:02:03.004Z',
      ],
      myClass: {
        visibleValue: 'visibleValue',
        date: '2026-04-12T01:02:03.004Z',
        bigint: '123',
      },
      bigint: '456',
    })
    expect(clone).toStrictEqual(JSON.parse(JSON.stringify(funkyObject, replacer)));
  });

  test('array replacer', () => {
    const replacer = ['myClass', 'array', 'visibleValue'];

    const clone = jsonClone(funkyObject, replacer);
    
    expect(clone).toStrictEqual({
      array: [
        "string",
        1,
        null,
        true,
        null,
        '2027-05-12T01:02:03.004Z',
      ],
      myClass: {
        visibleValue: 'visibleValue',
      },
    })
    expect(clone).toStrictEqual(JSON.parse(JSON.stringify(funkyObject, replacer)));
  });

  test('bigint throws an exception', () => {
    expect(() => jsonClone(1n)).toThrow(new TypeError("BigInt value can't be serialized in JSON"));
    expect(() => jsonClone({ a: Object(1n) })).toThrow(new TypeError("BigInt value can't be serialized in JSON"));
  });

  test('BigInt.prototype.toJSON is used like in JSON.stringify', () => {
    const prototype = BigInt.prototype as any;
    prototype.toJSON = function () {
      return this.toString();
    };
    try {
      const input = { a: 1n, b: Object(2n) };
      expect(jsonClone(input)).toStrictEqual(JSON.parse(JSON.stringify(input)));
    } finally {
      delete prototype.toJSON;
    }
  });

  test('toJSON is called only for objects and BigInts like in JSON.stringify', () => {
    const prototype = String.prototype as any;
    prototype.toJSON = () => 'toJSON';
    try {
      const input = { a: 'string', b: Object('boxed') };
      expect(jsonClone(input)).toStrictEqual(JSON.parse(JSON.stringify(input)));
      expect(jsonClone(input)).toStrictEqual({ a: 'string', b: 'toJSON' });
    } finally {
      delete prototype.toJSON;
    }
  });

  test.each([
    ['undefined', undefined],
    ['function', JSON.stringify],
    ['symbol', ignoredSymbol],
  ])('jsonClone of %s throws TypeError', (type, input) => {
    expect(JSON.stringify(input)).toBeUndefined();
    expect(() => jsonClone(input)).toThrow(new TypeError(`${type} value can't be serialized in JSON`));
  });

  test('root toJSON or replacer without JSON value throws TypeError', () => {
    expect(() => jsonClone({ toJSON: () => undefined })).toThrow(new TypeError("undefined value can't be serialized in JSON"));
    expect(() => jsonClone({}, () => () => 1)).toThrow(new TypeError("function value can't be serialized in JSON"));
  });

  test('jsonClone of null is null', () => {
    expect(jsonClone(null)).toBe(null);
  });

  test('non-finite numbers are null', () => {
    const input = { nan: NaN, infinity: Infinity, negativeInfinity: -Infinity, array: [NaN], boxed: Object(NaN) };
    expect(jsonClone(input)).toStrictEqual({ nan: null, infinity: null, negativeInfinity: null, array: [null], boxed: null });
    expect(jsonClone(input)).toStrictEqual(JSON.parse(JSON.stringify(input)));
    expect(jsonClone(NaN)).toBeNull();
  });

  test('boxed primitives are unwrapped', () => {
    const input = { number: Object(1), string: Object('ab'), boolean: Object(false), array: [Object('a')] };
    expect(jsonClone(input)).toStrictEqual({ number: 1, string: 'ab', boolean: false, array: ['a'] });
    expect(jsonClone(input)).toStrictEqual(JSON.parse(JSON.stringify(input)));
    expect(jsonClone(Object('root'))).toBe('root');
  });

  describe('circular structure', () => {
    test('object referencing itself throws TypeError', () => {
      const object: any = { a: 1 };
      object.self = object;
      expect(() => JSON.stringify(object)).toThrow(TypeError);
      expect(() => jsonClone(object)).toThrow(new TypeError('Converting circular structure to JSON'));
    });

    test('array referencing itself throws TypeError', () => {
      const array: any[] = [1];
      array.push({ array });
      expect(() => jsonClone(array)).toThrow(new TypeError('Converting circular structure to JSON'));
    });

    test('toJSON returning an ancestor throws TypeError', () => {
      const parent: any = {};
      parent.child = { toJSON: () => parent };
      expect(() => jsonClone(parent)).toThrow(new TypeError('Converting circular structure to JSON'));
    });

    test('shared references are not circular', () => {
      const shared = { a: 1 };
      const input = { first: shared, second: shared, array: [shared, shared] };
      expect(jsonClone(input)).toStrictEqual(JSON.parse(JSON.stringify(input)));
    });
  });

  test('jsonClone of number is number', () => {
    expect(jsonClone(123)).toBe(123);
  });

  test('jsonClone of boolean is boolean', () => {
    expect(jsonClone(true)).toBe(true);
  });

  test('inherited properties are not cloned', () => {
    const object = Object.assign(Object.create({ inherited: 'i' }), { own: 'o' });
    expect(jsonClone(object)).toStrictEqual({ own: 'o' });
    expect(jsonClone(object)).toStrictEqual(JSON.parse(JSON.stringify(object)));
  });

  test('own __proto__ property is cloned as own property', () => {
    const json = '{"__proto__":{"polluted":true}}';
    const clone: any = jsonClone(JSON.parse(json));
    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
    expect(clone.polluted).toBeUndefined();
    expect(JSON.stringify(clone)).toEqual(json);
  });

  test('__proto__ in array replacer is cloned as own property', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true}}');
    const replacer = ['__proto__', 'polluted'];
    const clone: any = jsonClone(input, replacer);
    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
    expect(clone.polluted).toBeUndefined();
    expect(JSON.stringify(clone)).toEqual(JSON.stringify(input, replacer));
  });
});
