import { default as deepEqual } from 'fast-deep-equal';
import { Path } from '@finnair/path';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

const ROOT = Path.ROOT;

export interface ValidatorFn<Out = unknown, In = unknown> {
  (value: In, path: Path, ctx: ValidationContext): Out | PromiseLike<Out>;
}

export interface MappingFn<Out = unknown, In = unknown> {
  (value: In, path: Path, ctx: ValidationContext): Out | PromiseLike<Out>;
}

export interface ValidatorOptions {
  readonly group?: Group;
  readonly ignoreUnknownProperties?: boolean;
  readonly ignoreUnknownEnumValues?: boolean;
  readonly warnLogger?: WarnLogger;
}

export class ValidationContext {
  constructor(public readonly options: ValidatorOptions) {
    Object.freeze(this.options);
  }

  /**
   * Path-scoped cycle detection. For each object currently being validated, tracks the paths at
   * which its validation is in progress on the way down from the root. Keyed by object (not by
   * validator) so that the same object run through several validators *at the same path* -
   * `anyOf`/`allOf`/`oneOf` - is not a cycle; only re-entering an object as a *descendant* of a
   * path already in progress for it is.
   *
   * A single object can be in progress at several paths at once when it is shared across sibling
   * branches (a DAG) validated concurrently, and `leaveValidation` must remove exactly the path it
   * settled - a plain delete-by-object would pull a still-live sibling's cycle guard out from under
   * it. The overwhelmingly common case is an object reached at just one path, so the entry holds a
   * bare `Path` and only promotes to a `Path[]` when a second concurrent path appears; this keeps
   * the hot path allocation-free while still tracking every live path. Either way the entry is
   * cleared on exit, so a DAG (an object reached again via an acyclic path) is not mistaken for a
   * cycle and memory stays bounded by nesting depth, not object count.
   */
  private readonly inProgress = new Map<object, Path | Path[]>();

  /** Not readonly: `withFreeze` sets it on a derived context. Private, so it stays an internal. */
  private _freeze = false;

  /** True when converted output in this scope must be frozen. */
  get freeze(): boolean {
    return this._freeze;
  }

  /**
   * A context for a subtree whose output must be frozen. Derived by prototype from `this`, so it
   * shares cycle-detection state (a subtree is still the same traversal) and preserves any
   * subclass, differing only in `_freeze`. NOTE: this relies on `inProgress` being a TypeScript
   * `private` field - a `#private` one lives in a per-instance slot and would not resolve through
   * the prototype. Returns `this` when already freezing, so a deep frozen subtree derives once.
   */
  withFreeze(): this {
    if (this._freeze) {
      return this;
    }
    const derived: this = Object.create(this);
    derived._freeze = true;
    return derived;
  }

  /**
   * Marks validation of `value` at `path` as in progress. Returns `true` if `value` is already
   * being validated at an ancestor of `path` - i.e. a reference cycle - in which case the caller
   * must not descend and must not call `leaveValidation`. Only called for object values.
   */
  enterValidation(value: object, path: Path): boolean {
    const existing = this.inProgress.get(value);
    if (existing === undefined) {
      this.inProgress.set(value, path);
    } else if (Array.isArray(existing)) {
      for (let i = 0; i < existing.length; i++) {
        const existingPath = existing[i];
        if (existingPath.length < path.length && path.startsWith(existingPath)) {
          return true;
        }
      }
      existing.push(path);
    } else {
      if (existing.length < path.length && path.startsWith(existing)) {
        return true;
      }
      this.inProgress.set(value, [existing, path]);
    }
    return false;
  }

  /** Clears the `path` registered by a successful `enterValidation` of `value`. */
  leaveValidation(value: object, path: Path): void {
    const existing = this.inProgress.get(value);
    if (existing === undefined) {
      return;
    }
    if (Array.isArray(existing)) {
      const i = existing.findIndex(existingPath => existingPath.equals(path));
      if (i >= 0) {
        existing.splice(i, 1);
      }
      if (existing.length === 0) {
        this.inProgress.delete(value);
      }
    } else {
      this.inProgress.delete(value);
    }
  }

  /**
  * Optionally ignore an error for backwards compatible changes (enum values, new properties).
  */
  failure<Out = unknown, In = unknown>(violation: Violation | Violation[], value: In) {
    return new SyncPromise<Out>((resolve, reject) => {
    const violations: Violation[] = ([] as Violation[]).concat(violation);
    if (violations.length === 1 && this.ignoreViolation(violations[0])) {
      if (this.options.warnLogger) {
        this.options.warnLogger(violations[0], this.options);
      }
      resolve(value as unknown as Out);
    } else {
      reject(violations);
    }
    });
  }

  protected ignoreViolation(violation: Violation) {
    return (
      (this.options.ignoreUnknownEnumValues && violation.type === ValidatorType.EnumMismatch) ||
      (this.options.ignoreUnknownProperties && violation.type === ValidatorType.UnknownProperty)
    );
  }
}

/**
 * A `PromiseLike` that invokes its handlers **synchronously** the moment it settles, instead of
 * scheduling a microtask.
 *
 * This is an internal implementation detail of `Validator.validatePath`: it is what lets a chain of
 * synchronous validators collapse into ordinary function calls while still returning something the
 * caller can `await`. Asynchronous validators keep working - settling later simply invokes the
 * handlers later. Measured against real Promises on ~126K objects, this is ~3x faster and needs
 * ~25x less peak heap; against raw callbacks it costs around 10%.
 *
 * It is deliberately *not* a Promise and supports only what a validator chain needs:
 *
 * - **one subscriber.** `then` may be called once; a second call throws rather than silently
 *   dropping a handler. Use `Promise.resolve(...)` or `await` to get a real Promise from it.
 * - can settle only once. A second call to `settle` throws rather than silently dropping a result.
 * - **no chaining.** `then` returns the instance so the type is structurally `PromiseLike`, but the
 *   return value carries no result and must not be chained.
 * - **no unhandled-rejection tracking.** A rejection nobody subscribes to is silent.
 * - **no executor try/catch.** A synchronous throw propagates to the caller exactly as it did under
 *   the callback architecture, so a container can still attribute it to the right path.
 *
 * Public `Validator.validate` and `Validator.getValid` return real `Promise`s; this type never
 * escapes through them.
 */
export class SyncPromise<T> implements PromiseLike<T> {
  private static readonly PENDING = 0;
  private static readonly FULFILLED = 1;
  private static readonly REJECTED = 2;
  private static readonly DELIVERED = 3;

  private state = SyncPromise.PENDING;
  private value: any = undefined;
  private subscribed = false;
  private onFulfilled?: ((value: T) => any) | null;
  private onRejected?: ((error: any) => any) | null;

  /**
   * An already fulfilled promise, for a validator that can settle immediately - no executor and no
   * closures. Prefer this over `new SyncPromise(...)` whenever the result is known up front.
   */
  static resolve<V>(value: V): SyncPromise<V> {
    const promise = new SyncPromise<V>();
    promise.state = SyncPromise.FULFILLED;
    promise.value = value;
    return promise;
  }

  /** An already rejected promise. See `resolve`. */
  static reject<V = never>(error: any): SyncPromise<V> {
    const promise = new SyncPromise<V>();
    promise.state = SyncPromise.REJECTED;
    promise.value = error;
    return promise;
  }

  /**
   * @param executor invoked immediately with `resolve`/`reject`. Omitted only by `resolve`/`reject`
   *   above; a `SyncPromise` constructed without one never settles.
   */
  constructor(executor?: (resolve: SuccessCallback<T>, reject: FailureCallback) => void) {
    if (executor === undefined) {
      return;
    }
    executor(
      value => this.settle(SyncPromise.FULFILLED, value),
      error => this.settle(SyncPromise.REJECTED, error),
    );
  }

  private settle(state: number, value: any): void {
    if (this.state !== SyncPromise.PENDING) {
      throw new Error('SyncPromise already settled');
    }
    if (this.subscribed) {
      this.state = SyncPromise.DELIVERED;
      if (state === SyncPromise.FULFILLED) {
        this.onFulfilled!(value);
      } else {
        this.onRejected!(value);
      }
    } else {
      this.state = state;
      this.value = value;
    }
  }

  then<R1 = T, R2 = never>(onFulfilled: ((value: T) => any), onRejected: ((error: any) => any)): PromiseLike<R1 | R2> {
    if (this.state === SyncPromise.DELIVERED || this.subscribed) {
      throw new Error('SyncPromise supports a single subscriber: then() has already been called. Use Promise.resolve(syncPromise) for a chainable Promise.');
    }
    if (this.state === SyncPromise.FULFILLED) {
      this.state = SyncPromise.DELIVERED;
      const value = this.value;
      this.value = undefined;
      onFulfilled(value);
    } else if (this.state === SyncPromise.REJECTED) {
      this.state = SyncPromise.DELIVERED;
      const error = this.value;
      this.value = undefined;
      onRejected(error);
    } else {
      this.subscribed = true;
      this.onFulfilled = onFulfilled;
      this.onRejected = onRejected;
    }
    return this as unknown as PromiseLike<R1 | R2>;
  }
}

