import { _jsonClone, IndexMatcher, JsonReplacer, Node, Path, PathComponent, PathExpression, PathMatcher, PropertyMatcher } from '@finnair/path';

export interface DiffFilter {
  (path: Path, value: any): boolean;
}

export interface DiffConfig {
  readonly filter?: DiffFilter;
  readonly isPrimitive?: (value: any, path: Path) => boolean; 
  readonly isEqual?: (a: any, b: any, path: Path) => boolean;
  readonly includeObjects?: boolean;
}

export interface Patch {
  readonly path: Path;
  readonly value?: any;
}

export interface Change {
  readonly path: Path;
  readonly newValue?: any;
  readonly oldValue?: any;
}

export interface ApplyPatchOptions {
  /**
    * Apply patches to a JSON clone of the input instead of modifying it in place. The entire input is cloned before the
    * patches are applied, so JSON conversion also applies to values that a patch later replaces or removes.
   */
  readonly clone?: boolean;
  /**
  * JSON clone patch values before inserting them. A value without a JSON representation removes a property and is `null`
  * in an array. The replacer receives the final path component as its key (`''` for a root patch); its `this` value is a
  * synthetic holder, not the target parent. By default patch values are inserted as is, e.g. values that are already JSON,
  * or converted values such as dates of a validated object.
   */
  readonly clonePatchValues?: boolean;
  /** `JSON.stringify` replacer for the input clone and, when enabled, patch values cloned as roots. */
  readonly replacer?: JsonReplacer;
}

export const defaultDiffFilter = (_path: Path, value: any) => value !== undefined;

export class Diff {
  constructor(public readonly config?: DiffConfig) {}

  allPaths(value: any) {
    return Diff.allPaths(value, this.config);
  }

  changedPaths<T>(oldValue: T, newValue: T) {
    return Diff.changedPaths(oldValue, newValue, this.config);
  }

  changeset<T>(oldValue: T, newValue: T): Map<string, Change> {
    return Diff.changeset(oldValue, newValue, this.config);
  }
  
  pathsAndValues(value: any):  Map<string, Node> {
    return Diff.pathsAndValues(value, this.config);
  }

  patch<T>(oldValue: T, newValue: T): Patch[] {
    return Diff.patch(oldValue, newValue, this.config);
  }

  static allPaths(value: any, config?: DiffConfig) {
    return Diff.changedPaths(getBaseValue(value), value, config);
  }

  static changedPaths<T>(oldValue: T, newValue: T, config?: DiffConfig) {
    return _changedPaths(_buildChangeTree(true, oldValue, newValue, config));
  }

  static changeset<T>(oldValue: T, newValue: T, config?: DiffConfig): Map<string, Change> {
    return _changeset(_buildChangeTree(true, oldValue, newValue, config));
  }
  
  static pathsAndValues(value: any, config?: DiffConfig):  Map<string, Node> {
    const map = new Map<string, Node>();
    for (const [pathString, change] of _changeset(_buildChangeTree(false, undefined, value, config))) {
      map.set(pathString, { path: change.path, value: change.newValue });
    }
    return map;
  }

  /**
   * Minimal set of patches that turns `oldValue` into `newValue` with `Path.set`: a changed value is patched as a whole.
   */
  static patch<T>(oldValue: T, newValue: T, config?: DiffConfig): Patch[] {
    return _patch(_buildChangeTree(true, oldValue, newValue, config));
  }

  /**
   * Applies `patches` in order with `Path.set`, by default modifying `value` in place. Use the return value, as the root may be replaced.
   */
  static applyPatch<T = any>(value: any, patches: readonly Patch[], options?: ApplyPatchOptions): T {
    const replacer = options?.replacer ?? undefined;
    let root = options?.clone ? _jsonClone('', { '': value }, replacer, []) : value;
    for (const patch of patches) {
      const lastComponent = patch.path.length ? patch.path.componentAt(patch.path.length - 1) : undefined;
      const value = options?.clonePatchValues
        ? clonePatchValue(patch.value, replacer, typeof lastComponent === 'number', lastComponent === undefined ? '' : String(lastComponent))
        : patch.value;
      root = patch.path.set(root, value);
    }
    return root;
  }
}

