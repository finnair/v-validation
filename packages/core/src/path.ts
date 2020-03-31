export type PathComponent = number | string;

const identifier = /^[a-zA-Z_]+[a-zA-Z0-9_]*$/;

const ROOT_ID: string = '$';

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
    return new Path(newRootPath.path.concat(this.path.slice(1)));
  }

  toJSON(): string {
    return this.path.slice(1).reduce((pathString: string, component: PathComponent) => pathString + componentToString(component), ROOT_ID);
  }

  static newRoot() {
    return new Path([ROOT_ID]);
  }

  static of(...path: PathComponent[]) {
    return Path.ofNodes(path);
  }

  static ofNodes(path: PathComponent[]) {
    if (path.length === 0) {
      return ROOT;
    }
    if (path[0] !== ROOT_ID) {
      const normalizedPath: Array<PathComponent> = [ROOT_ID];
      return new Path(normalizedPath.concat(path));
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