export interface SuccessCallback<Out = unknown> {
  (value: Out): void;
}
export interface FailureCallback {
  (error: any): void;
}

/**
 * Finds a {@link ValidatorConfigurationError} reported as an `ErrorViolation`, so that
 * `validate`/`getValid` can re-raise it rather than presenting a schema bug as invalid data.
 */
export function configurationErrorOf(violations: Violation[]): undefined | ValidatorConfigurationError {
  for (let i = 0; i < violations.length; i++) {
    const violation = violations[i];
    if (violation instanceof ErrorViolation && violation.error instanceof ValidatorConfigurationError) {
      return violation.error;
    }
  }
  return undefined;
}

/** @experimental See {@link ValidatorVisitor}. */
export class ValidatorVisitorContext {
  constructor(public readonly message: string) {}

  toString(): string {
    return this.message;
  }
}

export enum CompositeType {
  compositionOf = 'compositionOf',
  allOf = 'allOf',
  oneOf = 'oneOf',
  anyOf = 'anyOf',
  if = 'if',
  elseIf = 'else if',
  else = 'else',
}

export class CompositeVisitorContext extends ValidatorVisitorContext {
  constructor(public readonly type: CompositeType, public readonly current: number, public readonly count: number) {
    super(`${type}: ${current}/${count}`);
  }
}

export class GroupVisitorContext extends ValidatorVisitorContext {
  constructor(public readonly group?: string) {
    super(group ? `group: ${group}` : 'otherwise');
  }
}

/**
 * @experimental Internal and subject to change in any release; changes to it, especially to the
 * context types, are not considered breaking. Use at your own risk.
 */
export interface ValidatorVisitor {
  /**
   * @param validator Current validator instance
   * @param path Schema path to the validator, with `*` for array/set items and map/additional property entries
   * @param context The validator's role in its parent, if any: a {@link CompositeVisitorContext} for a
   *   composite branch, a {@link GroupVisitorContext} for a `V.whenGroup` branch, or a plain
   *   {@link ValidatorVisitorContext} such as `property`. `toString()` gives a readable label.
   *
   * @returns `true` if nested validators should be visited, `false` otherwise.
   */
  accept(validator: Validator<any, any>, path: Path, context?: ValidatorVisitorContext): boolean;
}

export abstract class Validator<Out = unknown, In = unknown> {
  validateGroup(value: In, group: Group): Promise<ValidationResult<Out>> {
    return this.validate(value, { group });
  }

  /**
  * Returns a valid value directly or throws a ValidationError with Violations.
  * 
  * @param value value to be validated
  * @param options validation options
  * @returns a valid, possibly converted value
  */
  async getValid(value: In, options?: ValidatorOptions): Promise<Out> {
    try {
      return await new Promise((resolve: (value: Out) => void, reject: (violations: Violation[]) => void) => {
        this.validatePathV2(value, ROOT, new ValidationContext(options || {}), resolve, reject);
      });
    } catch (error) {
      const violations = violationsOf(error, ROOT);
      const configurationError = configurationErrorOf(violations);
      if (configurationError) {
        throw configurationError;
      }
      throw new ValidationError(violations);
    }
  }

  /**
  * Returns a ValidationResult of value. 
  * 
  * @param value value to be validated
  * @param options validation options
  * @returns ValidationResult of either valid, possibly converted value or Violations
  */
  async validate(value: In, options?: ValidatorOptions): Promise<ValidationResult<Out>> {
    try {
      const result = await new Promise((resolve: (value: Out) => void, reject: (violations: Violation[]) => void) => {
        this.validatePathV2(value, ROOT, new ValidationContext(options || {}), resolve, reject);
      });
      return new ValidationResult(undefined, result);
    } catch (error) {
      const violations = violationsOf(error, ROOT);
      const configurationError = configurationErrorOf(violations);
      if (configurationError) {
        throw configurationError;
      }
      return new ValidationResult<Out>(violations);
    }
  }

  /**
  * Validate `value` and return either resolved of valid/converted value or rejected of Violation or Violation[] Promise.
  * @param value 
  * @param path 
  * @param ctx 
  */
  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((resolve: (value: Out) => void, reject: (violations: Violation[]) => void) => {
      this.validatePathV2(value, path, ctx,
        resolve,
        (error) => {
          reject(violationsOf(error, path));
        });
    });
  }

  /**
   * Validate value and call success callback with valid/converted value or failure callback with Violation[].
   * 
   * NOTE: Default implementation calls validatePath() for backwards compatibility. Subclasses should override this to provide a more efficient implementation.
   * 
   * @param value 
   * @param path 
   * @param ctx 
   * @param success 
   * @param failure 
   */
  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    this.validatePath(value, path, ctx).then(
      success,
      (error) => {
        failure(violationsOf(error, path));
      }
    );
  }

  /**
   * Walks this validator and its nested validators with `visitor`. `stack` is internal cycle
   * detection state; callers should omit it.
   *
   * @experimental See {@link ValidatorVisitor}.
   */
  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]) {
    visitor.accept(this, path, context);
  }

  /**
   * Indicates whether this validator allows undefined values to be skipped. If true, the validator 
   * will not be called for undefined values and the value will be considered valid. If false, the 
   * validator will be called for undefined values and may return a violation.
   * 
   * NOTE: Return `true` only if `undefined` input is allowed AND results in undefined output.
   * 
   * @returns true if undefined values are allowed and will be skipped, false otherwise.
   */
  skipUndefined(): boolean {
    return false;
  }

  supportsFreeze(): boolean {
    return false;
  }

  next<NextOut = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown>(...validators: NextCompositionParameters<NextOut, Out, T1, T2, T3, T4>) {
    return maybeCompositionOf(this, ...validators);
  }

  nextMap<NextOut>(fn: MappingFn<NextOut, Out>): Validator<NextOut, In> {
    return this.next<NextOut, In>(new ValueMapper<NextOut, Out>(fn));
  }
}

export type VType<V extends Validator<any>> = V extends Validator<infer Out> ? Out : unknown;

export interface WarnLogger {
  (violation: Violation, ctx: ValidatorOptions): void;
}

export class ValidationResult<T = unknown> {
  constructor(private readonly violations?: Violation[], private readonly value?: T) {
    if (violations?.length && value !== undefined) {
      throw new Error('both violations and success value defined');
    }
    Object.freeze(this.violations);
  }

  isSuccess() {
    return this.violations === undefined || this.violations.length === 0;
  }

  isFailure() {
    return !this.isSuccess();
  }

  /**
  * Either returns a valid, possibly converted value or throws a ValidationError with Violations.
  * @returns 
  */
  getValue(): T {
    if (!this.isSuccess()) {
      throw new ValidationError(this.getViolations());
    }
    return this.value!;
  }

  getViolations(): Violation[] {
    return this.violations || [];
  }
}

