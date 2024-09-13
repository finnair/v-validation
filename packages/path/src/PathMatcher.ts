import { Path, PathComponent } from './Path.js';
import { Node, PathExpression, PropertyMatcher, IndexMatcher, AnyIndex, AnyProperty, MatchHandler, UnionMatcher, isPathExpression } from './matchers.js';

export interface ResultCollector {
  /**
   * Collect a matching path and value. Return true to continue matching or false to stop.
   */
  (path: Path, value: any): boolean;
}

export class PathMatcher {
  readonly allowGaps: boolean;
  private constructor(private readonly expressions: PathExpression[]) {
    let allowGaps = false;
    expressions.forEach(expression => (allowGaps = allowGaps || expression.allowGaps));
    this.allowGaps = allowGaps;
    Object.freeze(this.expressions);
    Object.freeze(this);
  }

  find(root: any, collector: ResultCollector): void {
    if (this.expressions.length === 0) {
      collector(Path.ROOT, root);
    }
    if (typeof root !== 'object') {
      return;
    }
    const currentPath: PathComponent[] = [];
    const handlers: MatchHandler[] = [];
    for (let i = 0; i < this.expressions.length - 1; i++) {
      handlers[i] = intermediateHandler(i, this.expressions);
    }
    handlers[this.expressions.length - 1] = resultHandler();
    this.expressions[0].find(root, handlers[0]);

    function intermediateHandler(index: number, expressions: PathExpression[]): MatchHandler {
      return (value: any, component?: PathComponent) => {
        currentPath[index] = component!;
        return expressions[index + 1].find(value, handlers[index + 1]);
      };
    }

    function resultHandler(): MatchHandler {
      return (value: any, component: PathComponent) => {
        return collector(Path.of(...currentPath, component), value);
      };
    }
  }

  findAll(root: any, acceptUndefined?: boolean): Node[] {
    const results: Node[] = [];
    this.find(root, (path: Path, value: any) => {
      if (value !== undefined || acceptUndefined) {
        results.push({ path, value }); 
        return true;
      }
      return true;
    });
    return results;
  }

  findFirst(root: any, acceptUndefined?: boolean): undefined | Node {
    let result: undefined | Node = undefined;
    this.find(root, (path: Path, value: any) => {
      if (value !== undefined || acceptUndefined) {
        result = { path, value }; 
        return false;
      }
      return true;
    });
    return result;
  }

  findValues(root: any, acceptUndefined?: boolean): any[] {
    const results: any[] = [];
    this.find(root, (path: Path, value: any) => {
      if (value !== undefined || acceptUndefined) {
        results.push(value); 
        return true;
      }
      return true;
    });
    return results;
  }

  findFirstValue(root: any, acceptUndefined?: boolean): any {
    let result: undefined | any = undefined;
    this.find(root, (path: Path, value: any) => {
      if (value !== undefined || acceptUndefined) {
        result = value; 
        return false;
      }
      return true;
    });
    return result;
  }

  /**
   * Exact match: path length must match the number of expressions and all expressions must match. Only sibling paths match. 
   * 
   * @param path 
   * @returns true if path is an exact match to expressions
   */
  match(path: Path): boolean {
    if (path.length !== this.expressions.length) {
      return false;
    }
    for (let index = 0; index < this.expressions.length; index++) {
      if (!this.expressions[index].test(path.componentAt(index))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Prefix match: path length must be equal or longer than the number of expressions and all expressions must match. All sibling and child paths match. 
   * 
   * @param path 
   * @returns true the start the path matches
   */
  prefixMatch(path: Path): boolean {
    if (path.length < this.expressions.length) {
      return false;
    }
    for (let index = 0; index < this.expressions.length; index++) {
      if (!this.expressions[index].test(path.componentAt(index))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Partial match: path length can be less than or more than the number of expressions, but all corresponding expressions must match. All parent, sibling and child paths match. 
   * 
   * @param path 
   * @returns true if all path components match 
   */
  partialMatch(path: Path): boolean {
    for (let index = 0; index < this.expressions.length && index < path.length; index++) {
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
