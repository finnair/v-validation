import { PathMatcher } from './PathMatcher';
import { Path } from './Path';

export class Projection {
  private constructor(private readonly includes: PathMatcher[], private readonly excludes: PathMatcher[], private readonly allowGaps: boolean) {
    Object.freeze(this.includes);
    Object.freeze(this.excludes);
    Object.freeze(this);
  }

  map<T>(input: T): Partial<T> {
    let output: any;
    if (this.includes.length) {
      input = jsonClone(input);
      output = {};
      this.includes.forEach(expression => include(input, expression, output));
    } else {
      output = this.excludes.length ? jsonClone(input) : input;
    }
    if (this.excludes.length) {
      this.excludes.forEach(expression => exclude(output, expression));
    }
    if (this.allowGaps) {
      return removeGaps(output);
    }
    return output;
  }

  match(path: Path) {
    if (this.includes.length) {
      if (!this.includes.some(expression => expression.partialMatch(path))) {
        return false;
      }
    }
    if (this.excludes.length) {
      if (this.excludes.some(expression => expression.prefixMatch(path))) {
        return false;
      }
    }
    return true;
  }

  static of(includes?: PathMatcher[], excludes?: PathMatcher[]) {
    includes = includes ? includes.map(validatePathMatcher) : [];
    excludes = excludes ? excludes.map(validatePathMatcher) : [];
    const allowGaps = includes.some(expression => expression.allowGaps) || excludes.some(expression => expression.allowGaps);
    return new Projection(includes, excludes, allowGaps);
  }
}

export function projection<T>(includes?: PathMatcher[], excludes?: PathMatcher[]) {
  const projection = Projection.of(includes, excludes);
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
  matcher.find(input).forEach(node => node.path.set(output, node.value));
}

function exclude(output: any, matcher: PathMatcher) {
  matcher.find(output).forEach(node => node.path.unset(output));
}

function jsonClone(value: any) {
  return JSON.parse(JSON.stringify(value));
}

function removeGaps(value: any) {
  if (typeof value == 'object') {
    if (Array.isArray(value)) {
      value = value.filter(item => item !== undefined);
    }
    for (const key in value) {
      value[key] = removeGaps(value[key]);
    }
  }
  return value;
}
