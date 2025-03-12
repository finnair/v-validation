import { jsonClone } from './jsonClone';
import { describe, test, expect } from 'vitest'

class MyClass {
  constructor(public visibleValue: any, public hiddenValue: any) {}
  toJSON() {
    return {
      visibleValue: this.visibleValue,
      date: new Date(2026, 3, 12, 1, 2, 3, 4),
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
    new Date(2027, 4, 12, 1, 2, 3, 4)
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
    expect(() => jsonClone(1n)).toThrow("BigInt value can't be serialized in JSON");
  });
});