export class ValidationError extends Error {
  constructor(public readonly violations: Violation[]) {
    super(`ValidationError: ${JSON.stringify(violations, undefined, 2)}`);
    this.violations = violations;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class Violation {
  public readonly path: Path
  constructor(path: Path, public readonly type: string, public readonly invalidValue?: any) {
    this.path = path.freeze();
  }
}

export class TypeMismatch extends Violation {
  constructor(path: Path, public readonly expected: string, public readonly invalidValue?: any) {
    super(path, ValidatorType.TypeMismatch, invalidValue);
  }
}

export class EnumMismatch extends Violation {
  constructor(public readonly path: Path, public readonly enumType: string, public readonly invalidValue: any) {
    super(path, ValidatorType.EnumMismatch, invalidValue);
  }
}

export class ErrorViolation extends Violation {
  public readonly message?: string;
  constructor(path: Path, public readonly error: any) {
    super(path, 'Error');
    this.message = typeof error === 'object' ? error.message : undefined;
  }
}

export class HasValueViolation extends Violation {
  constructor(path: Path, public readonly expectedValue: any, invalidValue?: any) {
    super(path, 'HasValue', invalidValue);
  }
}

export class PatternViolation extends Violation {
  constructor(path: Path, public readonly pattern: string, public readonly invalidValue?: any) {
    super(path, ValidatorType.Pattern, invalidValue);
  }
}

export type OneOfResult = { success: true } | { violations: Violation[] };

export class OneOfMismatch extends Violation {
  constructor(path: Path, public readonly matches: number, public readonly results: OneOfResult[]) {
    super(path, ValidatorType.OneOf);
  }
}

export class MinViolation extends Violation {
  constructor(path: Path, public readonly min: number, public readonly inclusive: boolean, public readonly invalidValue?: any) {
    super(path, 'Min');
  }
}

export class MaxViolation extends Violation {
  constructor(path: Path, public readonly max: number, public readonly inclusive: boolean, public readonly invalidValue?: any) {
    super(path, 'Max');
  }
}

export class SizeViolation extends Violation {
  constructor(path: Path, public readonly min: number, public readonly max: number) {
    super(path, 'Size');
  }
}

export type GroupOrName = Group | string;

export class Group {
  private readonly allIncluded: { [s: string]: boolean };

  constructor(public readonly name: string, includes: GroupOrName[]) {
    this.allIncluded = {};
    this.allIncluded[name] = true;
    for (let i = 0; i < includes.length; i++) {
      const includedGroup = includes[i];
      if (isString(includedGroup)) {
        this.allIncluded[includedGroup as string] = true;
      } else {
        for (const name in (includedGroup as Group).allIncluded) {
          this.allIncluded[name] = true;
        }
      }
    }
    Object.freeze(this.allIncluded);
    Object.freeze(this);
  }

  includes(groupOrName: GroupOrName): boolean {
    const name = isString(groupOrName) ? (groupOrName as string) : (groupOrName as Group).name;
    return !!this.allIncluded[name];
  }

  static of(name: string, ...includes: GroupOrName[]) {
    return new Group(name, includes);
  }
}

export class Groups {
  private readonly groups: { [s: string]: Group } = {};

  define(name: string, ...includes: Array<GroupOrName>): Group {
    if (this.groups[name]) {
      throw new Error(`Group already defined: ${name}`);
    }
    const includeGroups: Group[] = [];
    for (let i = 0; i < includes.length; i++) {
      const groupOrName = includes[i];
      if (isString(groupOrName)) {
        includeGroups[i] = this.get(groupOrName as string);
      } else {
        includeGroups[i] = groupOrName as Group;
      }
    }
    this.groups[name] = new Group(name, includeGroups);
    return this.groups[name];
  }

  get(name: string) {
    const group = this.groups[name];
    if (!group) {
      throw new Error(`Group not found: ${name}`);
    }
    return group;
  }
}

export function isNullOrUndefined(value: any): value is null | undefined {
  return value === null || value === undefined;
}

export enum ValidatorType {
  TypeMismatch = 'TypeMismatch',
  UnknownProperty = 'UnknownProperty',
  UnknownPropertyDenied = 'UnknownPropertyDenied',
  EnumMismatch = 'EnumMismatch',
  NotNull = 'NotNull',
  NotEmpty = 'NotEmpty',
  NotBlank = 'NotBlank',
  Date = 'Date',
  DateTime = 'DateTime',
  AnyOf = 'AnyOf',
  OneOf = 'OneOf',
  Pattern = 'Pattern',
  NotUndefined = "NotUndefined",
  Cycle = 'Cycle',
  Async = 'Async',
}

export const defaultViolations = {
  date: (invalidValue: any, path: Path = ROOT, type: string = ValidatorType.Date) => new TypeMismatch(path, type, invalidValue),
  object: (path: Path = ROOT) => new TypeMismatch(path, 'object'),
  string: (invalidValue: any, path: Path = ROOT) => new TypeMismatch(path, 'string', invalidValue),
  boolean: (invalidValue: any, path: Path = ROOT) => new TypeMismatch(path, 'boolean', invalidValue),
  number: (invalidValue: any, format: NumberFormat = NumberFormat.number, path: Path = ROOT) => new TypeMismatch(path, format, invalidValue),
  min: (min: number, inclusive: boolean, invalidValue: any, path: Path = ROOT) => new MinViolation(path, min, inclusive, invalidValue),
  max: (max: number, inclusive: boolean, invalidValue: any, path: Path = ROOT) => new MaxViolation(path, max, inclusive, invalidValue),
  size: (min: number, max: number, path: Path = ROOT) => new SizeViolation(path, min, max),
  notNull: (path: Path = ROOT) => new Violation(path, ValidatorType.NotNull),
  notUndefined: (path: Path = ROOT) => new Violation(path, ValidatorType.NotUndefined),
  notEmpty: (path: Path = ROOT) => new Violation(path, ValidatorType.NotEmpty),
  notBlank: (path: Path = ROOT) => new Violation(path, ValidatorType.NotBlank),
  oneOf: (matches: number, results: OneOfResult[], path: Path = ROOT) => new OneOfMismatch(path, matches, results),
  pattern: (pattern: RegExp, invalidValue: any, path: Path = ROOT) => new PatternViolation(path, '' + pattern, invalidValue),
  enum: (name: string, invalidValue: any, path: Path = ROOT) => new EnumMismatch(path, name, invalidValue),
  unknownProperty: (path: Path) => new Violation(path, ValidatorType.UnknownProperty),
  unknownPropertyDenied: (path: Path) => new Violation(path, ValidatorType.UnknownPropertyDenied),
  cycle: (path: Path = ROOT) => new Violation(path, ValidatorType.Cycle),
  async: (path: Path = ROOT) => new Violation(path, ValidatorType.Async),
};

export interface AssertTrue<In = unknown> {
  (value: In, path: Path, ctx: ValidationContext): boolean;
}

export class ValidatorFnWrapper<Out = unknown, In = unknown> extends Validator<Out, In> {
  private readonly _supportsFreeze: boolean;
  constructor(private readonly fn: ValidatorFn<Out, In>, supportsFreeze: boolean = false) {
    super();
    // V.fn's second argument used to be an unused `type?: string`. A leftover string must not be
    // read as a freeze assertion, so anything but a boolean falls back to `false`.
    this._supportsFreeze = typeof supportsFreeze === 'boolean' ? supportsFreeze : false;
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    try {
      const maybePromise = this.fn(value, path, ctx);
      if (isPromise(maybePromise)) {
        maybePromise.then(
          success,
          error => {
            ctx.failure<Out>(violationsOf(error, path), value).then(success, failure);
          }
        );
      } else {
        success(maybePromise);
      }
    } catch (error) {
      ctx.failure<Out>(violationsOf(error, path), value).then(success, failure);
    }
  }
}

/**
 * Switches its wrapped validator's whole subtree to frozen output: every object and array converted
 * beneath it is passed through `Object.freeze`. Freezing is a property of *this view* of a schema,
 * not of the schema itself, so the same validator can be used mutably elsewhere.
 *
 * NOTE: `Object.freeze` seals properties only. Nested `Map`, `Set` and `Date` values stay mutable
 * (their mutators go through internal slots), as does the state of any other class instance.
 */
export class FreezeValidator<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(public readonly validator: Validator<Out, In>) {
    super();
    assertFreezable(validator);
    Object.freeze(this);
  }
  
  supportsFreeze(): boolean {
    return true;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validator.visit(visitor, path, context, stack);
    }
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    this.validator.validatePathV2(value, path, ctx.withFreeze(), success, failure);
  }

  skipUndefined(): boolean {
    return this.validator.skipUndefined();
  }
}

/**
 * Throws an error listing every validator, with its schema path, that prevents `validator` from
 * supporting freeze. Non-final steps of a `V.compositionOf`/`Validator.next` chain are not reported,
 * since only the last step produces the output.
 */
export function assertFreezable<Out=unknown, In = unknown>(validator: Validator<Out, In>): Validator<Out, In> {
  const nonFreezables = new Set<string>();
  validator.visit({
    accept: (v, path, context) => {
      if (v.supportsFreeze()) {
        return false;
      }
      // Only final validator in a composition chain counts for freeze support
      if (context instanceof CompositeVisitorContext && context.type === CompositeType.compositionOf && context.current !== context.count) {
        return false;
      }
      nonFreezables.add(`${path.toJSON()}: ${v.constructor.name}${context ? ` (${context})` : ''}`);
      return true;
    }
  }, Path.ROOT);
  if (nonFreezables.size > 0) {
    throw new Error(`The following validators do not support freeze:\n${Array.from(nonFreezables).join('\n')}`);
  }
  return validator;
}


export class ArrayValidator<Out = unknown> extends Validator<Out[]> {
  constructor(public readonly itemsValidator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this.itemsValidator.supportsFreeze();
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack: Validator<any, any>[] = []): void {
    if (visitor.accept(this, path, context)) {
      if (stack.includes(this)) {
        return;
      }
      stack.push(this);
      this.itemsValidator.visit(visitor, path.property('*'), undefined, stack);
      stack.pop();
    }
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<Out[]>, failure: FailureCallback): void {
    // Object.freeze returns `readonly Out[]`, which is not assignable to `Out[]` - so freeze for
    // effect and pass the original reference on, keeping the declared output type.
    const successFn = ctx.freeze
      ? (result: Out[]) => {
          Object.freeze(result);
          success(result);
        }
      : success;
    if (isNullOrUndefined(value)) {
      return failure([defaultViolations.notNull(path)]);
    }
    if (!Array.isArray(value)) {
      return failure([new TypeMismatch(path, 'array', value)]);
    }
    const convertedArray: Out[] = [];
    if (value.length === 0) {
      return successFn(convertedArray);
    }
    let expectedResponses = value.length;
    let violations: Violation[] = [];

    const reportResult = () => {
      if (--expectedResponses === 0) {
        if (violations.length > 0) {
          failure(violations);
        } else {
          successFn(convertedArray);
        }
      }
    };

    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const itemPath = path.index(i);
      try {
        this.itemsValidator.validatePathV2(item, itemPath, ctx,
          (convertedItem) => {
            convertedArray[i] = convertedItem;
            reportResult();
          },
          (error) => {
            violations = violations.concat(error);
            reportResult();
          });
      } catch (error) {
        violations = violations.concat(violationsOf(error, itemPath));
        reportResult();
      }
    }
  }
}

