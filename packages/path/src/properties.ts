/** Reads also inherited properties, except `__proto__` which would return the prototype instead of data. */
export function getProperty(object: any, keyOrIndex: string | number): unknown {
  if (keyOrIndex === '__proto__' && !Object.hasOwn(object, keyOrIndex)) {
    return undefined;
  }
  return object[keyOrIndex];
}

/** Plain assignment of `__proto__` would replace the object's prototype instead of adding a property. */
export function setOwnProperty(object: any, keyOrIndex: string | number, value: unknown) {
  if (keyOrIndex === '__proto__') {
    Object.defineProperty(object, keyOrIndex, { value, writable: true, enumerable: true, configurable: true });
  } else {
    object[keyOrIndex] = value;
  }
}
