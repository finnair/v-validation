import { Node } from '@finnair/path';
import { arrayOrPlainObject, Change, DiffNode, DiffNodeConfig } from './DiffNode';

export interface DiffConfig extends DiffNodeConfig {
  readonly includeObjects?: boolean;
}

export class Diff {
  constructor(public readonly config?: DiffConfig) {}

  allPaths(value: any) {
    return Diff.allPaths(value, this.config);
  }

  changedPaths<T>(oldValue: T, newValue: T) {
    return Diff.changedPaths(oldValue, newValue, this.config);
  }

  changeset<T>(oldValue: T, newValue: T): Map<string, Change> {
    return Diff.changeset(oldValue, newValue, this.config);
  }
  
  pathsAndValues(value: any):  Map<string, Node> {
    return Diff.pathsAndValues(value, this.config);
  }

  static allPaths(value: any, config?: DiffConfig) {
    return Diff.changedPaths(getBaseValue(value), value, config);
  }
  static changedPaths<T>(oldValue: T, newValue: T, config?: DiffConfig) {
    const paths = new Set<string>();
    const diffNode = new DiffNode({ oldValue, newValue }, config);
    for (const path of diffNode.getChangedPaths(config?.includeObjects)) {
      paths.add(path.toJSON());
    }
    return paths;
  }

  static changeset<T>(oldValue: T, newValue: T, config?: DiffConfig): Map<string, Change> {
    const changeset = new Map<string, Change>();
    const diffNode = new DiffNode({ oldValue, newValue }, config);
    for (const change of diffNode.getScalarChanges(config?.includeObjects)) {
      changeset.set(change.path.toJSON(), change);
    }
    return changeset;
  }
  
  static pathsAndValues(value: any, config?: DiffConfig):  Map<string, Node> {
    const map = new Map<string, Node>();
    const diffNode = new DiffNode({ newValue: value }, config);
    for (const change of diffNode.getScalarChanges(config?.includeObjects)) {
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
