import { PathMatcher } from './PathMatcher.js';
import { Path, PathComponent } from './Path.js';
import { AnyIndex, AnyProperty, IndexMatcher, PathExpression, PropertyMatcher } from './matchers.js';
import { JsonObject, JsonReplacer, JsonValue, _cloneValue, _enter, _primitiveValue, _replaceValue, _rootValue } from './jsonClone.js';
import { setOwnProperty } from './properties.js';

const INCLUDE = 1;
const EXCLUDE = 2;
const ALWAYS = 4;

interface Context {
  readonly replacer?: JsonReplacer;
  readonly allowGaps: boolean;
}

export class Projection {
  private readonly tree?: ProjectionTree;
  /** Flags of paths applying to the root */
  private readonly rootState: number = 0;
  private readonly context: Context;
  private constructor(
    includes: PathMatcher[], 
    excludes: PathMatcher[], 
    always: PathMatcher[],
    replacer?: JsonReplacer
  ) {
    this.context = Object.freeze({
      replacer,
      allowGaps: [...includes, ...excludes, ...always].some(matcher => matcher.allowGaps),
    });
    // Always paths only apply with includes or excludes
    if (includes.length || excludes.length) {
      const tree = new ProjectionTree();
      includes.forEach(matcher => tree.add(matcher.expressions, INCLUDE));
      excludes.forEach(matcher => tree.add(matcher.expressions, EXCLUDE));
      always.forEach(matcher => tree.add(matcher.expressions, ALWAYS));
      this.tree = tree;
      // Without includes, everything is included
      this.rootState = (includes.length ? 0 : INCLUDE) | tree.terminal;
    }
    Object.freeze(this);
  }

  /**
   * @throws TypeError if the input has no JSON representation (`undefined`, a function or a symbol), or if the output would contain a BigInt or a circular structure
   */
  map<T>(input: T): JsonValue {
    const value = _rootValue(input, this.context.replacer);
    // Clone input for safety: nothing invisible to JSON should be accessible!
    if (!this.tree) {
      return _cloneValue(value, this.context.replacer, []);
    }
    // Only the parts of the input that may end up in the output are converted to JSON
    const output = projectValue(value, this.context, this.tree.alone, this.rootState, this.tree.below, []);
    if (output === undefined) {
      // Nothing selected: an empty object or array, or null if there's none
      return this.rootState & EXCLUDE || !value || typeof value !== 'object' ? null : Array.isArray(value) ? [] : {};
    }
    return output;
  }

  /**
   * Whether any part of the value at `path` may be in the output of `map`.
   */
  match(path: Path) {
    if (!this.tree) {
      return true;
    }
    let live: Live | undefined = this.tree.alone;
    let state = this.rootState;
    for (let i = 0; i < path.length && !(state & ALWAYS); i++) {
      live = narrow(live, path.componentAt(i));
      state |= terminalOf(live);
    }
    return (state & ALWAYS) !== 0 || isIncluded(state) || (belowOf(live) & selecting(state)) !== 0;
  }

  static of(includes?: PathMatcher[], excludes?: PathMatcher[], always?: PathMatcher[], replacer?: JsonReplacer) {
    includes = includes ? includes.map(validatePathMatcher) : [];
    excludes = excludes ? excludes.map(validatePathMatcher) : [];
    always = always ? always.map(validatePathMatcher) : [];
    
    return new Projection(includes, excludes, always, replacer);
  }
}

export function projection(includes?: PathMatcher[], excludes?: PathMatcher[], always?: PathMatcher[], replacer?: JsonReplacer) {
  const projection = Projection.of(includes, excludes, always, replacer);
  return <T>(input: T): JsonValue => projection.map(input);
}

function validatePathMatcher(value: PathMatcher): PathMatcher {
  if (value instanceof PathMatcher) {
    return value as PathMatcher;
  } else {
    throw new Error(`Expected an instance of PathMatcher, got ${value}`);
  }
}

type Live = readonly ProjectionTree[];

/**
 * Prefix tree of include, exclude and always paths. Exact property and index steps are looked up, other expressions are tested.
 */
class ProjectionTree {
  /** Flags of paths ending at this node */
  terminal = 0;
  /** Flags of paths ending below this node */
  below = 0;
  readonly properties = new Map<string, ProjectionTree>();
  readonly indexes = new Map<number, ProjectionTree>();
  anyProperty?: ProjectionTree;
  anyIndex?: ProjectionTree;
  readonly tested: { readonly expression: PathExpression, readonly node: ProjectionTree }[] = [];
  /** Reusable, never mutated live list of just this node */
  readonly alone: Live = [this];

  add(expressions: readonly PathExpression[], flag: number) {
    let node: ProjectionTree = this;
    for (const expression of expressions) {
      node.below |= flag;
      node = node.child(expression);
    }
    node.terminal |= flag;
  }

  private child(expression: PathExpression): ProjectionTree {
    if (expression === AnyProperty) {
      return this.anyProperty ??= new ProjectionTree();
    }
    if (expression === AnyIndex) {
      return this.anyIndex ??= new ProjectionTree();
    }
    // Exact class check, as subclasses may override test
    if (expression.constructor === PropertyMatcher) {
      return getOrCreate(this.properties, (expression as PropertyMatcher).property);
    }
    if (expression.constructor === IndexMatcher) {
      return getOrCreate(this.indexes, (expression as IndexMatcher).index);
    }
    let entry = this.tested.find(entry => entry.expression === expression);
    if (!entry) {
      entry = { expression, node: new ProjectionTree() };
      this.tested.push(entry);
    }
    return entry.node;
  }
}