export class ArrayNormalizer<T> extends ArrayValidator<T> {
  constructor(itemsValidator: Validator<T>) {
    super(itemsValidator);
  }
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<T[]>, failure: FailureCallback) {
    if (value === undefined) {
      return super.validatePathV2([], path, ctx, success, failure);
    }
    if (Array.isArray(value)) {
      return super.validatePathV2(value, path, ctx, success, failure);
    }
    return super.validatePathV2([value], path, ctx, success, failure);
  }
}

export class CheckValidator<In> extends Validator<In, In> {
  constructor(public readonly validator: Validator<any, In>, private readonly _supportsFreeze: boolean = false) {
    super();
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validator.visit(visitor, path, undefined, stack);
    }
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<In>, failure: FailureCallback): void {
    return this.validator.validatePathV2(value, path, ctx, () => success(value), failure);
  }
}

export abstract class CompositeValidator<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(private readonly _skipUndefined: boolean, private readonly _supportsFreeze: boolean) {
    super();
  }

  skipUndefined(): boolean {
    return this._skipUndefined;
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }
}

export class CompositionValidator<Out = unknown, In = any> extends CompositeValidator<Out, In> {
  public readonly validators: Validator[];
  constructor(validators: Validator[]) {
    super(validators.every((v) => v.skipUndefined()), validators[validators.length - 1].supportsFreeze());
    this.validators = ([] as Validator[]).concat(validators);
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    const validateNext = (index: number, currentValue: any) => {
      if (index < this.validators.length) {
        try {
          this.validators[index].validatePathV2(currentValue, path, ctx,
            (result) => validateNext(index + 1, result),
            (error) => failure(violationsOf(error, path))
          );
        } catch (error) {
          // A validator in the chain threw. Report it here rather than letting it unwind
          // into an upstream validator that has already reported its own result.
          failure(violationsOf(error, path));
        }
      } else {
        // NOTE: outside the try - a throw from here belongs to the caller's continuation.
        success(currentValue);
      }
    }
    validateNext(0, value);
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validators.forEach((validator, index) => validator.visit(visitor, path, new CompositeVisitorContext(CompositeType.compositionOf, index+1, this.validators.length), stack));
    }
  }
}

export class OneOfValidator<Out = unknown> extends Validator<Out> {
  private readonly _supportsFreeze: boolean;
  constructor(public readonly validators: [Validator<Out>, ...Validator<Out>[]]) {
    super();
    this._supportsFreeze = validators.every((v) => v.supportsFreeze());
    // NOTE: This doesn't skipUndefined because a child validator may allow undefined even if it's not configured to skipUndefined
    Object.freeze(this.validators);
    Object.freeze(this);
  }
  
  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validators.forEach((validator, index) => validator.visit(visitor, path, new CompositeVisitorContext(CompositeType.oneOf, index+1, this.validators.length), stack));
    }
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    let matches = 0;
    let newValue: any = null;
    const results: OneOfResult[] = [];

    const reportResults = () => matches === 1 ? success(newValue) : failure(defaultViolations.oneOf(matches, results, path));

    const validateNext = (index: number) => {
      if (index < this.validators.length) {
        this.validators[index].validatePathV2(value, path, ctx,
          (result) => {
            matches++;
            newValue = result;
            results.push({ success: true });
            validateNext(index + 1);
          },
          (error) => {
            const violations = violationsOf(error, path);
            if (configurationErrorOf(violations)) {
              return failure(violations);
            }
            results.push({ violations });
            validateNext(index + 1);
          }
        );
      } else {
        reportResults();
      }
    };
    validateNext(0);
  }
}

/**
 * Runs input through all validators requiring that one or more succeed. Returns the first 
 * successful result. If multiple validators succeed, they must return deepEqual value.
 * Consider wrapping child validators with `V.check()` to ensure that there are no
 * conflicting conversions.
 */
export class AnyOfValidator<Out = unknown, In = unknown> extends Validator<Out, In> {
  private readonly _supportsFreeze: boolean;
  constructor(public readonly validators: Validator<Out>[]) {
    super();
    if (this.validators.length === 0) {
      throw new Error('At least one validator required');
    }
    this._supportsFreeze = this.validators.every((v) => v.supportsFreeze());
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validators.forEach((validator, index) => validator.visit(visitor, path, new CompositeVisitorContext(CompositeType.anyOf, index+1, this.validators.length), stack));
    }
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    let violations: Violation[] = [];
    let configurationError: undefined | Violation[];
    const conflictingConversions: Set<any> = new Set();
    let foundMatch = false;
    let convertedValue: any;
    let expectedResponses = this.validators.length;

    const reportResult = (result: undefined | Out, error: any) => {
      if (error) {
        const errorViolations = violationsOf(error, path);
        if (!configurationError && configurationErrorOf(errorViolations)) {
          configurationError = errorViolations;
        }
        violations = violations.concat(errorViolations);
      } else if (!foundMatch) {
        convertedValue = result;
        foundMatch = true;
      } else if (!deepEqual(result, convertedValue)) {
        conflictingConversions.add(convertedValue);
        conflictingConversions.add(result);
      }
      if (--expectedResponses === 0) {
        if (configurationError) {
          failure(configurationError);
        } else if (conflictingConversions.size > 0) {
          failure(violationsOf(new ValidatorConfigurationError(`ConflictingConversions for anyOf(${path}): ${Array.from(conflictingConversions).join(', ')}`), path));
        } else if (foundMatch) {
          success(convertedValue);
        } else {
          failure(violations);
        }
      }
    }
    for (const validator of this.validators) {
      try {
        validator.validatePathV2(
          value,
          path,
          ctx,
          (result) => reportResult(result, undefined),
          (error) => reportResult(undefined, error)
        );
      } catch (error) {
        reportResult(undefined, error);
      }
    }
  }
}

export class IfValidator<If = unknown, In = unknown, Else = unknown> extends Validator<If | Else, In> {
  private readonly _supportsFreeze: boolean;
  constructor(public readonly conditionals: Conditional<If, In>[], public readonly elseValidator?: Validator<Else, In>) {
    super();
    if (conditionals.length === 0) {
      throw new Error('At least one conditional required');
    }
    this._supportsFreeze = this.conditionals.every((c) => c.validator.supportsFreeze()) && (!this.elseValidator || this.elseValidator.supportsFreeze());
    Object.freeze(this.conditionals);
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    const count = this.conditionals.length + (this.elseValidator ? 1 : 0);
    if (visitor.accept(this, path, context)) {
      this.conditionals.forEach((conditional, index) => conditional.validator.visit(
        visitor, 
        path, 
        index === 0 ? new CompositeVisitorContext(CompositeType.if, index+1, count) : new CompositeVisitorContext(CompositeType.elseIf, index+1, count), 
        stack
      ));
      if (this.elseValidator) {
        this.elseValidator.visit(visitor, path, new CompositeVisitorContext(CompositeType.else, count, count), stack);
      }
    }
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<If | Else>, failure: FailureCallback): void {
    for (let i = 0; i < this.conditionals.length; i++) {
      const conditional = this.conditionals[i];
      if (conditional.fn(value, path, ctx)) {
        return conditional.validator.validatePathV2(value, path, ctx, success, failure);
      }
    }
    if (this.elseValidator) {
      return this.elseValidator.validatePathV2(value, path, ctx, success, failure);
    }
    failure(new Violation(path, 'NoMatchingCondition', value));
  }

  elseIf<ElIf, ElIn>(fn: AssertTrue, validator: Validator<ElIf, ElIn>): IfValidator<If | ElIf, In | ElIn, Else> {
    if (this.elseValidator) {
      throw new Error('Else is already defined. Define elseIfs first.');
    }
    return new IfValidator<If | ElIf, In | ElIn, Else>(
      [...this.conditionals, new Conditional(fn, validator)] as Conditional<If | ElIf, In | ElIn>[],
      this.elseValidator
    );
  }

  else<Else>(validator: Validator<Else>): IfValidator<If, In, Else> {
    if (this.elseValidator) {
      throw new Error('Else is already defined.');
    }
    return new IfValidator<If, In, Else>(this.conditionals, validator);
  }
}

export class Conditional<Out = unknown, In = unknown> {
  constructor(public readonly fn: AssertTrue<In>, public readonly validator: Validator<Out, In>) {
    Object.freeze(this.validator);
    Object.freeze(this);
  }
}

