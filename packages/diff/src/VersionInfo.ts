import { Path, PathMatcher } from '@finnair/path';
import { parsePath, parsePathMatcher } from '@finnair/path-parser';
import {  Diff, DiffConfig } from './Diff.js';
import { Change, DiffNode, Patch } from './DiffNode.js';

export interface VersionInfoConfig {
  /**
   * @deprecated use diffConfig instead
   */
  readonly diff?: Diff;
  readonly diffConfig?: DiffConfig;
  readonly previousValues?: PathMatcher[];
}

const NO_PREVIOUS_VALUES = Object.freeze({});

export class VersionInfo<L> {
  private _changes?: Map<string, Change>;
  private _paths?: Set<string>;
  private _previousValues?: any;
  private _diffNode?: DiffNode;
  public readonly config: VersionInfoConfig;
  constructor(
    public readonly current: L,
    public readonly previous?: L,
    config?: VersionInfoConfig
  ) {
    this.config = {
      diffConfig: config?.diffConfig ?? config?.diff?.config,
      previousValues: config?.previousValues,
    };
  }
  map<T>(fn: (version: L) => T, config?: VersionInfoConfig) {
    return new VersionInfo<T>(
      fn(this.current),
      this.previous ? fn(this.previous) : undefined,
      config ?? this.config
    );
  }
  async mapAsync<T>(fn: (version: L) => Promise<T>, config?: VersionInfoConfig) {
    return new VersionInfo<T>(
      await fn(this.current),
      this.previous ? await fn(this.previous) : undefined,
      config ?? this.config
    );
  }
  get changes(): undefined | Map<string, Change> {
    if (this.previous) {
      if (this._changes === undefined) {
        this._changes = new Map<string, Change>();
        for (const change of this.diffNode.getScalarChanges(this.config.diffConfig?.includeObjects)) {
          this._changes.set(change.path.toJSON(), change);
        }
      }
      return this._changes;
    }
    return undefined;
  }
  get changedPaths(): undefined | Set<string> {
    if (this.previous) {
      if (this._paths === undefined) {
        this._paths = new Set<string>(this.changes!.keys());
      }
      return this._paths;
    }
    return undefined;
  }
  get paths(): Set<string> {
    if (this._paths === undefined) {
      if (this.previous) {
        this._paths = this.changedPaths!;
      } else {
        this._paths = new Set<string>();
        for (const path of this.diffNode.getChangedPaths(this.config.diffConfig?.includeObjects)) {
          this._paths.add(path.toJSON());
        }
      }
    }
    return this._paths;
  }
  get previousValues(): any {
    if (this.previous && this.config.previousValues?.length) {
      if (this._previousValues === undefined) {
        this._previousValues = NO_PREVIOUS_VALUES;
        for (const [key, value] of this.changes!) {
          const path = parsePath(key);
          if (this.config.previousValues.some((matcher) => matcher.match(path))) {
            if (this._previousValues === NO_PREVIOUS_VALUES) {
              this._previousValues = Array.isArray(this.previous) ? [] : {};
            }
            path.set(this._previousValues, value.oldValue);
          }
        }
      }
      return this._previousValues === NO_PREVIOUS_VALUES ? undefined : this._previousValues;
    }
    return undefined;
  }
  get diffNode(): DiffNode {
    if (this._diffNode === undefined) {
      this._diffNode = new DiffNode(
        {
        oldValue: this.previous,
        newValue: this.current,
        },
        this.config.diffConfig
      ); 
    }
    return this._diffNode;
  }
  get patch(): Patch[] {
    return Array.from(this.diffNode.patch);
  }
  matches(pathExpression: string | PathMatcher) {
    const matcher = VersionInfo.toMatcher(pathExpression);
    if (this.previous) {
      const changedPaths = VersionInfo.parsePaths(this.changedPaths!);
      return VersionInfo.matchesAnyPath(matcher, changedPaths)
    } else {
      return matcher.findFirst(this.current) !== undefined;
    }
  }
  matchesAny(pathExpressions: (string | PathMatcher)[]) {
    if (this.previous) {
      const changedPaths = VersionInfo.parsePaths(this.changedPaths!);
      return pathExpressions.some((pathExpression) => {
        const matcher = VersionInfo.toMatcher(pathExpression);
        return VersionInfo.matchesAnyPath(matcher, changedPaths)
      });
    } else {
      return pathExpressions.some((pathExpression) => {
        const matcher = VersionInfo.toMatcher(pathExpression);
        return matcher.findFirst(this.current) !== undefined;
      });
    }
  }
  toJSON() {
    const changedPaths = this.changedPaths;
    return {
      current: this.current,
      changedPaths: changedPaths && Array.from(changedPaths),
      previous: this.previousValues,
    };
  }

  private static parsePaths(paths: Set<string>) {
    const result = [];
    for (const path of paths) {
      result.push(parsePath(path));
    }
    return result;
  }
  private static matchesAnyPath(matcher: PathMatcher, paths: Path[]) {
    return paths.some((path) => matcher.prefixMatch(path));
  }
  private static toMatcher(pathExpression: string | PathMatcher): PathMatcher {
    return typeof pathExpression === 'string' ? parsePathMatcher(pathExpression) : (pathExpression as PathMatcher);
  }
}