function getOrCreate<K>(map: Map<K, ProjectionTree>, key: K): ProjectionTree {
  let node = map.get(key);
  if (!node) {
    node = new ProjectionTree();
    map.set(key, node);
  }
  return node;
}

/** Included and not excluded. */
function isIncluded(state: number) {
  return (state & (INCLUDE | EXCLUDE)) === INCLUDE;
}

/** Flags of paths below a value in `state` that can add something to the output. */
function selecting(state: number) {
  return state & EXCLUDE ? ALWAYS : INCLUDE | ALWAYS;
}

/** Projection of `holder[key]`, or undefined if it's not in the output. Values that cannot be in the output are not converted to JSON. */
function project(key: string, holder: any, context: Context, live: Live | undefined, state: number, stack: object[]): JsonValue | undefined {
  const below = belowOf(live);
  if (state & ALWAYS || isIncluded(state) || below & selecting(state)) {
    return projectValue(_replaceValue(key, holder, context.replacer), context, live, state, below, stack);
  }
  return undefined;
}

function projectValue(value: any, context: Context, live: Live | undefined, state: number, below: number, stack: object[]): JsonValue | undefined {
  if (state & ALWAYS || (isIncluded(state) && !(below & EXCLUDE))) {
    return _cloneValue(value, context.replacer, stack);
  }
  if (!value || typeof value !== 'object') {
    return isIncluded(state) ? _primitiveValue(value) : undefined;
  }
  _enter(value, stack);
  const result = Array.isArray(value) ? projectArray(value, context, live, state, stack) : projectObject(value, context, live, state, stack);
  stack.pop();
  return result;
}

/** An included value is always in the output, other objects and arrays only if something below them is. */
function projectArray(array: any[], context: Context, live: Live | undefined, state: number, stack: object[]): JsonValue[] | undefined {
  const result: JsonValue[] = [];
  let created = isIncluded(state);
  for (let i = 0; i < array.length; i++) {
    const next = narrow(live, i);
    const childState = state | terminalOf(next);
    let child = project(String(i), array, context, next, childState, stack);
    if (child === undefined && (childState & ALWAYS || isIncluded(childState))) {
      child = null;
    }
    if (child !== undefined) {
      created = true;
      if (context.allowGaps) {
        result.push(child);
      } else {
        result[i] = child;
      }
    }
  }
  return created ? result : undefined;
}

function projectObject(object: any, context: Context, live: Live | undefined, state: number, stack: object[]): JsonObject | undefined {
  const result: JsonObject = {};
  let created = isIncluded(state);
  const replacer = context.replacer;
  if (Array.isArray(replacer)) {
    for (let i = 0; i < replacer.length; i++) {
      created = projectProperty(result, replacer[i].toString(), object, context, live, state, stack) || created;
    }
  } else {
    for (const key of Object.keys(object)) {
      created = projectProperty(result, key, object, context, live, state, stack) || created;
    }
  }
  return created ? result : undefined;
}

/** @returns whether the property is in the output */
function projectProperty(result: JsonObject, key: string, holder: any, context: Context, live: Live | undefined, state: number, stack: object[]): boolean {
  const next = narrow(live, key);
  const child = project(key, holder, context, next, state | terminalOf(next), stack);
  if (child !== undefined) {
    setOwnProperty(result, key, child);
    return true;
  }
  return false;
}

/** Nodes matching `component` below `live` nodes, or undefined if none match. */
function narrow(live: Live | undefined, component: PathComponent): Live | undefined {
  if (!live) {
    return undefined;
  }
  let next: Live | undefined;
  for (let i = 0; i < live.length; i++) {
    const node = live[i];
    next = collect(next, node.anyProperty);
    if (typeof component === 'number') {
      next = collect(next, node.anyIndex);
      next = collect(next, node.indexes.get(component));
    } else {
      next = collect(next, node.properties.get(component));
    }
    for (let j = 0; j < node.tested.length; j++) {
      if (node.tested[j].expression.test(component)) {
        next = collect(next, node.tested[j].node);
      }
    }
  }
  return next;
}

function collect(next: Live | undefined, node: ProjectionTree | undefined): Live | undefined {
  if (!node) {
    return next;
  }
  if (!next) {
    return node.alone;
  }
  // Lists of one are shared `alone` lists, longer ones are owned by the current narrow call
  if (next.length === 1) {
    return [next[0], node];
  }
  (next as ProjectionTree[]).push(node);
  return next;
}

function terminalOf(live: Live | undefined) {
  let flags = 0;
  if (live) {
    for (let i = 0; i < live.length; i++) {
      flags |= live[i].terminal;
    }
  }
  return flags;
}

function belowOf(live: Live | undefined) {
  let flags = 0;
  if (live) {
    for (let i = 0; i < live.length; i++) {
      flags |= live[i].below;
    }
  }
  return flags;
}
