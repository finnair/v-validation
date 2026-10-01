import { getProperty, setOwnProperty } from "./properties.js";

export type PathComponent = number | string;

const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Properties are accessible only on (non-array) objects and indexes only on arrays. */
function accepts(container: any, component: PathComponent): boolean {
  if (typeof component === 'number') {
    return Array.isArray(container);
  }
  return typeof container === 'object' && container !== null && !Array.isArray(container);
}

/** Own properties only, so that e.g. `__proto__` doesn't resolve to the (shared) prototype. */
function ownValue(container: any, component: PathComponent) {
  return Object.hasOwn(container, component) ? container[component] : undefined;
}

function container(current: any, component: PathComponent) {
  if (accepts(current, component)) {
    return current;
  }
  return typeof component === 'number' ? [] : {};
}

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
    if (other.length > this.length) {
      return false;
    }
    for (let i = 0; i < other.length; i++) {
      if (this.path[i] !== other.path[i]) {
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
          if (other.componentAt(i) !== this.componentAt(i)) {
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

  /** Reads own or inherited properties, except inherited `__proto__`. */
  get(root: any) {
    let current = root;
    for (const component of this.path) {
      if (!accepts(current, component)) {
        return undefined;
      }
      current = getProperty(current, component);
    }
    return current;
  }

  /** Deletes own property only, so an inherited value may still be visible to `get`. */
  unset(root: any): any {
    const path = this.path;
    if (path.length === 0) {
      return undefined;
    }
    const last = path.length - 1;
    let current = root;
    for (let i = 0; i < last; i++) {
      if (!accepts(current, path[i])) {
        return root;
      }
      current = ownValue(current, path[i]);
    }
    if (accepts(current, path[last])) {
      delete current[path[last]];
      // Truncate undefined tail of an array
      if (Array.isArray(current)) {
        let i = current.length - 1;
        while (i >= 0 && current[i] === undefined) {
          i--;
        }
        current.length = i + 1;
      }
    }
    return root;
  }

  /**
   * Sets `value` at this path, replacing any value along the path that cannot hold the next component
   * (missing, `null`, primitive, or an array where an object is needed and vice versa) with a new object or array.
   * Writes only own properties: inherited values are shadowed and objects reached through a prototype are never modified.
   * 
   * @returns root, or a new root if root was replaced
   */
  set(root: any, value: any): any {
    if (value === undefined) {
      return this.unset(root);
    }
    const path = this.path;
    if (path.length === 0) {
      return value;
    }
    const result = container(root, path[0]);
    let current = result;
    for (let i = 0; i < path.length - 1; i++) {
      const child = ownValue(current, path[i]);
      const next = container(child, path[i + 1]);
      if (next !== child) {
        setOwnProperty(current, path[i], next);
      }
      current = next;
    }
    setOwnProperty(current, path[path.length - 1], value);
    return result;
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
