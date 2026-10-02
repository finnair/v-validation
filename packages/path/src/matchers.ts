import { Path, PathComponent } from './Path.js';

type Continue = boolean;

export interface MatchHandler {
  (value: any, component: PathComponent): Continue;
}
export interface PathExpression {
  find(current: any, callback: MatchHandler): Continue;
  test(component: PathComponent): boolean;
  readonly allowGaps: boolean;
  toString(): string;
}

export function isPathExpression(component: PathComponent | PathExpression): component is PathExpression {
  return !!component && typeof (component as PathExpression).test === 'function' && typeof (component as PathExpression).find === 'function';
}

export interface Node {
  readonly path: Path; 
  readonly value: any;
}

function isObject(value: any): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether `for..in` lists `key`: an own or inherited enumerable property that isn't shadowed by a non-enumerable one. */
function isEnumerable(object: object, key: string): boolean {
  if (Object.prototype.propertyIsEnumerable.call(object, key)) {
    return true;
  }
  for (let current: any = object; current !== null; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      return descriptor.enumerable === true;
    }
  }
  return false;
}

function forEachIndex(array: any[], callback: MatchHandler): Continue {
  for (let i = 0; i < array.length; i++) {
    if (!callback(array[i], i)) {
      return false;
    }
  }
  return true;
}

export class IndexMatcher implements PathExpression {
  readonly allowGaps = true;
  constructor(readonly index: number) {
    Path.validateIndex(index);
    Object.freeze(this);
  }

  find(current: any, callback: MatchHandler): Continue {
    if (Array.isArray(current) && this.index < current.length) {
      return callback(current[this.index], this.index);
    }
    return true;
  }

  test(component: PathComponent): boolean {
    return component === this.index;
  }

  toString() {
    return Path.indexToString(this.index);
  }
}

export class PropertyMatcher implements PathExpression {
  readonly allowGaps = false;
  constructor(readonly property: string) {
    Path.validateProperty(property);
    Object.freeze(this);
  }

  find(current: any, callback: MatchHandler): Continue {
    if (isObject(current) && isEnumerable(current, this.property)) {
      return callback(current[this.property], this.property);
    }
    return true;
  }

  test(component: PathComponent): boolean {
    return component === this.property;
  }

  toString() {
    return Path.propertyToString(this.property);
  }
}

export class UnionMatcher implements PathExpression {
  private readonly _testComponents: Set<PathComponent>;
  public readonly allowGaps: boolean;
  constructor(private readonly _components: PathComponent[]) {
    if (_components.length < 2) {
      throw new Error('Expected at least 2 properties');
    }
    _components.forEach(Path.validateComponent);
    this._testComponents = new Set(_components);
    this.allowGaps = this._components.some(component => typeof component === 'number');
    Object.freeze(this._components);
    Object.freeze(this);
  }

  find(current: any, callback: MatchHandler): Continue {
    const isArray = Array.isArray(current);
    if (!isArray && !isObject(current)) {
      return true;
    }
    for (const component of this._components) {
      const matches = isArray
        ? typeof component === 'number' && component < current.length
        : typeof component === 'string' && isEnumerable(current, component);
      if (matches && !callback(current[component], component)) {
        return false;
      }
    }
    return true;
  }

  test(component: PathComponent): boolean {
    return this._testComponents.has(component);
  }

  toString() {
    return `[${this._components.map(this.propertyToString).join(',')}]`;
  }

  static of(...components: PathComponent[]) {
    return new UnionMatcher(components);
  }

  private propertyToString(property: PathComponent) {
    return JSON.stringify(property);
  }
}

export const AnyIndex: PathExpression = Object.freeze({
  allowGaps: false,
  find: (current: any, callback: MatchHandler): boolean => {
    if (Array.isArray(current)) {
      return forEachIndex(current, callback);
    }
    return true;
  },

  test: (component: PathComponent) => {
    return typeof component === 'number' && Number.isInteger(component as number) && component >= 0;
  },

  toString: () => {
    return '[*]';
  },
});

export const AnyProperty: PathExpression = Object.freeze({
  allowGaps: false,
  find: (current: any, callback: MatchHandler): Continue => {
    if (Array.isArray(current)) {
      return forEachIndex(current, callback);
    }
    if (isObject(current)) {
      for (const key in current) {
        if (!callback(current[key], key)) {
          return false;
        }
      }
    }
    return true;
  },

  test: () => {
    return true;
  },

  toString: () => {
    return '.*';
  },
});