export class WhenGroupValidator<When = unknown, Otherwise = unknown, In = unknown> extends CompositeValidator<When | Otherwise, In> {
  constructor(public readonly whenGroups: WhenGroup<When>[], public readonly otherwiseValidator?: Validator<Otherwise>) {
    // The otherwise branch produces the result whenever no group matches, so it has to support
    // freezing too - `otherwiseSuccess()` hands the input straight back, for instance.
    super(
      false,
      whenGroups.every(wg => wg.validator.supportsFreeze()) && (!otherwiseValidator || otherwiseValidator.supportsFreeze()),
    );
    Object.freeze(this.whenGroups);
    Object.freeze(this);
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.whenGroups.forEach((whenGroup, index) => whenGroup.validator.visit(visitor, path, new GroupVisitorContext(whenGroup.group), stack));
      if (this.otherwiseValidator) {
        this.otherwiseValidator.visit(visitor, path, new GroupVisitorContext(), stack);
      }
    }
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<When | Otherwise>, failure: FailureCallback): void {
    const group = ctx.options?.group;
    let groupMatches = 0;
    let violations: Violation[] = [];
    const report = (currentValue?: any) => {
      if (violations.length > 0) {
        failure(violations);
      } else if (groupMatches > 0) {
        success(currentValue);
      } else if (this.otherwiseValidator) {
        this.otherwiseValidator.validatePathV2(value, path, ctx, success, failure);
      } else {
        failure([new Violation(path, 'NoMatchingGroup', value)]);
      }
    }
    if (group) {
      const validateNext = (index: number, currentValue: any) => {
        if (index < this.whenGroups.length) {
          const whenGroup = this.whenGroups[index];
          if (group.includes(whenGroup.group)) {
            groupMatches++;
            whenGroup.validator.validatePathV2(value, path, ctx,
              (result) => {
                validateNext(index + 1, result);
              },
              (error) => {
                violations = violations.concat(violationsOf(error, path));
                validateNext(index + 1, currentValue);
              }
            );
          } else {
            validateNext(index + 1, currentValue);
          }
        } else {
          report(currentValue);
        }
      };
      validateNext(0, value);
    } else {
      report(value);
    }
  }

  whenGroup<W = unknown>(group: GroupOrName, validator: Validator<W>): WhenGroupValidator<When | W, Otherwise> {
    if (this.otherwiseValidator) {
      throw new Error('Otherwise already defined. Define whenGroups first.');
    }
    return new WhenGroupValidator<When | W, Otherwise>([...this.whenGroups, new WhenGroup(group, validator)], this.otherwiseValidator);
  }

  otherwise<O>(validator: Validator<O>): Validator<When | O> {
    if (this.otherwiseValidator) {
      throw new Error('Otherwise already defined.');
    }
    return new WhenGroupValidator<When, O>(this.whenGroups, validator);
  }

  otherwiseSuccess() {
    return this.otherwise<In>(new IdentityValidator<In>());
  }
}
export class WhenGroup<T> {
  public readonly group: string;

  constructor(group: GroupOrName, public readonly validator: Validator<T>) {
    this.group = isString(group) ? (group as string) : (group as Group).name;
    Object.freeze(this);
  }
}

export class MapValidator<K = unknown, V = unknown, E extends boolean = true> extends Validator<E extends true ? JsonMap<K, V> : Map<K, V>> {
  constructor(public readonly keys: Validator<K>, public readonly values: Validator<V>, public readonly jsonSafeMap: E) {
    super();
    Object.freeze(this);
  }
  
  supportsFreeze(): boolean {
    return this.keys.supportsFreeze() && this.values.supportsFreeze();
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack: Validator<any, any>[] = []): void {
    if (visitor.accept(this, path, context)) {
      if (stack.includes(this)) {
        return;
      }
      stack.push(this);
      this.keys.visit(visitor, path.property('*'), new ValidatorVisitorContext('key'), stack);
      this.values.visit(visitor, path.property('*'), new ValidatorVisitorContext('value'), stack);
      stack.pop();
    }
  }
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<E extends true ? JsonMap<K, V> : Map<K, V>>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure(defaultViolations.notNull(path));
    }
    if (!(value instanceof Map)) {
      return failure(new TypeMismatch(path, 'Map'));
    }
    const map: Map<any, any> = value as Map<any, any>;
    let violations: Violation[] = [];
    const entries: [K, V][] = [];
    let expectedResponses = map.size * 2;

    const reportResult = () => {
      if (violations.length > 0) {
        failure(violations);
      } else {
        const result = this.jsonSafeMap
          ? new JsonMap<K, V>(entries)
          : ctx.freeze
            ? new FreezableMap<K, V>(entries)
            : new Map<K, V>(entries);
        success((ctx.freeze ? (result as FreezableMap<K, V>).freeze() : result) as any);
      }
    }

    if (map.size === 0) {
      reportResult();
    }

    const reportEntry = (entryIndex: number, keyOrValue: 0 | 1, value: undefined | any, error: undefined | any) => {
      if (error) {
        violations = violations.concat(violationsOf(error, path.index(entryIndex).index(keyOrValue)));
      } else {
        entries[entryIndex] = entries[entryIndex] ?? [];
        entries[entryIndex][keyOrValue] = value;
      }
      if (--expectedResponses === 0) {
        reportResult();
      }
    };

    let i = 0;
    for (const [key, value] of map) {
      const entryIndex = i++;
      const entryPath = path.index(entryIndex);
      try {
        this.keys.validatePathV2(key, entryPath.index(0), ctx,
          (result) => reportEntry(entryIndex, 0, result, undefined),
          (error) => reportEntry(entryIndex, 0, undefined, error)
        );
      } catch (error) {
        reportEntry(entryIndex, 0, undefined, error);
      }
      try {
        this.values.validatePathV2(value, entryPath.index(1), ctx,
          (result) => reportEntry(entryIndex, 1, result, undefined),
          (error) => reportEntry(entryIndex, 1, undefined, error)
        );
      } catch (error) {
        reportEntry(entryIndex, 1, undefined, error);
      }
    }
  }
}

export class MapNormalizer<K = unknown, V = unknown, E extends boolean = true> extends MapValidator<K, V, E> {
  constructor(keys: Validator<K>, values: Validator<V>, jsonSafeMap: E) {
    super(keys, values, jsonSafeMap);
  }
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<E extends true ? JsonMap<K, V> : Map<K, V>>, failure: FailureCallback): void {
    if (value instanceof Map) {
      return super.validatePathV2(value, path, ctx, success, failure);
    }
    if (Array.isArray(value)) {
      let violations: Violation[] = [];
      const map = new Map<any, any>();
      for (let i = 0; i < value.length; i++) {
        const entry = value[i];
        if (Array.isArray(entry)) {
          if (entry.length >= 1 && entry.length <= 2) {
            map.set(entry[0], entry[1]);
          } else {
            violations.push(new SizeViolation(path.index(i), 1, 2));
          }
        } else {
          violations.push(new TypeMismatch(path.index(i), 'Array'));
        }
      }
      if (violations.length > 0) {
        return failure(violations);
      }
      return super.validatePathV2(map, path, ctx, success, failure);
    }
    return failure(new TypeMismatch(path, 'Map OR array of [key, value] arrays'));
  }
}

/**
 * Thrown-on-mutation guard installed by `FreezableMap.freeze`/`FreezableSet.freeze`.
 *
 * The guard is installed as own properties on the instance rather than as overridden prototype
 * methods, for two reasons. `Map`/`Set` constructors call `this.set`/`this.add` for each entry of
 * their argument, *before* subclass fields are installed - an override that consulted a `#private`
 * flag would throw during construction - and shadowing keeps the native methods on the prototype,
 * so a collection that is never frozen pays nothing.
 */
function throwFrozen(type: string, method: string): () => never {
  return () => {
    throw new TypeError(`Cannot ${method} a frozen ${type}`);
  };
}

/**
 * A `Map` that can be made read-only in place by `freeze()`, used for the output of a memoized or
 * otherwise shared validator. `Object.freeze` cannot do this: it seals properties, while a `Map`'s
 * contents live in an internal slot and `set`/`delete`/`clear` go straight past it.
 *
 * NOTE: this is a guard against accidental mutation, not immutability. The instance is frozen so
 * the guard cannot be removed, but invoking the native method directly -
 * `Map.prototype.set.call(frozenMap, k, v)` - still mutates the map.
 */
export class FreezableMap<K, V> extends Map<K, V> {
  /** Makes this map reject `set`, `delete` and `clear`. Idempotent; returns `this`. */
  freeze(): this {
    if (Object.isFrozen(this)) {
      return this;
    }
    this.set = throwFrozen('Map', 'set');
    this.delete = throwFrozen('Map', 'delete');
    this.clear = throwFrozen('Map', 'clear');
    // Freeze the instance too, so the guard cannot be assigned or deleted away.
    Object.freeze(this);
    return this;
  }
}

export class JsonMap<K, V> extends FreezableMap<K, V> {
  constructor(entries?: readonly (readonly [K, V])[] | null) {
    super(entries);
  }
  toJSON() {
    return [...this.entries()];
  }
}

