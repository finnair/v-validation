import { Node } from '@finnair/path';
import { arrayOrPlainObject, Change, DiffNode, DiffNodeConfig } from './DiffNode';

export interface DiffConfig extends DiffNodeConfig {
  readonly includeObjects?: boolean;
}

export class Diff {
  constructor(private readonly config?: DiffConfig) {}

  allPaths(value: any) {
    return this.changedPaths(getBaseValue(value), value);
  }

  changedPaths<T>(oldValue: T, newValue: T) {
    const paths = new Set<string>();
    const diffNode = new DiffNode({ oldValue, newValue }, this.config);
    for (const path of diffNode.getChangedPaths(this.config?.includeObjects)) {
      paths.add(path.toJSON());
    }
    return paths;
  }

  changeset<T>(oldValue: T, newValue: T): Map<string, Change> {
    const changeset = new Map<string, Change>();
    const diffNode = new DiffNode({ oldValue, newValue }, this.config);
    for (const change of diffNode.getScalarChanges(this.config?.includeObjects)) {
      changeset.set(change.path.toJSON(), change);
    }
    return changeset;
  }
  
  pathsAndValues(value: any):  Map<string, Node> {
    const map = new Map<string, Node>();
    const diffNode = new DiffNode({ newValue: value }, this.config);
    for (const change of diffNode.getScalarChanges(this.config?.includeObjects)) {
      map.set(change.path.toJSON(), { path: change.path, value: change.newValue });
    }
    return map;
  }
}

function getBaseValue(value: any) {
  switch (arrayOrPlainObject(value)) {
    case 'object': return {};
    case 'array': return [];
    default: return undefined;
  }
}
