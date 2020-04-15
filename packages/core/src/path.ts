export type PathComponent = number | string;

const identifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class Path {
  private readonly path: PathComponent[];

  private constructor(path: PathComponent[]) {
    this.path = path;
  }

  index(index: number): Path {
    return new Path(this.path.concat(index));
  }

  property(property: string): Path {
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

  get(index: number) {
    return this.path[index];
  }

  [Symbol.iterator]() {
    return this.path[Symbol.iterator]();
  }

  unset(object: any): any {
    return this.set(object, undefined);
  }

  set(object: any, value: any): any {
    if (this.path.length === 0) {
      return value;
    }
    let index = -1;
    const root = toObject(object, this.path);
    let current = root;
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
    return root;

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

  static newRoot() {
    return new Path([]);
  }

  static of(...path: PathComponent[]) {
    if (path.length === 0) {
      return ROOT;
    }
    return new Path(path);
  }
}

export const ROOT = Path.newRoot();

export function property(property: string): Path {
  return ROOT.property(property);
}

export function index(index: number): Path {
  return ROOT.index(index);
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