export class SetValidator<T = unknown, E extends boolean = true> extends Validator<E extends true ? JsonSet<T> : Set<T>> {
  constructor(public readonly values: Validator<T>, public readonly jsonSafeSet: E) {
    super();
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this.values.supportsFreeze();
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack: Validator<any, any>[] = []): void {
    if (visitor.accept(this, path, context)) {
      if (stack.includes(this)) {
        return;
      }
      stack.push(this);
      this.values.visit(visitor, path.property('*'), undefined, stack);
      stack.pop();
    }
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<E extends true ? JsonSet<T> : Set<T>>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure([defaultViolations.notNull(path)]);
    }
    if (!(value instanceof Set || Array.isArray(value))) {
      return failure(new TypeMismatch(path, 'Set'));
    }

    const items: T[] = [];
    let violations: Violation[] = [];
    let expectedResponses = (value instanceof Set ? value.size : value.length);

    const reportResult = () => {
      if (violations.length > 0) {
        failure(violations);
      } else {
        const result = this.jsonSafeSet
          ? new JsonSet<T>(items)
          : ctx.freeze
            ? new FreezableSet<T>(items)
            : new Set<T>(items);
        success((ctx.freeze ? (result as FreezableSet<T>).freeze() : result) as any);
      }
    };

    if (expectedResponses === 0) {
      return reportResult();
    }

    const reportItem = (index: number, item: any, error: any) => {
      if (error) {
        violations = violations.concat(violationsOf(error, path.index(index)));
      } else {
        items[index] = item;
      }
      if (--expectedResponses === 0) {
        reportResult();
      }
    };

    let i = 0;
    for (const entry of value) {
      const index = i++
      try {
        this.values.validatePathV2(entry, path.index(index), ctx,
          (result) => reportItem(index, result, undefined),
          (error) => reportItem(index, undefined, error)
        );
      } catch (error) {
        reportItem(index, undefined, error);
      }
    }
  }
}

/**
 * A `Set` that can be made read-only in place by `freeze()`. See {@link FreezableMap} for why
 * `Object.freeze` is not enough and for the limits of the guard.
 */
export class FreezableSet<T> extends Set<T> {
  /** Makes this set reject `add`, `delete` and `clear`. Idempotent; returns `this`. */
  freeze(): this {
    if (Object.isFrozen(this)) {
      return this;
    }
    this.add = throwFrozen('Set', 'add');
    this.delete = throwFrozen('Set', 'delete');
    this.clear = throwFrozen('Set', 'clear');
    Object.freeze(this);
    return this;
  }
}

export class JsonSet<K> extends FreezableSet<K> {
  constructor(values?: readonly K[] | null) {
    super(values);
  }
  toJSON() {
    return [...this.values()];
  }
}

export class JsonBigInt {
  public readonly value: bigint;
  constructor(value: bigint | string | number) {
    switch (typeof value) {
      case 'bigint':
        this.value = value as bigint;
        break;
      case 'string':
      case 'number':
        this.value = BigInt(value);
        break;
      default:
        throw new Error('Expected bigint, got ' + typeof value);
    }
    Object.freeze(this);
  }
  valueOf() {
    return this.value;
  }
  toJSON() {
    return this.value.toString(10);
  }
}

export class AnyValidator<InOut = any> extends Validator<InOut> {
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<InOut>, failure: FailureCallback): void {
    success(value as InOut);
  }
  supportsFreeze(): boolean {
    return false;
  }
}

export class UnknownValidator<InOut = unknown> extends Validator<InOut> {
  validatePathV2(value: InOut, path: Path, ctx: ValidationContext, success: SuccessCallback<InOut>, failure: FailureCallback): void {
    success(value);
  }
  supportsFreeze(): boolean {
    return false;
  }
}

export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isSimplePrimitive(value: any) {
  const type = typeof value;
  return type === 'boolean' || type === 'number' || type === 'bigint' || type === 'string' || type === 'symbol';
}

export abstract class StringValidatorBase<In> extends Validator<string, In> {

  supportsFreeze(): boolean {
    return true;
  }

  notEmpty() {
    return new NextStringValidator(this, new NotEmptyValidator<string>());
  }

  notBlank() {
    return new NextStringValidator(this, new NotBlankValidator());
  }

  pattern(pattern: string | RegExp, flags?: string) {
    return new NextStringValidator(this, new PatternValidator(pattern, flags));
  }

  size(min: number, max: number) {
    return new NextStringValidator(this, new SizeValidator<string>(min, max));
  }
}

export class NextStringValidator extends StringValidatorBase<string> {
  constructor(public readonly firstValidator: Validator<string, any>, public readonly nextValidator: Validator<string, any>) {
    super();
    Object.freeze(this);
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.firstValidator.visit(visitor, path, new CompositeVisitorContext(CompositeType.compositionOf, 1, 2), stack);
      this.nextValidator.visit(visitor, path, new CompositeVisitorContext(CompositeType.compositionOf, 2, 2), stack);
    }
  }

  validatePathV2(value: string, path: Path, ctx: ValidationContext, success: SuccessCallback<string>, failure: FailureCallback): void {
    this.firstValidator.validatePathV2(value, path, ctx,
      (firstResult) => this.nextValidator.validatePathV2(firstResult, path, ctx, success, failure),
      failure);
  }
}

export class StringValidator extends StringValidatorBase<string> {
  validatePathV2(value: string, path: Path, ctx: ValidationContext, success: SuccessCallback<string>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure([defaultViolations.notNull(path)]);
    } else if (isString(value)) {
      success(value);
    } else {
      failure([defaultViolations.string(value, path)]);
    }
  }
}

export class StringNormalizer extends StringValidatorBase<unknown> {
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<string>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure([defaultViolations.notNull(path)]);
    } else if (isString(value)) {
      success(value);
    } else if (value instanceof String) {
      success(value.valueOf());
    } else if (isSimplePrimitive(value)) {
      success(String(value));
    } else {
      failure([new TypeMismatch(path, 'primitive value', value)]);
    }
  }
}

export class NotNullOrUndefinedValidator<InOut> extends Validator<Exclude<InOut, null | undefined>, InOut> {
  validatePathV2(value: InOut, path: Path, ctx: ValidationContext, success: SuccessCallback<Exclude<InOut, null | undefined>>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure([defaultViolations.notNull(path)]);
    } else {
      success(value as any);
    }
  }
  supportsFreeze(): boolean {
    return false;
  }
}

export class IsNullOrUndefinedValidator extends Validator<null | undefined> {
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<null | undefined>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      success(value);
    } else {
      failure([new TypeMismatch(path, 'NullOrUndefined', value)]);
    }
  }
  supportsFreeze(): boolean {
    return true;
  }
}

export class NotEmptyValidator<InOut extends { length: number }> extends Validator<InOut, InOut> {
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<InOut>, failure: FailureCallback): void {
    if (!isNullOrUndefined(value) && isNumber((value as any).length) && (value as any).length > 0) {
      success(value as InOut);
    } else {
      failure([defaultViolations.notEmpty(path)]);
    }
  }
  supportsFreeze(): boolean {
    return true;
  }
}

export class SizeValidator<InOut extends { length: number }> extends Validator<InOut, InOut> {
  constructor(private readonly min: number, private readonly max: number) {
    super();
    if (max < min) {
      throw new Error('Size: max should be >= than min');
    }
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return true;
  }
  validatePathV2(value: InOut, path: Path, ctx: ValidationContext, success: SuccessCallback<InOut>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure([defaultViolations.notNull(path)]);
    } else if (!isNumber(value.length)) {
      failure([new TypeMismatch(path, 'value with numeric length field', value)]);
    } else if (value.length < this.min || value.length > this.max) {
      failure([defaultViolations.size(this.min, this.max, path)]);
    } else {
      success(value);
    }
  }
}

export class NotBlankValidator extends Validator<string, string> {
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<string>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure([defaultViolations.notBlank(path)]);
    } else if (!isString(value)) {
      failure([defaultViolations.string(value, path)]);
    } else {
      const trimmed = (value as string).trim();
      if (trimmed === '') {
        failure([defaultViolations.notBlank(path)]);
      } else {
        success(value as string);
      }
    }
  }
  supportsFreeze(): boolean {
    return true;
  }
}

export class BooleanValidator extends Validator<boolean> {
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<boolean>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure(defaultViolations.notNull(path));
    } else if (typeof value === 'boolean') {
      success(value);
    } else {
      failure(defaultViolations.boolean(value, path));
    }
  }
  supportsFreeze(): boolean {
    return true;
  }
}

