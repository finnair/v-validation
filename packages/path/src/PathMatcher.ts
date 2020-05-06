import { Path, PathComponent } from './Path';
import { Node, PathExpression, PropertyMatcher, IndexMatcher, AnyIndex, AnyProperty, MatchHandler, UnionMatcher, isPathExpression } from './matchers';

export class PathMatcher {
  readonly allowGaps: boolean;
  private constructor(private readonly expressions: PathExpression[]) {
    let allowGaps = false;
    expressions.forEach(expression => (allowGaps = allowGaps || expression.allowGaps));
    this.allowGaps = allowGaps;
  }

  find(root: any, first?: boolean): Node[] {
    if (this.expressions.length === 0) {
      return [new Node(Path.ROOT, root)];
    }
    if (typeof root !== 'object') {
      return [];
    }
    const currentPath: PathComponent[] = [];
    const results: Node[] = [];
    const handlers: MatchHandler[] = [];
    for (let i = 0; i < this.expressions.length - 1; i++) {
      handlers[i] = intermediateHandler(i, this.expressions);
    }
    handlers[this.expressions.length - 1] = resultHandler();
    this.expressions[0].find(root, handlers[0]);
    return results;

    function intermediateHandler(index: number, expressions: PathExpression[]): MatchHandler {
      return (value: any, component?: PathComponent) => {
        currentPath[index] = component!;
        return expressions[index + 1].find(value, handlers[index + 1]);
      };
    }

    function resultHandler(): MatchHandler {
      return (value: any, component: PathComponent) => {
        results.push(new Node(Path.of(...currentPath, component), value));
        return !first;
      };
    }
  }

  findFirst(root: any): undefined | Node {
    return this.find(root, true)[0];
  }

  findValues(root: any, first?: boolean): any[] {
    if (this.expressions.length === 0) {
      return [root];
    }
    if (typeof root !== 'object') {
      return [];
    }
    const results: any[] = [];
    const handlers: MatchHandler[] = [];
    for (let i = 0; i < this.expressions.length - 1; i++) {
      handlers[i] = intermediateHandler(i, this.expressions);
    }
    handlers[this.expressions.length - 1] = resultHandler();
    this.expressions[0].find(root, handlers[0]);
    return results;

    function intermediateHandler(index: number, expressions: PathExpression[]): MatchHandler {
      return (value: any) => {
        return expressions[index + 1].find(value, handlers[index + 1]);
      };
    }

    function resultHandler(): MatchHandler {
      return (value: any) => {
        results.push(value);
        return !first;
      };
    }
  }

  findFirstValue(root: any): any {
    return this.findValues(root, true)[0];
  }

  match(path: Path): boolean {
    if (path.length !== this.expressions.length) {
      return false;
    }
    let index = 0;
    for (; index < this.expressions.length; index++) {
      if (!this.expressions[index].test(path.componentAt(index))) {
        return false;
      }
    }
    return true;
  }

  prefixMatch(path: Path): boolean {
    if (path.length < this.expressions.length) {
      return false;
    }
    let index = 0;
    for (; index < this.expressions.length; index++) {
      if (!this.expressions[index].test(path.componentAt(index))) {
        return false;
      }
    }
    return true;
  }

  partialMatch(path: Path): boolean {
    let index = 0;
    for (; index < this.expressions.length && index < path.length; index++) {
      if (!this.expressions[index].test(path.componentAt(index))) {
        return false;
      }
    }
    return true;
  }

  toJSON(): string {
    return this.expressions.reduce((str: string, expression: PathComponent | PathExpression) => str + expression.toString(), '$');
  }

  static of(...path: (PathComponent | PathExpression)[]): PathMatcher {
    return new PathMatcher(
      path.map(component => {
        const type = typeof component;
        if (type === 'number') {
          return new IndexMatcher(component as number);
        }
        if (type === 'string') {
          return new PropertyMatcher(component as string);
        }
        if (isPathExpression(component)) {
          return component as PathExpression;
        }
        throw new Error(`Unrecognized PathComponent: ${component} of type ${type}`);
      }),
    );
  }
}

export { AnyIndex, AnyProperty, PropertyMatcher, IndexMatcher, Node, PathExpression, UnionMatcher };