function clonePatchValue(value: any, replacer: JsonReplacer | undefined, isArrayElement: boolean, key: string) {
  if (value === undefined) {
    return undefined;
  }
  const clone = _jsonClone(key, { [key]: value }, replacer, []);
  return clone === undefined && isArrayElement ? null : clone;
}

/**
 * Internal: tree of changed values and their ancestors, in the order of the old value's keys followed by keys only in the new value.
 */
export class ChangeTree {
  /** Whether this or any value below this is a scalar change */
  readonly hasScalarChanges: boolean;
  constructor(
    readonly path: Path,
    readonly key: PathComponent | undefined,
    readonly oldType: ValueType,
    readonly oldValue: any,
    readonly newType: ValueType,
    readonly newValue: any,
    /** Value was added, removed, or its type or primitive value changed */
    readonly changed: boolean,
    /** Change reported by changeset: a primitive, or an object or array with `includeObjects` */
    readonly scalarChange: boolean,
    readonly children: ChangeTree[] | undefined,
  ) {
    this.hasScalarChanges = scalarChange || (children !== undefined && children.some(child => child.hasScalarChanges));
  }
}

/** Internal: changes from `oldValue` (if `hasOld`) to `newValue`, or undefined if there are none. */
export function _buildChangeTree(hasOld: boolean, oldValue: any, newValue: any, config?: DiffConfig): ChangeTree | undefined {
  return new Walker(config).visit(Path.ROOT, undefined, hasOld, oldValue, true, newValue);
}

/** Internal: scalar changes by their JSON path strings. */
export function _changeset(tree: ChangeTree | undefined): Map<string, Change> {
  const changeset = new Map<string, Change>();
  if (tree) {
    collectChanges(tree, '', changeset);
  }
  return changeset;
}

/** Internal: JSON path strings of scalar changes. */
export function _changedPaths(tree: ChangeTree | undefined): Set<string> {
  const paths = new Set<string>();
  if (tree) {
    collectPaths(tree, '', paths);
  }
  return paths;
}

/** Internal: topmost changed values as patches. */
export function _patch(tree: ChangeTree | undefined): Patch[] {
  const patches: Patch[] = [];
  if (tree) {
    collectPatches(tree, patches);
  }
  return patches;
}

/** Internal: whether `matcher` matches (a prefix of) the path of any scalar change, like `PathMatcher.prefixMatch`. */
export function _matches(tree: ChangeTree | undefined, matcher: PathMatcher): boolean {
  return tree !== undefined && matchesBelow(tree, matcher.expressions, 0);
}

/**
 * Internal: same as `_matches(_changeTree(true, oldValue, newValue, config), matcher)` for a primitive or undefined `oldValue`,
 * but visits only the branches of `newValue` that `matcher` can match.
 */
export function _matchesAdded(oldValue: any, newValue: any, matcher: PathMatcher, config?: DiffConfig): boolean {
  return new Walker(config).matchesAdded(oldValue, newValue, matcher.expressions);
}

function pathStringOf(node: ChangeTree, parentString: string) {
  return node.key === undefined ? '$' : parentString + Path.componentToString(node.key);
}

function collectChanges(node: ChangeTree, parentString: string, changeset: Map<string, Change>) {
  if (!node.hasScalarChanges) {
    return;
  }
  const pathString = pathStringOf(node, parentString);
  if (node.scalarChange) {
    const change: { -readonly [P in keyof Change]: Change[P] } = { path: node.path.freeze() };
    if (node.oldType) {
      change.oldValue = scalarValue(node.oldType, node.oldValue);
    }
    if (node.newType) {
      change.newValue = scalarValue(node.newType, node.newValue);
    }
    changeset.set(pathString, change);
  }
  if (node.children) {
    for (const child of node.children) {
      collectChanges(child, pathString, changeset);
    }
  }
}

function collectPaths(node: ChangeTree, parentString: string, paths: Set<string>) {
  if (!node.hasScalarChanges) {
    return;
  }
  const pathString = pathStringOf(node, parentString);
  if (node.scalarChange) {
    paths.add(pathString);
  }
  if (node.children) {
    for (const child of node.children) {
      collectPaths(child, pathString, paths);
    }
  }
}

function collectPatches(node: ChangeTree, patches: Patch[]) {
  if (node.changed) {
    patches.push(node.newType === undefined ? { path: node.path.freeze() } : { path: node.path.freeze(), value: node.newValue });
  } else if (node.children) {
    for (const child of node.children) {
      collectPatches(child, patches);
    }
  }
}

