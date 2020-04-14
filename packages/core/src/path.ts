export type PathComponent = number | string;

const identifier = /^[a-zA-Z_]+[a-zA-Z0-9_]*$/;

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
