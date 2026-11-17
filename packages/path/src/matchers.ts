import { Path, PathComponent } from './Path.js';

type Continue = boolean;

export interface MatchHandler {
  (value: any, component: PathComponent): Continue;
}
/**
 * The types of path components an expression can match: object properties (strings), array indexes
 * (numbers), or both.
 */
export type ComponentType = 'property' | 'index' | 'any';

export interface PathExpression {
  find(current: any, callback: MatchHandler): Continue;
  test(component: PathComponent): boolean;
  readonly allowGaps: boolean;
  /**
   * The types of components this expression can match, which a {@link NotMatcher} negates within.
   * Defaults to `'any'`.
   */
  readonly componentType?: ComponentType;
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
  readonly componentType = 'index';
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
  readonly componentType = 'property';
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
  public readonly componentType: ComponentType;
  constructor(private readonly _components: PathComponent[]) {
    if (_components.length < 2) {
      throw new Error('Expected at least 2 properties');
    }
    _components.forEach(Path.validateComponent);
    this._testComponents = new Set(_components);
    const indexes = this._components.filter(component => typeof component === 'number').length;
    this.allowGaps = indexes > 0;
    this.componentType = indexes === 0 ? 'property' : indexes === this._components.length ? 'index' : 'any';
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
  componentType: 'index',
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
  componentType: 'any',
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

/**
 * Matches the components of the same type as `expression` that `expression` does not match, e.g.
 * `.!name` other properties of an object and `![0]` other elements of an array. The type comes from
 * `expression.componentType`: a negated union of properties and indexes matches both, and so does a
 * negated expression without a `componentType`. Negations can be nested: `!!x` matches what `x` does.
 */
export class NotMatcher implements PathExpression {
  readonly allowGaps: boolean;
  readonly componentType: ComponentType;
  constructor(readonly expression: PathExpression) {
    // The complement of a subset of array indexes is a subset too, of all indexes none and of none all
    this.allowGaps = expression.allowGaps;
    this.componentType = expression.componentType ?? 'any';
    Object.freeze(this);
  }

  find(current: any, callback: MatchHandler): Continue {
    const filtered: MatchHandler = (value, component) => this.expression.test(component) || callback(value, component);
    if (this.componentType === 'index') {
      return AnyIndex.find(current, filtered);
    }
    if (this.componentType === 'property') {
      if (isObject(current)) {
        for (const key in current) {
          if (!filtered(current[key], key)) {
            return false;
          }
        }
      }
      return true;
    }
    return AnyProperty.find(current, filtered);
  }

  test(component: PathComponent): boolean {
    switch (this.componentType) {
      case 'property':
        return typeof component === 'string' && !this.expression.test(component);
      case 'index':
        return typeof component === 'number' && !this.expression.test(component);
      default:
        return !this.expression.test(component);
    }
  }

  toString() {
    const expression = this.expression.toString();
    return expression.startsWith('.') ? `.!${expression.substring(1)}` : `!${expression}`;
  }

  static of(expression: PathComponent | PathExpression) {
    if (typeof expression === 'number') {
      return new NotMatcher(new IndexMatcher(expression));
    }
    if (typeof expression === 'string') {
      return new NotMatcher(new PropertyMatcher(expression));
    }
    return new NotMatcher(expression);
  }
}
