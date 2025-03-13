import { PathMatcher } from './PathMatcher.js';
import { Path } from './Path.js';
import { JsonReplacer, JsonValue, jsonClone } from './jsonClone.js';

export class Projection {
  private readonly allowGaps: boolean;
  private constructor(
    private readonly includes: PathMatcher[], 
    private readonly excludes: PathMatcher[], 
    private readonly always: PathMatcher[],
    private readonly replacer?: JsonReplacer
  ) {
    this.allowGaps = this.includes.some(expression => expression.allowGaps) 
    || this.excludes.some(expression => expression.allowGaps) 
    || this.always.some(expression => expression.allowGaps);
    
    Object.freeze(this.includes);
    Object.freeze(this.excludes);
    Object.freeze(this.always);
    Object.freeze(this);
  }

  map<T extends object>(input: T): JsonValue {
    // Clone input for safety: nothing invisible to JSON should be accessible!
    let safeInput = jsonClone(input, this.replacer);
    if (typeof safeInput !== 'object' || safeInput === null) {
      throw new Error(`Expected JSON of the input to be non-null object, got ${safeInput}`);
    }
    let output: JsonValue;
    if (this.includes.length) {
      output = Array.isArray(safeInput) ? [] : {};
      this.includes.forEach(expression => include(safeInput, expression, output));
    } else if (this.excludes.length) {
      output = safeInput;
    } else {
      return safeInput; 
    }

    this.excludes.forEach(expression => exclude(output, expression));
    
    if (this.includes.length || this.excludes.length) {
      this.always.forEach(expression => include(input, expression, output));
    }

    if (this.allowGaps) {
      return removeGaps(output);
    }
    return output;
  }

  match(path: Path) {
    if (this.always.some(expression => expression.prefixMatch(path))) {
      return true;
    }
    if (this.includes.length && !this.includes.some(expression => expression.partialMatch(path))) {
      return false;
    }
    if (this.excludes.some(expression => expression.prefixMatch(path))) {
      return false;
    }
    return true;
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
  return <T extends object>(input: T): JsonValue => projection.map(input);
}

function validatePathMatcher(value: PathMatcher): PathMatcher {
  if (value instanceof PathMatcher) {
    return value as PathMatcher;
  } else {
    throw new Error(`Expected an instance of PathMatcher, got ${value}`);
  }
}

function include(input: any, matcher: PathMatcher, output: any) {
  matcher.find(input, (path: Path, value: any) => path.set(output, value));
}

function exclude(output: any, matcher: PathMatcher) {
  matcher.find(output, (path: Path) => path.unset(output));
}

function removeGaps(value: any) {
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      value = value
        .filter(item => item !== undefined)
        .map(removeGaps);
    } else {
      for (const key in value) {
        value[key] = removeGaps(value[key]);
      }
    }
  }
  return value;
}