export class BooleanNormalizer extends Validator<boolean> {
  constructor(public readonly truePattern: RegExp, public readonly falsePattern: RegExp) {
    super();
    Object.freeze(this.truePattern);
    Object.freeze(this.falsePattern);
    Object.freeze(this);
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<boolean>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure([defaultViolations.notNull(path)]);
    } else if (typeof value === 'boolean') {
      success(value);
    } else if (value instanceof Boolean) {
      success(value.valueOf());
    } else if (isString(value)) {
      if (this.truePattern.test(value)) {
        success(true);
      } else if (this.falsePattern.test(value)) {
        success(false);
      } else {
        failure([defaultViolations.boolean(value, path)]);
      }
    } else if (isNumber(value)) {
      success(!!value);
    } else {
      failure([defaultViolations.boolean(value, path)]);
    }
  }
  supportsFreeze(): boolean {
    return true;
  }
}

export enum NumberFormat {
  number = 'number',
  integer = 'integer',
}

export function isNumber(value: any): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export abstract class NumberValidatorBase<In> extends Validator<number, In> {
  constructor() {
    super();
  }

  supportsFreeze(): boolean {
    return true;
  }

  min(min: number, inclusive = true) {
    return new NextNumberValidator<In>(this, new MinValidator(min, inclusive));
  }

  max(max: number, inclusive = true) {
    return new NextNumberValidator<In>(this, new MaxValidator(max, inclusive));
  }

  between(min: number, max: number, minInclusive = true, maxInclusive = true) {
    if (minInclusive && maxInclusive) {
      if (!(min <= max)) {
        throw new Error('Between: min shuold be <= max when both are inclusive (i.e. min <= max)');
      }
    } else if (!(min < max)) {
      throw new Error('Between: min should be < max when either min or max is exclusive');
    }
    return new NextNumberValidator<In>(this, new CompositionValidator<number, number>([new MinValidator(min, minInclusive), new MaxValidator(max, maxInclusive)]))
  }

  protected validateNumberFormat(value: number, format: undefined | NumberFormat, path: Path, ctx: ValidationContext, success: SuccessCallback<number>, failure: FailureCallback): void {
    switch (format) {
      case NumberFormat.integer:
        if (!Number.isInteger(value)) {
          return failure(defaultViolations.number(value, format, path));
        }
        break;
    }
    success(value);
  }
}

const bigIntFormat = /^-?[0-9]+$/;

export class JsonBigIntValidator extends Validator<JsonBigInt, any> {
  constructor() {
    super();
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return true;
  }
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<JsonBigInt>, failure: FailureCallback): void {
    const valueType = typeof value;
    switch (valueType) {
      case 'bigint':
        return success(new JsonBigInt(value));
      case 'number':
        try {
          return success(new JsonBigInt(BigInt(value)));
        } catch (e) {
          return failure(new TypeMismatch(path, 'integer', value));
        }
      case 'string':
        if (value.match(bigIntFormat)) {
          return success(new JsonBigInt(BigInt(value)));
        } else {
          return failure(new TypeMismatch(path, bigIntFormat.toString(), value));
        }
      case 'object':
        if (value instanceof JsonBigInt) {
          return success(value);
        }
        break;
    }
    return failure(new TypeMismatch(path, 'JsonBigInt, bigint or integer as number or string', value));
  }
}

export class NextNumberValidator<In> extends NumberValidatorBase<In> {
  constructor(public readonly firstValidator: Validator<number, any>, public readonly nextValidator: Validator<number, any>) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<number>, failure: FailureCallback): void {
    this.firstValidator.validatePathV2(value, path, ctx,
      (firstResult) => this.nextValidator.validatePathV2(firstResult, path, ctx, success, failure),
      failure);
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.firstValidator.visit(visitor, path, new CompositeVisitorContext(CompositeType.compositionOf, 1, 2), stack);
      this.nextValidator.visit(visitor, path, new CompositeVisitorContext(CompositeType.compositionOf, 2, 2), stack);
    }
  }
}

export class NumberValidator extends NumberValidatorBase<number> {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<number>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure(defaultViolations.notNull(path));
    } else if (!isNumber(value)) {
      failure(defaultViolations.number(value, this.format, path));
    } else {
      super.validateNumberFormat(value, this.format, path, ctx, success, failure);
    }
  }
}

export class NumberNormalizer extends NumberValidatorBase<any> {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<number>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure(defaultViolations.notNull(path));
    } else if (isNumber(value)) {
      super.validateNumberFormat(value, this.format, path, ctx, success, failure);
    } else if (value instanceof Number) {
      super.validateNumberFormat(value.valueOf(), this.format, path, ctx, success, failure);
    } else if (isString(value)) {
      if (value.trim() === '') {
        failure(defaultViolations.number(value, this.format, path));
      } else {
        const nbr = Number(value);
        if (isNumber(nbr)) {
          super.validateNumberFormat(nbr, this.format, path, ctx, success, failure);
        } else {
          failure(defaultViolations.number(value, this.format, path));
        }
      }
    } else {
      failure(defaultViolations.number(value, this.format, path));
    }
  }
}

export class MinValidator extends Validator<number, number> {
  constructor(public readonly min: number, public readonly inclusive: boolean) {
    super();
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return true;
  }

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<number>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure(defaultViolations.notNull(path));
    }
    if (!isNumber(value)) {
      return failure(defaultViolations.number(value, NumberFormat.number, path));
    }
    if (this.inclusive) {
      if (value < this.min) {
        return failure(defaultViolations.min(this.min, this.inclusive, value, path));
      }
    } else if (value <= this.min) {
      return failure(defaultViolations.min(this.min, this.inclusive, value, path));
    }
    return success(value);
  }
}

export class MaxValidator extends Validator<number, number> {
  constructor(public readonly max: number, public readonly inclusive: boolean) {
    super();
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return true;
  }

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<number>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure(defaultViolations.notNull(path));
    }
    if (!isNumber(value)) {
      return failure(defaultViolations.number(value, NumberFormat.number, path));
    }
    if (this.inclusive) {
      if (value > this.max) {
        return failure(defaultViolations.max(this.max, this.inclusive, value, path));
      }
    } else if (value >= this.max) {
      return failure(defaultViolations.max(this.max, this.inclusive, value, path));
    }
    return success(value);
  }
}

export class EnumValidator<Out extends Record<string, string | number>> extends Validator<Out[keyof Out]> {
  private readonly _values: Set<string | number>;
  constructor(public readonly enumType: Out, public readonly name: string) {
    super();
    this._values = new Set(Object.values(enumType));
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return true;
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<Out[keyof Out]>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure([defaultViolations.notNull(path)]);
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const isValid = this._values.has(value);
      if (isValid) {
        return success(value as Out[keyof Out]);
      }
    }
    ctx.failure<Out[keyof Out]>(defaultViolations.enum(this.name, value, path), value).then(success, failure);
  }
}

export class AssertTrueValidator<In> extends Validator<In, In> {
  constructor(public readonly fn: AssertTrue<In>, public readonly type: string, public readonly path?: Path, private readonly _supportsFreeze: boolean = false) {
    super();
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<In>, failure: FailureCallback): void {
    try {
      if (!this.fn(value, path, ctx)) {
        return failure(new Violation(this.path ? this.path.connectTo(path) : path, this.type));
      }
    } catch (error) {
      return failure(violationsOf(error, this.path ? this.path.connectTo(path) : path));
    }
    return success(value);
  }
}

export class UuidValidator extends Validator<string> {
  constructor(public readonly version?: number) {
    super();
  }
  supportsFreeze(): boolean {
    return true;
  }
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<string>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure(defaultViolations.notNull(path));
    }
    if (!isString(value)) {
      return failure(defaultViolations.string(value, path));
    }
    if (!uuidValidate(value)) {
      return failure(new Violation(path, 'UUID', value));
    }
    if (this.version && uuidVersion(value) !== this.version) {
      return failure(new Violation(path, `UUIDv${this.version}`, value));
    }
    return success(value);
  }
}

export class HasValueValidator<InOut> extends Validator<InOut> {
  constructor(public readonly expectedValue: InOut, private readonly _supportsFreeze: boolean = false) {
    super();
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<InOut>, failure: FailureCallback): void {
    if (deepEqual(value, this.expectedValue)) {
      return success(value as InOut);
    }
    return failure(new HasValueViolation(path, this.expectedValue, value));
  }
}

/**
 * Runs input through all validators requiring all succeed. Returns the first 
 * successful result. If multiple validators succeed, they must return deepEqual value.
 * Consider wrapping child validators with `V.check()` to ensure that the there are no
 * conflicting conversions.
 */
