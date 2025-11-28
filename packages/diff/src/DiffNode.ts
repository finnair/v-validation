import { Path } from "@finnair/path";

export interface DiffNodeConfig {
  readonly filter?: DiffFilter;
  readonly isPrimitive?: (value: any, path: Path) => boolean; 
  readonly isEqual?: (a: any, b: any, path: Path) => boolean;
}

export interface DiffFilter {
  (path: Path, value: any): boolean;
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

export const defaultDiffFilter = (_path: Path, value: any) => value !== undefined;

export type ValueType = 'primitive' | 'object' | 'array' | undefined;

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

interface DiffNodeProps {
  path?: Path, 
  oldValue?: any, 
  newValue?: any, 
}

export class DiffNode {
  public readonly path: Path;
  public readonly oldType: ValueType;
  public readonly oldValue?: any;
  public readonly newType: ValueType;
  public readonly newValue?: any;
  private _children: undefined | Map<string | number, DiffNode>;
  constructor(
    props: DiffNodeProps,
    private readonly config?: DiffNodeConfig
  ) {
    this.path = props.path ?? Path.ROOT;
    this.oldType = 'oldValue' in props ? this.getValueType(props.oldValue) : undefined;
    this.oldValue = props.oldValue;
    this.newType = 'newValue' in props ? this.getValueType(props.newValue) : undefined;
    this.newValue = props.newValue;
  }

  get children(): undefined | Map<string | number, DiffNode> {
    if (this.isComposite && this._children === undefined) {
      const nodeProps = new Map<string | number, DiffNodeProps>();
      if (isCompositeType(this.oldType)) {
        this.collectNodes(this.oldType, this.oldValue, 'oldValue', nodeProps);
      }
      if (isCompositeType(this.newType)) {
        this.collectNodes(this.newType, this.newValue, 'newValue', nodeProps);
      }
      this._children = new Map<string | number, DiffNode>();
      for (const [key, props] of nodeProps.entries()) {
        this._children.set(key, new DiffNode(props, this.config));
      }
    }
    return this._children;
  }

  getScalarChange(includeObjects = false): undefined | Change {
    if (this.isScalarChange(includeObjects)) {
      const change: { -readonly [P in keyof Change]: Change[P] } = {
        path: this.path, 
      };
      if (this.oldType) {
        change.oldValue = scalarValue(this.oldType, this.oldValue);
      }
      if (this.newType) {
        change.newValue = scalarValue(this.newType, this.newValue);
      }
      return change as Change;
    }
    return undefined;
  }

  isScalarChange(includeObjects = false) {
    return this.isChange && (this.isPrimitive || (this.isComposite && includeObjects));
  }

  getScalarChanges(includeObjects = false): Iterable<Change> {
    return {
      [Symbol.iterator]: () => scalarGenerator(this, includeObjects)
    };
  }

  get patch(): Iterable<Patch> {
    return {
      [Symbol.iterator]: () => patchGenerator(this)
    };
  }

  getChangedPaths(includeObjects = false): Iterable<Path> {
    return {
      [Symbol.iterator]: () => changedPathGenerator(this, includeObjects)
    };
  }

  get isChange(): boolean {
    if (this.newType === this.oldType) {
      if (this.newValue === this.oldValue) {
        return false;
      } else if (this.newType === 'primitive') {
        return !this.config?.isEqual?.(this.oldValue, this.newValue, this.path);
      }
      // both are objects or arrays
      return false;
    }
    // Type has changed!
    return true;
  }

  get isPrimitive(): boolean {
    return isPrimitiveType(this.oldType) || isPrimitiveType(this.newType);
  }

  get isComposite(): boolean {
    return isCompositeType(this.oldType) || isCompositeType(this.newType);
  }

  private collectNodes(type: 'object' | 'array', value: any, role: 'oldValue' | 'newValue', nodeProps: Map<string | number, DiffNodeProps>) {
    const register = (key: string | number, value: any) => {
      const props = nodeProps.get(key);
      if (props) {
        props[role] = value;
      } else {
        nodeProps.set(key, { path: this.path.child(key), [role]: value});
      }
    };

    if (type === 'object') {
      Object.entries(value).forEach(([key, value]) => register(key, value));
    } else {
      value.forEach((value: any, index: number) => register(index, value));
    }
  }
  
  private getValueType(value: any): undefined | ValueType {
    const filter = this.config?.filter ?? defaultDiffFilter;
    if (!filter(this.path, value)) {
      return undefined;
    }
    if (isPrimitive(value) || this.config?.isPrimitive?.(value, this.path)) {
      return 'primitive';
    }
    const compositeType = arrayOrPlainObject(value);
    if (compositeType) {
      return compositeType;
    }
    throw new Error(`only primitives, arrays and plain objects are supported, got "${value?.constructor.name}"`);
  }
}

function scalarValue(valueType: ValueType, value: any) {
  switch (valueType) {
    case 'object': return {};
    case 'array': return [];
    default: return value;
  }
}

export function arrayOrPlainObject(value: any): undefined | 'array' | 'object' {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return 'array';
    } else if (value.constructor === Object) {
      return 'object';
    }
  }
  return undefined;
}

function isPrimitiveType(valueType: ValueType): valueType is 'primitive' | undefined {
  return valueType === 'primitive';
}

function isCompositeType(valueType: ValueType): valueType is 'object' | 'array' {
  return valueType === 'object' || valueType === 'array';
}

function* scalarGenerator(node: DiffNode, includeObjects = false): Generator<Change> {
  const change = node.getScalarChange(includeObjects);
  if (change) {
    yield change;
  }
  if (node.children) {
    for (const child of node.children.values()) {
      yield* scalarGenerator(child, includeObjects);
    }
  }
}

function* changedPathGenerator(node: DiffNode, includeObjects = false): Generator<Path> {
  if (node.isScalarChange(includeObjects)) {
    yield node.path;
  }
  if (node.children) {
    for (const child of node.children.values()) {
      yield* changedPathGenerator(child, includeObjects);
    }
  }
}

function* patchGenerator(node: DiffNode): Generator<Patch> {
  if (node.isChange) {
    if (node.newType === undefined) {
      yield { path: node.path }
    } else {
      yield { path: node.path, value: node.newValue }
    }
  } else if (node.children) {
    for (const child of node.children.values()) {
      yield* patchGenerator(child);
    }
  }
}
