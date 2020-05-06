import { PathMatcher } from './PathMatcher';
import { Path } from './Path';

export class Projection {
  private readonly includeExpressions: PathMatcher[];
  private readonly excludeExpressions: PathMatcher[];
  private readonly allowGaps: boolean;

  constructor(includes?: PathMatcher[], excludes?: PathMatcher[]) {
    this.includeExpressions = includes ? includes.map(validatePathMatcher) : [];
    this.excludeExpressions = excludes ? excludes.map(validatePathMatcher) : [];
    this.allowGaps = this.includeExpressions.some(expression => expression.allowGaps) || this.excludeExpressions.some(expression => expression.allowGaps);
  }

  map<T>(input: T): Partial<T> {
    let output: any;
    if (this.includeExpressions.length) {
      input = jsonClone(input);
      output = {};
      this.includeExpressions.forEach(expression => include(input, expression, output));
    } else {
      output = this.excludeExpressions.length ? jsonClone(input) : input;
    }
    if (this.excludeExpressions.length) {
      this.excludeExpressions.forEach(expression => exclude(output, expression));
    }
    if (this.allowGaps) {
      return removeGaps(output);
    }
    return output;
  }

  match(path: Path) {
    if (this.includeExpressions.length) {
      if (!this.includeExpressions.some(expression => expression.partialMatch(path))) {
        return false;
      }
    }
    if (this.excludeExpressions.length) {
      if (this.excludeExpressions.some(expression => expression.prefixMatch(path))) {
        return false;
      }
    }
    return true;
  }
}

export function projection<T>(includes?: PathMatcher[], excludes?: PathMatcher[]) {
  const projection = new Projection(includes, excludes);
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
