import { PathMatcher } from './PathMatcher.js';
import { Path } from './Path.js';
import { JsonReplacer, jsonClone } from './jsonClone.js';

export class Projection {
  private constructor(
    private readonly includes: PathMatcher[], 
    private readonly excludes: PathMatcher[], 
    private readonly always: PathMatcher[],
    private readonly allowGaps: boolean
  ) {
    Object.freeze(this.includes);
    Object.freeze(this.excludes);
    Object.freeze(this.always);
    Object.freeze(this);
  }

  map<T extends object>(input: T, replacer?: JsonReplacer): Partial<T> {
    // Clone input for safety: nothing invisible to JSON should be accessible!
    let safeInput = jsonClone(input, replacer);
    let output: any;
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

  static of(includes?: PathMatcher[], excludes?: PathMatcher[], always?: PathMatcher[]) {
    includes = includes ? includes.map(validatePathMatcher) : [];
    excludes = excludes ? excludes.map(validatePathMatcher) : [];
    always = always ? always.map(validatePathMatcher) : [];
    
    const allowGaps = includes.some(expression => expression.allowGaps) 
      || excludes.some(expression => expression.allowGaps) 
      || always.some(expression => expression.allowGaps);
    return new Projection(includes, excludes, always, allowGaps);
  }
}

export function projection<T extends object>(includes?: PathMatcher[], excludes?: PathMatcher[], always?: PathMatcher[]) {
  const projection = Projection.of(includes, excludes, always);
  return (input: T): Partial<T> => projection.map(input);
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