function matchesBelow(node: ChangeTree, expressions: readonly PathExpression[], depth: number): boolean {
  if (depth === expressions.length) {
    return node.hasScalarChanges;
  }
  if (node.children) {
    const expression = expressions[depth];
    for (const child of node.children) {
      if (child.hasScalarChanges && expression.test(child.key!) && matchesBelow(child, expressions, depth + 1)) {
        return true;
      }
    }
  }
  return false;
}

export function arrayOrPlainObject(value: any): undefined | 'array' | 'object' {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return 'array';
    } else {
      const proto = Object.getPrototypeOf(value);
      if (proto === Object.prototype || proto === null) {
        return 'object';
      }
    }
  }
  return undefined;
}

type ValueType = 'primitive' | 'object' | 'array' | undefined;

const primitiveTypes: any = {
  'boolean': true,
  'number': true,
  'string': true,
  'bigint': true,
  'symbol': true,
};

function isPrimitive(value: any) {
  return value === null || value === undefined || !!primitiveTypes[typeof value]; 
}

function isCompositeType(valueType: ValueType): valueType is 'object' | 'array' {
  return valueType === 'object' || valueType === 'array';
}

function getBaseValue(value: any) {
  switch (arrayOrPlainObject(value)) {
    case 'object': return {};
    case 'array': return [];
    default: return undefined;
  }
}

function scalarValue(valueType: ValueType, value: any) {
  switch (valueType) {
    case 'object': return {};
    case 'array': return [];
    default: return value;
  }
}

/**
 * Walks old and new values in parallel: old keys first, then keys only in the new value.
 */
class Walker {
  private readonly filter: DiffFilter;
  private readonly includeObjects: boolean;

  constructor(private readonly config: DiffConfig | undefined) {
    this.filter = config?.filter ?? defaultDiffFilter;
    this.includeObjects = !!config?.includeObjects;
  }

  /** Change node of the value at `path`, or undefined if neither it nor anything below it changed. */
  visit(path: Path, key: PathComponent | undefined, hasOld: boolean, oldValue: any, hasNew: boolean, newValue: any): ChangeTree | undefined {
    const oldType = hasOld ? this.valueType(path, oldValue) : undefined;
    const newType = hasNew ? this.valueType(path, newValue) : undefined;
    const changed = this.isChange(path, oldType, oldValue, newType, newValue);
    const composite = isCompositeType(oldType) || isCompositeType(newType);
    // Nothing below the same value can change
    const children = composite && !(oldValue === newValue && oldType === newType)
      ? this.visitChildren(path, oldType, oldValue, newType, newValue)
      : undefined;
    if (!changed && !children) {
      return undefined;
    }
    const scalarChange = changed && (oldType === 'primitive' || newType === 'primitive' || (composite && this.includeObjects));
    return new ChangeTree(path, key, oldType, oldValue, newType, newValue, changed, scalarChange, children);
  }

  private visitChildren(path: Path, oldType: ValueType, oldValue: any, newType: ValueType, newValue: any): ChangeTree[] | undefined {
    let children: ChangeTree[] | undefined;
    let child: ChangeTree | undefined;
    if (oldType === 'object') {
      // NOTE: This is intentionally different from PathMatcher.AnyProperty by including only own enumerable string keys:
      // a diff or patch should only describe what would actually be serialized or written.
      for (const key of Object.keys(oldValue)) {
        const inNew = newType === 'object' && Object.prototype.propertyIsEnumerable.call(newValue, key);
        if ((child = this.visit(path.property(key), key, true, oldValue[key], inNew, inNew ? newValue[key] : undefined))) {
          (children ??= []).push(child);
        }
      }
    } else if (oldType === 'array') {
      const newLength = newType === 'array' ? newValue.length : 0;
      for (let i = 0; i < oldValue.length; i++) {
        const inNew = i < newLength;
        if ((child = this.visit(path.index(i), i, true, oldValue[i], inNew, inNew ? newValue[i] : undefined))) {
          (children ??= []).push(child);
        }
      }
    }
    if (newType === 'object') {
      for (const key of Object.keys(newValue)) {
        if (oldType !== 'object' || !Object.prototype.propertyIsEnumerable.call(oldValue, key)) {
          if ((child = this.visit(path.property(key), key, false, undefined, true, newValue[key]))) {
            (children ??= []).push(child);
          }
        }
      }
    } else if (newType === 'array') {
      for (let i = oldType === 'array' ? oldValue.length : 0; i < newValue.length; i++) {
        if ((child = this.visit(path.index(i), i, false, undefined, true, newValue[i]))) {
          (children ??= []).push(child);
        }
      }
    }
    return children;
  }

