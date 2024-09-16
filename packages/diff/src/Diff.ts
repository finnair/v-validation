import { Node, Path } from '@finnair/path';

export const defaultDiffFilter = (_path: Path, value: any) => value !== undefined;

export interface DiffConfig {
  readonly filter?: DiffFilter;
  readonly isPrimitive?: (value: any) => boolean; 
  readonly isEqual?: (a: any, b: any) => boolean;
  readonly includeObjects?: boolean;
}

export interface DiffFilter {
  (path: Path, value: any): boolean;
}

export interface Change {
  readonly path: Path;
  readonly oldValue?: any;
  readonly newValue?: any;
}

const OBJECT = Object.freeze({});
const ARRAY = Object.freeze([]);

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

export class Diff {
  constructor(private readonly config?: DiffConfig) {}

  allPaths(value: any) {
    const paths = new Set<string>();
    this.collectPathsAndValues(
      value,
      (node: Node) => {
        paths.add(node.path.toJSON());
      },
    );
    return paths;
  }

  changedPaths<T>(a: T, b: T) {
    return new Set(this.changeset(a, b).keys());
  }

  changeset<T>(a: T, b: T): Map<string, Change> {
    const changeset = new Map<string, Change>();
    const aMap = this.pathsAndValues(a);
    this.collectPathsAndValues(
      b,
      (bNode: Node) => {
        const path = bNode.path;
        const bValue = bNode.value;
        const pathStr = path.toJSON();
        if (aMap.has(pathStr)) {
          const aNode = aMap.get(pathStr);
          const aValue = aNode?.value;
          aMap.delete(pathStr);
          if (!this.isEqual(aValue, bValue)) {
            changeset.set(pathStr, { path, oldValue: aValue, newValue: this.getNewValue(bValue) });
          }
        } else {
          changeset.set(pathStr, { path, newValue: this.getNewValue(bValue) });
        }
      },
      Path.ROOT
    );
    aMap.forEach((node, pathStr) => changeset.set(pathStr, { path: node.path, oldValue: node.value }));
    return changeset;
  }
  
  pathsAndValues(value: any) {
    const map: Map<string, Node> = new Map();
    this.collectPathsAndValues(value, (node: Node) => map.set(node.path.toJSON(), <Node>{ path: node.path, value: node.value }), Path.ROOT);
    return map;
  }

  private collectPathsAndValues(value: any, collector: (node: Node) => void, path: Path = Path.ROOT) {
    if ((this.config?.filter ?? defaultDiffFilter)(path, value)) {
      if (isPrimitive(value) || this.config?.isPrimitive?.(value)) {
        collector({ path, value });
      } else if (typeof value === 'object') {
        if (Array.isArray(value)) {
          if (this.config?.includeObjects) {
            collector({ path, value: ARRAY });
          }
          value.forEach((element, index) => this.collectPathsAndValues(element, collector, path.index(index)));
        } else if (value.constructor === Object) {
          if (this.config?.includeObjects) {
            collector({ path, value: OBJECT });
          }
          Object.keys(value).forEach((key) =>
            this.collectPathsAndValues(value[key], collector, path.property(key))
          );
        } else {
          throw new Error(`only primitives, arrays and plain objects are supported, got "${value.constructor.name}"`);
        }
      }
    }
  }

  private isEqual(a: any, b: any): boolean {
    if (a === b) {
      return true;
    }
    return !!this.config?.isEqual?.(a, b)
  }
  
  private getNewValue(value: any) {
    if (value === OBJECT) {
      return {};
    }
    if (value === ARRAY) {
      return [];
    }
    return value;
  }
}
