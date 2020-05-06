import { Path, PathComponent } from './Path';

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

export class Node {
  constructor(public readonly path: Path, public readonly value: any) {}
}

export class IndexMatcher implements PathExpression {
  readonly allowGaps = true;
  constructor(private readonly index: number) {
    Path.validateIndex(index);
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
  constructor(private readonly property: string) {
    Path.validateProperty(property);
  }

  find(current: any, callback: MatchHandler): Continue {
    if (typeof current === 'object' && current.hasOwnProperty(this.property)) {
      return callback(current[this.property], this.property);
    }
    return true;
  }

  test(component: PathComponent): boolean {
    return String(component) === this.property;
  }

  toString() {
    return Path.propertyToString(this.property);
  }
}

export class UnionMatcher implements PathExpression {
  constructor(private readonly components: PathComponent[]) {
    if (components.length < 2) {
      throw new Error('Expected at least 2 properties');
    }
    components.forEach(Path.validateComponent);
  }

  find(current: any, callback: MatchHandler): Continue {
    if (typeof current === 'object') {
      for (const component of this.components) {
        if (current.hasOwnProperty(component)) {
          if (!callback(current[component], component)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  test(component: PathComponent): boolean {
    const str = String(component);
    return this.components.find(component => String(component) === str) !== undefined;
  }

  get allowGaps() {
    return this.components.some(component => typeof component === 'number');
  }

  toString() {
    return `[${this.components.map(this.propertyToString).join(',')}]`;
  }

  private propertyToString(property: PathComponent) {
    return JSON.stringify(property);
  }
}

export const AnyIndex: PathExpression = {
  allowGaps: false,
  find: (current: any, callback: MatchHandler): boolean => {
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        if (!callback(current[i], i)) {
          return false;
        }
      }
    }
    return true;
  },

  test: (component: PathComponent) => {
    return typeof component === 'number' && Number.isInteger(component as number) && component >= 0;
  },

  toString: () => {
    return '[*]';
  },
};

export const AnyProperty: PathExpression = {
  allowGaps: false,
  find: (current: any, callback: MatchHandler): Continue => {
    if (typeof current === 'object') {
      for (let key in current) {
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
};