  matchesAdded(oldValue: any, newValue: any, expressions: readonly PathExpression[]): boolean {
    const newType = this.valueType(Path.ROOT, newValue);
    if (expressions.length === 0) {
      const oldType = this.valueType(Path.ROOT, oldValue);
      const composite = isCompositeType(newType);
      return (
        (this.isChange(Path.ROOT, oldType, oldValue, newType, newValue) && (oldType === 'primitive' || newType === 'primitive' || (composite && this.includeObjects))) ||
        (composite && this.hasAddedChildren(Path.ROOT, newType, newValue))
      );
    }
    return this.addedMatches(Path.ROOT, newType, newValue, expressions, 0);
  }

  private addedMatches(path: Path, type: ValueType, value: any, expressions: readonly PathExpression[], depth: number): boolean {
    if (depth === expressions.length) {
      return this.hasAdded(path, type, value);
    }
    const expression = expressions[depth];
    // Exact class checks, as subclasses may override test
    const exactProperty = expression.constructor === PropertyMatcher;
    const exactIndex = expression.constructor === IndexMatcher;
    if (type === 'object') {
      if (exactProperty) {
        const key = (expression as PropertyMatcher).property;
        return Object.prototype.propertyIsEnumerable.call(value, key) && this.addedChildMatches(path.property(key), value[key], expressions, depth + 1);
      }
      if (!exactIndex) {
        for (const key of Object.keys(value)) {
          if (expression.test(key) && this.addedChildMatches(path.property(key), value[key], expressions, depth + 1)) {
            return true;
          }
        }
      }
    } else if (type === 'array') {
      if (exactIndex) {
        const index = (expression as IndexMatcher).index;
        return index < value.length && this.addedChildMatches(path.index(index), value[index], expressions, depth + 1);
      }
      if (!exactProperty) {
        for (let i = 0; i < value.length; i++) {
          if (expression.test(i) && this.addedChildMatches(path.index(i), value[i], expressions, depth + 1)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private addedChildMatches(path: Path, value: any, expressions: readonly PathExpression[], depth: number): boolean {
    return this.addedMatches(path, this.valueType(path, value), value, expressions, depth);
  }

  /** Whether an added value of `type` is or contains a scalar change */
  private hasAdded(path: Path, type: ValueType, value: any): boolean {
    return type === 'primitive' || (isCompositeType(type) && (this.includeObjects || this.hasAddedChildren(path, type, value)));
  }

  private hasAddedChildren(path: Path, type: 'object' | 'array', value: any): boolean {
    if (type === 'object') {
      for (const key of Object.keys(value)) {
        const childPath = path.property(key);
        if (this.hasAdded(childPath, this.valueType(childPath, value[key]), value[key])) {
          return true;
        }
      }
    } else {
      for (let i = 0; i < value.length; i++) {
        const childPath = path.index(i);
        if (this.hasAdded(childPath, this.valueType(childPath, value[i]), value[i])) {
          return true;
        }
      }
    }
    return false;
  }

  private isChange(path: Path, oldType: ValueType, oldValue: any, newType: ValueType, newValue: any): boolean {
    if (newType === oldType) {
      if (newValue === oldValue) {
        return false;
      } else if (newType === 'primitive') {
        return !this.config?.isEqual?.(oldValue, newValue, path);
      }
      // both are objects or arrays
      return false;
    }
    return true;
  }

  private valueType(path: Path, value: any): ValueType {
    if (!this.filter(path, value)) {
      return undefined;
    }
    if (isPrimitive(value) || this.config?.isPrimitive?.(value, path)) {
      return 'primitive';
    }
    const compositeType = arrayOrPlainObject(value);
    if (compositeType) {
      return compositeType;
    }
    throw new Error(`only primitives, arrays and plain objects are supported, got "${value?.constructor.name}"`);
  }
}
