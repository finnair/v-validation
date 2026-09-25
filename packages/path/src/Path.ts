import { getProperty, setOwnProperty } from "./properties.js";

export type PathComponent = number | string;

const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class Path {
  public static readonly ROOT = Path.newPath([]);

  /**
   * Materialized path components. For paths created via {@link property}/{@link index} this is
   * `undefined` until first observed and then memoized by the {@link path} getter, so the hot path
   * of building nested paths during validation allocates neither the component array nor performs
   * `Object.freeze` unless a consumer actually reads the path (e.g. to render a violation).
   */
  private _path?: PathComponent[];
  private _parent?: Path;
  private _component?: PathComponent;

  private constructor(path?: PathComponent[], parent?: Path, component?: PathComponent) {
    if (path !== undefined) {
      // Eagerly materialized path (ROOT, `of`, `concat`, `connectTo`, `parent`): fully immutable.
      this._path = path;
    } else {
      // Lazily materialized child of `parent`.
      this._parent = parent;
      this._component = component;
    }
  }

  private static newPath(path: PathComponent[]): Path {
    const newPath = new Path(path);
    Object.freeze(newPath.path);
    Object.freeze(newPath);
    return newPath;
  }

  freeze(): this {
    // Force lazy materialization; the getter memoizes `_path`, drops the parent chain and freezes
    // `this` into the same canonical, fully-immutable shape as an eagerly-constructed path.
    void this.path;
    return this;
  }

  private get path(): PathComponent[] {
    if (this._path === undefined) {
      this._path = this._parent!.path.concat(this._component!);
      // Release the ancestor chain for GC and match the shape of an eagerly-constructed path
      // (whose declared fields are `undefined` own properties) so structural equality holds.
      // Assign `undefined` rather than `delete`: `delete` drops the keys (breaking `toEqual`
      // against eager paths) and forces the instance into V8 dictionary mode.
      this._component = undefined;
      this._parent = undefined;
      Object.freeze(this._path);
      // The path is now observable, so restore full immutability of the instance too.
      Object.freeze(this);
    }
    return this._path;
  }

  index(index: number): Path {
    Path.validateIndex(index);
    return new Path(undefined, this, index);
  }

  property(property: string): Path {
    Path.validateProperty(property);
    return new Path(undefined, this, property);
  }

  child(key: number | string): Path {
    if (typeof key === 'number') {
      return this.index(key);
    }
    return this.property(key);
  }

  startsWith(other: Path) {
    for (let i = 0; i < other.path.length; i++) {
      // Loose comparison so string and number indexes match, consistent with `equals`.
      if (String(this.path[i]) !== String(other.path[i])) {
        return false;
      }
    }
    return true;
  }

  connectTo(newRootPath: Path) {
    return Path.newPath(newRootPath.path.concat(this.path));
  }

  concat(childPath: Path) {
    return Path.newPath(this.path.concat(childPath.path));
  }

  parent(): undefined | Path {
    if (this._parent) {
      return this._parent;
    }
    switch (this.path.length) {
      case 0: return undefined;
      case 1: return Path.ROOT;
      default: return Path.newPath(this.path.slice(0, -1));
    }
  }

  toString(): string {
    return this.toJSON();
  }

  toJSON(): string {
    return this.path.reduce((pathString: string, component: PathComponent) => pathString + Path.componentToString(component), '$');
  }

  equals(other: any) {
    if (other instanceof Path) {
      const otherLength = other.length;
      if (otherLength === this.length) {
        for (let i = 0; i < otherLength; i++) {
          if (String(other.componentAt(i)) !== String(this.componentAt(i))) {
            return false;
          }
        }
        return true;
      }
    }
    return false;
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
      current = getProperty(current, this.path[index]);
    }
    if (index === this.path.length - 1 && typeof current === 'object') {
      return getProperty(current, this.path[this.path.length - 1]);
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
    let pathIndex = -1;
    const _root = toObject(root, this.path);
    let current = _root;
    for (pathIndex = 0; pathIndex < this.path.length - 1 && current; pathIndex++) {
      const component = this.path[pathIndex];
      // Only own properties, so that e.g. `__proto__` doesn't resolve to the (shared) prototype
      const child = toObject(Object.hasOwn(current, component) ? current[component] : undefined, this.path);
      if (child !== undefined) {
        setOwnProperty(current, component, child);
        current = child;
      }
    }
    if (value === undefined) {
      if (current !== undefined) {
        delete current[this.path[pathIndex]];
        // Truncate undefined tail of an array
        if (Array.isArray(current)) {
          let i = current.length - 1;
          while (i >= 0 && current[i] === undefined) {
            i--;
          }
          current.length = i + 1;
        }
      }
    } else {
      setOwnProperty(current, this.path[pathIndex], value);
    }
    return _root;

    function toObject(current: any, path: PathComponent[]) {
      if (typeof current === 'object') {
        return current;
      } else if (value !== undefined) {
        if (typeof path[pathIndex + 1] === 'number') {
          return [];
        } else {
          return {};
        }
      } else {
        return undefined;
      }
    }
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
    return Path.newPath(path);
  }

  static validateComponent(component: any) {
    const type = typeof component;
    if (type === 'number') {
      if (component < 0 || !Number.isInteger(component as number)) {
        throw new Error('Expected component to be an integer >= 0');
      }
    } else if (type !== 'string') {
      throw new Error(`Expected component to be a string or an integer, got ${type}: ${component}`);
    }
  }

  static validateIndex(index: any) {
    if (typeof index !== 'number') {
      throw new Error(`Expected index to be a number, got ${index}`);
    }
    if (index < 0 || !Number.isInteger(index)) {
      throw new Error('Expected index to be an integer >= 0');
    }
  }

  static validateProperty(property: any) {
    if (typeof property !== 'string') {
      throw new Error(`Expected property to be a string, got ${property}`);
    }
  }

  static isValidIdentifier(str: string) {
    return identifierPattern.test(str);
  }

  static componentToString(component: PathComponent) {
    if (typeof component === 'number') {
      return Path.indexToString(component);
    } else {
      return Path.propertyToString(component);
    }
  }

  static indexToString(index: number) {
    return '[' + index + ']';
  }

  static propertyToString(property: string) {
    if (Path.isValidIdentifier(property)) {
      return '.' + property;
    } else {
      // JsonPath uses single quotes, but that would require custom encoding of single quotes as JSON string encoding doesn't have escape for it
      return '[' + JSON.stringify(property) + ']';
    }
  }
}