export class AllOfValidator<Out, In> extends CompositeValidator<Out, In> {
  constructor(public readonly validators: [Validator<Out, In>, ...Validator<Out, In>[]]) {
    super(validators.every(v => v.skipUndefined()), validators.every(v => v.supportsFreeze()));
    if (validators.length === 0) {
      throw new Error('At least one validator required');
    }
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validators.forEach((validator, index) => validator.visit(visitor, path, new CompositeVisitorContext(CompositeType.allOf, index+1, this.validators.length), stack));
    }
  }

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    let violations: Violation[] = [];
    let firstResult = true;
    let convertedValue: any;
    const conflictingConversions = new Set<any>();
    let expectedResponses = this.validators.length;

    const reportResult = (result: undefined | Out, error: any) => {
      if (error) {
        violations = violations.concat(violationsOf(error, path));
      } else if (firstResult) {
        convertedValue = result;
        firstResult = false;
      } else if (!deepEqual(result, convertedValue)) {
        conflictingConversions.add(convertedValue);
        conflictingConversions.add(result);
      }
      if (--expectedResponses === 0) {
        if (conflictingConversions.size > 0) {
          return failure(violationsOf(new ValidatorConfigurationError(`ConflictingConversions for allOf(${path}): ${Array.from(conflictingConversions).join(', ')}`), path));
        }
        if (violations.length > 0) {
          failure(violations);
        } else {
          success(convertedValue);
        }
      }
    };

    for (let i = 0; i < this.validators.length; i++) {
      const validator = this.validators[i];
      try {
        validator.validatePathV2(
          value,
          path,
          ctx,
          (result) => reportResult(result, undefined),
          (error) => reportResult(undefined, error)
        );
      } catch (error) {
        reportResult(undefined, error);
      }
    }
  }
}

export class DateValidator extends Validator<Date> {
  constructor(public readonly dateType: string) {
    super();
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return false;
  }
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Date>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure(defaultViolations.notNull(path));
    }
    let dateValue: any;
    if (isString(value) || isNumber(value)) {
      dateValue = new Date(value);
    } else {
      dateValue = value;
    }
    if (dateValue instanceof Date) {
      if (isNaN((dateValue as Date).getTime())) {
        return failure(defaultViolations.date(value, path));
      }
      return success(dateValue);
    }
    return failure(defaultViolations.date(value, path, this.dateType));
  }
}

export class PatternValidator extends StringValidatorBase<string> {
  public readonly regExp: RegExp;

  constructor(pattern: string | RegExp, flags?: string) {
    super();
    this.regExp = pattern instanceof RegExp ? pattern : new RegExp(pattern, flags);
    Object.freeze(this.regExp);
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return true;
  }
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<string>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure(defaultViolations.notNull(path));
    } else if (!isString(value)) {
      failure(defaultViolations.string(value, path));
    } else if (this.regExp.test(value)) {
      success(value);
    } else {
      failure(defaultViolations.pattern(this.regExp, value, path));
    }
  }

  toJSON() {
    return {
      pattern: this.regExp.toString(),
    };
  }
}

export class PatternNormalizer extends PatternValidator {
  constructor(pattern: string | RegExp, flags?: string) {
    super(pattern, flags);
  }
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<string>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure(defaultViolations.notNull(path));
    } else if (isString(value)) {
      super.validatePathV2(value, path, ctx, success, failure);
    } else if (isSimplePrimitive(value)) {
      super.validatePathV2(String(value), path, ctx, success, failure);
    } else {
      failure(new TypeMismatch(path, 'primitive value', value));
    }
  }
}

export class OptionalValidator<Out, In> extends Validator<null | undefined | Out, null | undefined | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  skipUndefined(): boolean {
    return true;
  }

  supportsFreeze(): boolean {
    return this.validator.supportsFreeze();
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validator.visit(visitor, path, undefined, stack);
    }
  }

  validatePathV2(value: null | undefined | In, path: Path, ctx: ValidationContext, success: SuccessCallback<null | undefined | Out>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      success(value);
    } else {
      this.validator.validatePathV2(value as In, path, ctx, success, failure);
    }
  }
}

export class OptionalUndefinedValidator<Out, In> extends Validator<undefined | Out, undefined | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return this.validator.supportsFreeze();
  }

  skipUndefined(): boolean {
    return true;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validator.visit(visitor, path, undefined, stack);
    }
  }

  validatePathV2(value: undefined | In, path: Path, ctx: ValidationContext, success: SuccessCallback<undefined | Out>, failure: FailureCallback): void {
    if (value === undefined) {
      success(undefined);
    } else {
      this.validator.validatePathV2(value, path, ctx, success, failure);
    }
  }
}

export class NullableValidator<Out, In> extends Validator<null | Out, null | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this.validator.supportsFreeze();
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validator.visit(visitor, path, undefined, stack);
    }
  }

  validatePathV2(value: null | In, path: Path, ctx: ValidationContext, success: SuccessCallback<null | Out>, failure: FailureCallback): void {
    if (value === null) {
      success(null);
    } else if (value === undefined) {
      failure([defaultViolations.notUndefined(path)]);
    } else {
      this.validator.validatePathV2(value, path, ctx, success, failure);
    }
  }
}

export class RequiredValidator<Out, In> extends Validator<Out, In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this.validator.supportsFreeze();
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validator.visit(visitor, path, undefined, stack);
    }
  }
  
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure(defaultViolations.notNull(path));
    } else {
      this.validator.validatePathV2(value, path, ctx, success, failure);
    }
  }
}

export class ValueMapper<Out = unknown, In = unknown> extends Validator<Out, In> {
  private _supportsFreeze: boolean;
  constructor(public readonly fn: MappingFn<Out, In>, supportsFreeze: boolean = false) {
    super();
    // V.map's second argument used to be an unused `error?: any`. A leftover value must not be
    // read as a freeze assertion, so anything but a boolean falls back to `false`.
    this._supportsFreeze = typeof supportsFreeze === 'boolean' ? supportsFreeze : false;
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    const handleResult = (result: any) => {
      if (result instanceof Violation) {
        ctx.failure<Out>(result, value).then(success, failure);
      } else {
        success(result);
      }
    };

    try {
      const maybePromise = this.fn(value, path, ctx);
      if (isPromise(maybePromise)) {
        maybePromise.then(
          handleResult,
          (error: any) => failure(violationsOf(error, path)),
        );
      } else {
        handleResult(maybePromise);
      }
    } catch (error) {
      failure(violationsOf(error, path));
    }
  }
}

export class IdentityValidator<Out = unknown> extends Validator<Out, Out> {
  constructor(private readonly _supportsFreeze: boolean = false) {
    super();
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    success(value);
  }
}

export function isPromise(value: any): value is PromiseLike<any> {
  return value && typeof value['then'] === 'function';
}

export class IgnoreValidator extends Validator<undefined> {
  skipUndefined(): boolean {
    return true;
  }
  supportsFreeze(): boolean {
    return true;
  }
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<undefined>, failure: FailureCallback): void {
    return success(undefined);
  }
}

export class JsonValidator<Out> extends Validator<Out, string> {
  constructor(private readonly validator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this.validator.supportsFreeze();
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      this.validator.visit(visitor, path, undefined, stack);
    }
  }

  validatePathV2(value: string, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure(defaultViolations.notNull(path));
    }
    if (!isString(value)) {
      return failure(defaultViolations.string(value, path));
    }
    try {
      const parsedValue = JSON.parse(value);
      this.validator.validatePathV2(parsedValue, path, ctx, success, failure);
    } catch (e) {
      return failure(new TypeMismatch(path, 'JSON', value));
    }
  }
}

export type NextCompositionParameters<Out = unknown, In = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown> =
  [Validator<Out, In>] |
  [Validator<T1, In>, Validator<Out, T1>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<Out, T2>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<Out, T3>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<T4, T3>, Validator<Out, T4>];

export type CompositionParameters<Out = unknown, In = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown, T5 = unknown> =
  NextCompositionParameters<Out, In, T1, T2, T3, T4> |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<T4, T3>, Validator<T5, T4>, Validator<Out, T5>];

export function maybeCompositionOf<Out = unknown, In = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown, T5 = unknown>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>): Validator<Out, In> {
  if (validators.length === 1) {
    return validators[0];
  } else {
    return new CompositionValidator<Out, In>(validators);
  }
}

export function maybeAllOfValidator<Out, In>(validators: [Validator<Out, In>, ...Validator<Out, In>[]]): Validator<Out, In> {
  if (validators.length === 1) {
    return validators[0];
  }
  return new AllOfValidator<Out, In>(validators);
}

/**
 * An error that signals a *schema configuration* mistake rather than invalid data - for example a
 * `V.proxy` that asserts `supportsFreeze` over a validator that does not support it.
 *
 * It travels the ordinary failure channel as an `ErrorViolation` - the only path that survives an
 * asynchronous validator upstream - and `validate`/`getValid` re-raise it instead of reporting it.
 * So `validate()` rejects with it rather than returning a failed `ValidationResult`, and
 * `getValid()` throws it rather than a `ValidationError`: no input is at fault, so reporting it on
 * the data path would send the reader looking in the wrong place.
 */
export class ValidatorConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidatorConfigurationError';
  }
}

export function violationsOf<Out>(error: any, path: Path): Violation[] {
  if (error instanceof Violation) {
    return [error];
  }
  if (error instanceof ValidationError) {
    return error.violations;
  }
  if (Array.isArray(error) && error[0] instanceof Violation) {
    return error as Violation[];
  }
  return [new ErrorViolation(path, error)];
}
