import { setOwnProperty } from './properties.js';

export type JsonReplacer = ((this: any, key: string, value: any) => any) | (number | string)[] | null;

export type JsonValue = string | boolean | number | JsonValue[] | null | JsonObject;

export type JsonObject = {
  [key: string]: JsonValue;
}

/**
 * Same as `JSON.parse(JSON.stringify(input, replacer))`, but without serialization. 
 * 
 * @throws TypeError if the input has no JSON representation (`undefined`, a function or a symbol), contains a BigInt or is circular
 */
export function jsonClone(input: any, replacer?: JsonReplacer): JsonValue {
  return _cloneValue(_rootValue(input, replacer), replacer, []);
}

/** Internal: root value after `toJSON` and `replacer`, required to have a JSON representation. */
export function _rootValue(input: any, replacer?: JsonReplacer) {
  const value = _replaceValue('', { '': input }, replacer);
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`${typeof value} value can't be serialized in JSON`);
  }
  return value;
}

/** Internal: clone of `holder[key]`, applying `toJSON` and `replacer` like `JSON.stringify`. */
export function _jsonClone(key: string, holder: any, replacer: JsonReplacer | undefined, stack: object[]) {
  return _cloneValue(_replaceValue(key, holder, replacer), replacer, stack);
}

/** Internal: clone of a value that `toJSON` and `replacer` have already been applied to. `stack` holds the objects being cloned. */
export function _cloneValue(value: any, replacer: JsonReplacer | undefined, stack: object[]) {
  if (value && typeof value === 'object') {
    _enter(value, stack);
    let clone: JsonValue;
    if (Array.isArray(value)) {
      const len = value.length;
      // Allocated at its final size: growing from [] leaves spare capacity in every retained clone.
      clone = new Array(len);
      for (let i=0; i < len; i++) {
        clone[i] = _jsonClone(i.toString(), value, replacer, stack) ?? null;
      }
    } else {
      clone = {};
      if (Array.isArray(replacer)) {
        const len = replacer.length;
        for (let i=0; i < len; i++) {
          const nestedKey = replacer[i].toString();
          const keyValue = _jsonClone(nestedKey, value, replacer, stack);
          // undefined is not included in the result
          if (keyValue !== undefined) {
            setOwnProperty(clone, nestedKey, keyValue);
          }
        }
      } else {
        for (const nestedKey of Object.keys(value)) {
          const keyValue = _jsonClone(nestedKey, value, replacer, stack);
          // undefined is not included in the result
          if (keyValue !== undefined) {
            setOwnProperty(clone, nestedKey, keyValue);
          }
        }
      }
    }
    stack.pop();
    return clone;
  } else {
    return _primitiveValue(value);
  }
}

/** Internal: pushes `value` to `stack` of objects being converted, unless it's already there. */
export function _enter(value: object, stack: object[]) {
  if (stack.includes(value)) {
    throw new TypeError('Converting circular structure to JSON');
  }
  stack.push(value);
}

export function _primitiveValue(value: any) {
  switch (typeof value) {
    // ignore function and symbol
    case 'function':
    case 'symbol':
      return undefined;
    // BigInt is not supported by JSON.stringify
    case 'bigint': 
      throw new TypeError("BigInt value can't be serialized in JSON");
    case 'number':
      return Number.isFinite(value) ? value : null;
    default: 
      return value;
  }
}

export function _replaceValue(key: string, holder: any, replacer?: JsonReplacer) {
  let value = holder[key];
  if (((typeof value === 'object' && value !== null) || typeof value === 'bigint') && typeof value.toJSON === 'function') {
    value = value.toJSON(key);
  }
  if (typeof replacer === 'function') {
    value = replacer.call(holder, key, value);
  }
  // Boxed primitives are serialized as primitives
  if (typeof value === 'object' && value !== null) {
    if (value instanceof Number) {
      value = Number(value);
    } else if (value instanceof String) {
      value = String(value);
    } else if (value instanceof Boolean || value instanceof BigInt) {
      value = value.valueOf();
    }
  }
  return value;
}
