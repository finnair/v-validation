export type PathComponent = number | string;

const identifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class Path {
  public static readonly ROOT = new Path([]);

  private readonly path: PathComponent[];

  private constructor(path: PathComponent[]) {
    this.path = path;
  }

  index(index: number): Path {
    Path.validateIndex(index);
    return new Path(this.path.concat(index));
  }

  property(property: string): Path {
    Path.validateProperty(property);
    return new Path(this.path.concat(property));
  }

  connectTo(newRootPath: Path) {
    return new Path(newRootPath.path.concat(this.path));
  }

  toJSON(): string {
    return this.path.reduce((pathString: string, component: PathComponent) => pathString + componentToString(component), '$');
  }

  get length(): number {
    return this.path.length;
  }

  componentAt(index: number) {
    return this.path[index];
  }

  [Symbol.iterator]() {
    return this.path[Symbol.iterator]();
  }

  get(root: any) {
    if (this.path.length === 0) {
      return root;
    }
    let current = root;
    let index = 0;
    for (; index < this.path.length - 1 && typeof current === 'object'; index++) {
      const component = this.path[index];
      current = current[component];
    }
    if (index === this.path.length - 1 && typeof current === 'object') {
      return current[this.path[this.path.length - 1]];
    }
    return undefined;
  }

  unset(root: any): any {
    return this.set(root, undefined);
  }

  set(root: any, value: any): any {
    if (this.path.length === 0) {
      return value;
    }
    let index = -1;
    const _root = toObject(root, this.path);
    let current = _root;
    for (index = 0; index < this.path.length - 1 && current; index++) {
      const component = this.path[index];
      const child = toObject(current[component], this.path);
      current[component] = child;
      current = child;
    }
    if (value === undefined) {
      if (current !== undefined) {
        delete current[this.path[index]];
      }
    } else {
      current[this.path[index]] = value;
    }
    return _root;

    function toObject(current: any, path: PathComponent[]) {
      if (typeof current === 'object') {
        return current;
      } else if (value !== undefined) {
        if (typeof path[index + 1] === 'number') {
          return [];
        } else {
          return {};
        }
      } else {
        return undefined;
      }
    }
  }

  /**
   * @deprecated Use Path.ROOT instead
   */
  static newRoot() {
    return Path.ROOT;
  }

  static property(property: string): Path {
    return Path.ROOT.property(property);
  }

  static index(index: number): Path {
    return Path.ROOT.index(index);
  }

  static of(...path: PathComponent[]) {
    if (path.length === 0) {
      return Path.ROOT;
    }
    path.forEach(this.validateComponent);
    return new Path(path);
  }

  private static validateComponent(component: any) {
    if (typeof component === 'number') {
      if (component < 0 || !Number.isInteger(component)) {
        throw new Error('Expected component to be an integer >= 0');
      }
    } else if (typeof component !== 'string') {
      throw new Error(`Expected component to be a string or integer, got ${component}`);
    }
  }

  private static validateIndex(index: any) {
    if (typeof index !== 'number') {
      throw new Error(`Expected index to be a number, got ${index}`);
    }
    if (index < 0 || !Number.isInteger(index)) {
      throw new Error('Expected index to be an integer >= 0');
    }
  }

  private static validateProperty(property: any) {
    if (typeof property !== 'string') {
      throw new Error(`Expected property to be a string, got ${property}`);
    }
  }
}

/**
 * @deprecated Use Path.ROOT instead
 */
export const ROOT = Path.ROOT;

/**
 * @deprecated Use Path.property instead
 */
export function property(property: string): Path {
  return Path.property(property);
}

/**
 * @deprecated Use Path.index instead
 */
export function index(index: number): Path {
  return Path.index(index);
}

function componentToString(component: PathComponent) {
  if (typeof component === 'number') {
    return '[' + component + ']';
  } else if (identifier.test(component)) {
    return '.' + component;
  } else {
    return '[' + JSON.stringify(component) + ']';
  }
}
