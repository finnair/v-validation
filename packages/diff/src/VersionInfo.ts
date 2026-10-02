import { PathMatcher } from '@finnair/path';
import { parsePathMatcher } from '@finnair/path-parser';
import { Change, Diff, DiffConfig, Patch, ChangeTree, _changedPaths, _changeset, _changeTree, _matches, _patch } from './Diff.js';

export interface VersionInfoConfig {
  /**
   * @deprecated use diffConfig instead
   */
  readonly diff?: Diff;
  readonly diffConfig?: DiffConfig;
  readonly previousValues?: PathMatcher[];
}

const NO_PREVIOUS_VALUES = Object.freeze({});

const MATCHER_CACHE_SIZE = 1000;
const matcherCache = new Map<string, PathMatcher>();

export class VersionInfo<L> {
  /** Changes from previous to current, computed once: null if there are none */
  private _changeTree?: ChangeTree | null;
  private _changes?: Map<string, Change>;
  private _paths?: Set<string>;
  private _previousValues?: any;
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
        this._changes = _changeset(this.changeTree);
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
        this._paths = _changedPaths(this.changeTree);
      }
    }
    return this._paths;
  }
  get previousValues(): any {
    if (this.previous && this.config.previousValues?.length) {
      if (this._previousValues === undefined) {
        this._previousValues = NO_PREVIOUS_VALUES;
        for (const { path, oldValue } of this.changes!.values()) {
          if (this.config.previousValues.some((matcher) => matcher.match(path))) {
            if (this._previousValues === NO_PREVIOUS_VALUES) {
              this._previousValues = Array.isArray(this.previous) ? [] : {};
            }
            this._previousValues = path.set(this._previousValues, oldValue);
          }
        }
      }
      return this._previousValues === NO_PREVIOUS_VALUES ? undefined : this._previousValues;
    }
    return undefined;
  }
  get patch(): Patch[] {
    return _patch(this.changeTree);
  }
  matches(pathExpression: string | PathMatcher) {
    const matcher = VersionInfo.toMatcher(pathExpression);
    if (this.previous) {
      return _matches(this.changeTree, matcher);
    } else {
      return matcher.findFirst(this.current) !== undefined;
    }
  }
  matchesAny(pathExpressions: (string | PathMatcher)[]) {
    return pathExpressions.some((pathExpression) => this.matches(pathExpression));
  }
  toJSON() {
    const changedPaths = this.changedPaths;
    return {
      current: this.current,
      changedPaths: changedPaths && Array.from(changedPaths),
      previous: this.previousValues,
    };
  }

  private get changeTree(): ChangeTree | undefined {
    if (this._changeTree === undefined) {
      this._changeTree = _changeTree(true, this.previous, this.current, this.config.diffConfig) ?? null;
    }
    return this._changeTree ?? undefined;
  }
  private static toMatcher(pathExpression: string | PathMatcher): PathMatcher {
    if (typeof pathExpression !== 'string') {
      return pathExpression;
    }
    let matcher = matcherCache.get(pathExpression);
    if (!matcher) {
      matcher = parsePathMatcher(pathExpression);
      if (matcherCache.size >= MATCHER_CACHE_SIZE) {
        matcherCache.clear();
      }
      matcherCache.set(pathExpression, matcher);
    }
    return matcher;
  }
}
