export type JsonReplacer = ((this: any, key: string, value: any) => any) | (number | string)[] | null;

export function jsonClone(input: any, replacer?: JsonReplacer) {
  return _jsonClone('', { '': input }, replacer);
}

function _jsonClone(key: string, holder: any, replacer?: JsonReplacer) {
  let value = holder[key];
  if (typeof value?.toJSON === 'function') {
    value = value.toJSON(key);
  }
  if (typeof replacer === 'function') {
    value = replacer.call(holder, key, value);
  }
  if (value && typeof value === 'object') {
    let clone: any;
    if (Array.isArray(value)) {
      clone = [];
      for (let i=0; i < value.length; i++) {
        clone[i] = _jsonClone(i.toString(), value, replacer) ?? null;
      }
    } else {
      clone = {};
      if (Array.isArray(replacer)) {
        const len = replacer.length;
        for (let i=0; i < len; i++) {
          const nestedKey = replacer[i].toString();
          const keyValue = _jsonClone(nestedKey, value, replacer);
          // undefined is not included in the result
          if (keyValue !== undefined) {
            clone[nestedKey] = keyValue;
          }
        }
      } else {
        for (const nestedKey in value) {
          const keyValue = _jsonClone(nestedKey, value, replacer);
          // undefined is not included in the result
          if (keyValue !== undefined) {
            clone[nestedKey] = keyValue;
          }
        }
      }
    }
    return clone;
  } else {
    switch (typeof value) {
      // ignore function and symbol
      case 'function':
      case 'symbol':
        return undefined;
      // BigInt is not supported by JSON.stringify
      case 'bigint': 
        throw new TypeError("BigInt value can't be serialized in JSON");
      default: 
        return value;
    }
  }
}
