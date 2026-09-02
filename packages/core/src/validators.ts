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
  constructor(public readonly options: ValidatorOptions) {}

  /**
   * Reports a violation, optionally ignoring it for backwards compatible changes in source data
   * (unknown enum values, unknown properties). An ignored violation resolves with `value` and is
   * reported to `ValidatorOptions.warnLogger`; anything else rejects with the violations.
   */
  failure<Out = any, In = unknown>(violation: Violation | Violation[], value: In): PromiseLike<Out> {
    return new SyncPromise<Out>((success, failure) => {
      const violations: Violation[] = ([] as Violation[]).concat(violation);
      if (violations.length === 1 && this.ignoreViolation(violations[0])) {
        if (this.options.warnLogger) {
          this.options.warnLogger(violations[0], this.options);
        }
        success(value as unknown as Out);
      } else {
        failure(violations);
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

export interface SuccessCallback<Out = unknown> {
  (value: Out): void;
}
export interface FailureCallback {
  (error: any): void;
}

const PENDING = 0;
const FULFILLED = 1;
const REJECTED = 2;
const DELIVERED = 3;

/**
 * A `PromiseLike` that invokes its handlers **synchronously** the moment it settles, instead of
 * scheduling a microtask.
 *
 * This is an internal implementation detail of `Validator.validatePath`: it is what lets a chain of
 * synchronous validators collapse into ordinary function calls while still returning something the
 * caller can `await`. Asynchronous validators keep working - settling later simply invokes the
 * handlers later. Measured against real Promises on ~126K objects, this is ~3x faster and needs
 * ~25x less peak heap; against raw callbacks it costs under 10%.
 *
 * It is deliberately *not* a Promise and supports only what a validator chain needs:
 *
 * - **one subscriber.** `then` may be called once; a second call throws rather than silently
 *   dropping a handler. Use `Promise.resolve(...)` or `await` to get a real Promise from it.
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
  private state = PENDING;
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
    promise.state = FULFILLED;
    promise.value = value;
    return promise;
  }

  /** An already rejected promise. See `resolve`. */
  static reject<V = never>(error: any): SyncPromise<V> {
    const promise = new SyncPromise<V>();
    promise.state = REJECTED;
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
      value => this.settle(FULFILLED, value),
      error => this.settle(REJECTED, error),
    );
  }

  private settle(state: number, value: any): void {
    if (this.state !== PENDING) {
      // Settled already - ignored, as a Promise would.
      return;
    }
    if (this.subscribed) {
      this.state = DELIVERED;
      if (state === FULFILLED) {
        this.onFulfilled!(value);
      } else {
        this.onRejected!(value);
      }
    } else {
      this.state = state;
      this.value = value;
    }
  }

  then<R1 = T, R2 = never>(onFulfilled?: ((value: T) => any) | null, onRejected?: ((error: any) => any) | null): PromiseLike<R1 | R2> {
    if (this.state === DELIVERED || this.subscribed) {
      throw new Error('SyncPromise supports a single subscriber: then() has already been called. Use Promise.resolve(syncPromise) for a chainable Promise.');
    }
    if (this.state === FULFILLED) {
      this.state = DELIVERED;
      const value = this.value;
      this.value = undefined;
      onFulfilled!(value);
    } else if (this.state === REJECTED) {
      this.state = DELIVERED;
      const error = this.value;
      this.value = undefined;
      onRejected!(error);
    } else {
      this.subscribed = true;
      this.onFulfilled = onFulfilled;
      this.onRejected = onRejected;
    }
    return this as unknown as PromiseLike<R1 | R2>;
  }
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
      return await this.validatePath(value, ROOT, new ValidationContext(options || {}));
    } catch (error) {
      throw new ValidationError(violationsOf(error, ROOT));
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
      const result = await this.validatePath(value, ROOT, new ValidationContext(options || {}));
      return new ValidationResult(undefined, result);
    } catch (error) {
      return new ValidationResult<Out>(violationsOf(error, ROOT));
    }
  }

  /**
   * Validate `value`, resolving the valid/converted value or rejecting with Violation | Violation[].
   *
   * Implementations should return a `SyncPromise` so that synchronous validator chains stay
   * synchronous, but any `PromiseLike` works - a custom validator may return a real Promise.
   *
   * @param value value to be validated
   * @param path path of the value being validated
   * @param ctx validation context
   */
  abstract validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out>;

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
  constructor(
    private readonly violations?: Violation[],
    private readonly value?: T,
  ) {
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
  constructor(
    public readonly path: Path,
    public readonly type: string,
    public readonly invalidValue?: any,
  ) {}
}

export class TypeMismatch extends Violation {
  constructor(
    path: Path,
    public readonly expected: string,
    public readonly invalidValue?: any,
  ) {
    super(path, ValidatorType.TypeMismatch, invalidValue);
  }
}

export class EnumMismatch extends Violation {
  constructor(
    public readonly path: Path,
    public readonly enumType: string,
    public readonly invalidValue: any,
  ) {
    super(path, ValidatorType.EnumMismatch, invalidValue);
  }
}

export class ErrorViolation extends Violation {
  public readonly message?: string;
  constructor(
    path: Path,
    public readonly error: any,
  ) {
    super(path, 'Error');
    this.message = typeof error === 'object' ? error.message : undefined;
  }
}

export class HasValueViolation extends Violation {
  constructor(
    path: Path,
    public readonly expectedValue: any,
    invalidValue?: any,
  ) {
    super(path, 'HasValue', invalidValue);
  }
}

export class PatternViolation extends Violation {
  constructor(
    path: Path,
    public readonly pattern: string,
    public readonly invalidValue?: any,
  ) {
    super(path, ValidatorType.Pattern, invalidValue);
  }
}

export type OneOfResult = { success: true } | { violations: Violation[] };

export class OneOfMismatch extends Violation {
  constructor(
    path: Path,
    public readonly matches: number,
    public readonly results: OneOfResult[],
  ) {
    super(path, ValidatorType.OneOf);
  }
}

export class MinViolation extends Violation {
  constructor(
    path: Path,
    public readonly min: number,
    public readonly inclusive: boolean,
    public readonly invalidValue?: any,
  ) {
    super(path, 'Min');
  }
}

export class MaxViolation extends Violation {
  constructor(
    path: Path,
    public readonly max: number,
    public readonly inclusive: boolean,
    public readonly invalidValue?: any,
  ) {
    super(path, 'Max');
  }
}

export class SizeViolation extends Violation {
  constructor(
    path: Path,
    public readonly min: number,
    public readonly max: number,
  ) {
    super(path, 'Size');
  }
}

export type GroupOrName = Group | string;

export class Group {
  private readonly allIncluded: { [s: string]: boolean };

  constructor(
    public readonly name: string,
    includes: GroupOrName[],
  ) {
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
  NotUndefined = 'NotUndefined',
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
};

export interface AssertTrue<In = unknown> {
  (value: In, path: Path, ctx: ValidationContext): boolean;
}

export class ValidatorFnWrapper<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(
    private readonly fn: ValidatorFn<Out, In>,
    public readonly type?: string,
  ) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      try {
        const maybePromise = this.fn(value, path, ctx);
        if (isPromise(maybePromise)) {
          maybePromise.then(success, error => ctx.failure(violationsOf(error, path), value).then(success, failure));
        } else {
          success(maybePromise);
        }
      } catch (error) {
        ctx.failure(violationsOf(error, path), value).then(success, failure);
      }
    });
  }
}

export class ArrayValidator<Out = unknown> extends Validator<Out[]> {
  constructor(public readonly itemsValidator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<Out[]> {
    return new SyncPromise((success: (value: Out[]) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        return failure([defaultViolations.notNull(path)]);
      }
      if (!Array.isArray(value)) {
        return failure([new TypeMismatch(path, 'array', value)]);
      }
      const convertedArray: Out[] = [];
      if (value.length === 0) {
        return success(convertedArray);
      }
      let expectedResponses = value.length;
      let violations: Violation[] = [];

      const reportResult = () => {
        if (--expectedResponses === 0) {
          if (violations.length > 0) {
            failure(violations);
          } else {
            success(convertedArray);
          }
        }
      };

      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        const itemPath = path.index(i);
        try {
          this.itemsValidator.validatePath(item, itemPath, ctx).then(
            convertedItem => {
              convertedArray[i] = convertedItem;
              reportResult();
            },
            error => {
              violations = violations.concat(error);
              reportResult();
            },
          );
        } catch (error) {
          violations = violations.concat(violationsOf(error, itemPath));
          reportResult();
        }
      }
    });
  }
}

export class ArrayNormalizer<T> extends ArrayValidator<T> {
  constructor(itemsValidator: Validator<T>) {
    super(itemsValidator);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<T[]> {
    return new SyncPromise((success: (value: T[]) => void, failure: (error: any) => void) => {
      if (value === undefined) {
        return super.validatePath([], path, ctx).then(success, failure);
      }
      if (Array.isArray(value)) {
        return super.validatePath(value, path, ctx).then(success, failure);
      }
      return super.validatePath([value], path, ctx).then(success, failure);
    });
  }
}

export class CheckValidator<In> extends Validator<In, In> {
  constructor(public readonly validator: Validator<any, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<In> {
    return new SyncPromise((success: (value: In) => void, failure: (error: any) => void) => {
      return this.validator.validatePath(value, path, ctx).then(() => success(value), failure);
    });
  }
}

export abstract class CompositeValidator<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(private readonly _skipUndefined: boolean) {
    super();
  }

  skipUndefined(): boolean {
    return this._skipUndefined;
  }
}

export class CompositionValidator<Out = unknown, In = any> extends CompositeValidator<Out, In> {
  public readonly validators: Validator[];
  constructor(validators: Validator[]) {
    super(validators.every(v => v.skipUndefined()));
    this.validators = ([] as Validator[]).concat(validators);
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      const validateNext = (index: number, currentValue: any) => {
        if (index < this.validators.length) {
          try {
            this.validators[index].validatePath(currentValue, path, ctx).then(
              result => validateNext(index + 1, result),
              error => failure(violationsOf(error, path)),
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
      };
      validateNext(0, value);
    });
  }
}

export class OneOfValidator<Out = unknown> extends Validator<Out> {
  constructor(public readonly validators: [Validator<Out>, ...Validator<Out>[]]) {
    super();
    // NOTE: This doesn't skipUndefined because a child validator may allow undefined even if it's not configured to skipUndefined
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      let matches = 0;
      let newValue: any = null;
      const results: OneOfResult[] = [];

      const reportResults = () => (matches === 1 ? success(newValue) : failure(defaultViolations.oneOf(matches, results, path)));

      const validateNext = (index: number) => {
        if (index < this.validators.length) {
          this.validators[index].validatePath(value, path, ctx).then(
            result => {
              matches++;
              newValue = result;
              results.push({ success: true });
              validateNext(index + 1);
            },
            error => {
              results.push({ violations: violationsOf(error, path) });
              validateNext(index + 1);
            },
          );
        } else {
          reportResults();
        }
      };
      validateNext(0);
    });
  }
}

/**
 * Runs input through all validators requiring that one or more succeed. Returns the first
 * successful result. If multiple validators succeed, they must return deepEqual value.
 * Consider wrapping child validators with `V.check()` to ensure that there are no
 * conflicting conversions.
 */
export class AnyOfValidator<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(public readonly validators: Validator<Out>[]) {
    super();
    if (this.validators.length === 0) {
      throw new Error('At least one validator required');
    }
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      let violations: Violation[] = [];
      const conflictingConversions: Set<any> = new Set();
      let foundMatch = false;
      let convertedValue: any;
      let expectedResponses = this.validators.length;

      const reportResult = (result: undefined | Out, error: any) => {
        if (error) {
          violations = violations.concat(violationsOf(error, path));
        } else if (!foundMatch) {
          convertedValue = result;
          foundMatch = true;
        } else if (!deepEqual(result, convertedValue)) {
          conflictingConversions.add(convertedValue);
          conflictingConversions.add(result);
        }
        if (--expectedResponses === 0) {
          if (conflictingConversions.size > 0) {
            failure([new Violation(path, 'ConflictingConversions', Array.from(conflictingConversions))]);
          } else if (foundMatch) {
            success(convertedValue);
          } else {
            failure(violations);
          }
        }
      };
      for (const validator of this.validators) {
        try {
          validator.validatePath(value, path, ctx).then(
            result => reportResult(result, undefined),
            error => reportResult(undefined, error),
          );
        } catch (error) {
          reportResult(undefined, error);
        }
      }
    });
  }
}

export class IfValidator<If = unknown, In = unknown, Else = unknown> extends Validator<If | Else, In> {
  constructor(
    public readonly conditionals: Conditional<If, In>[],
    public readonly elseValidator?: Validator<Else, In>,
  ) {
    super();
    if (conditionals.length === 0) {
      throw new Error('At least one conditional required');
    }
    Object.freeze(this.conditionals);
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<If | Else> {
    return new SyncPromise((success: (value: If | Else) => void, failure: (error: any) => void) => {
      for (let i = 0; i < this.conditionals.length; i++) {
        const conditional = this.conditionals[i];
        if (conditional.fn(value, path, ctx)) {
          conditional.validator.validatePath(value, path, ctx).then(success, failure);
          return;
        }
      }
      if (this.elseValidator) {
        this.elseValidator.validatePath(value, path, ctx).then(success, failure);
        return;
      }
      failure(new Violation(path, 'NoMatchingCondition', value));
    });
  }

  elseIf<ElIf, ElIn>(fn: AssertTrue, validator: Validator<ElIf, ElIn>): IfValidator<If | ElIf, In | ElIn, Else> {
    if (this.elseValidator) {
      throw new Error('Else is already defined. Define elseIfs first.');
    }
    return new IfValidator<If | ElIf, In | ElIn, Else>(
      [...this.conditionals, new Conditional(fn, validator)] as Conditional<If | ElIf, In | ElIn>[],
      this.elseValidator,
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
  constructor(
    public readonly fn: AssertTrue<In>,
    public readonly validator: Validator<Out, In>,
  ) {
    Object.freeze(this.validator);
    Object.freeze(this);
  }
}

export class WhenGroupValidator<When = unknown, Otherwise = unknown, In = unknown> extends Validator<When | Otherwise, In> {
  constructor(
    public readonly whenGroups: WhenGroup<When>[],
    public readonly otherwiseValidator?: Validator<Otherwise>,
  ) {
    super();
    Object.freeze(this.whenGroups);
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<When | Otherwise> {
    return new SyncPromise((success: (value: When | Otherwise) => void, failure: (error: any) => void) => {
      const group = ctx.options?.group;
      let groupMatches = 0;
      let violations: Violation[] = [];
      const report = (currentValue?: any) => {
        if (violations.length > 0) {
          failure(violations);
        } else if (groupMatches > 0) {
          success(currentValue);
        } else if (this.otherwiseValidator) {
          this.otherwiseValidator.validatePath(value, path, ctx).then(success, failure);
        } else {
          failure([new Violation(path, 'NoMatchingGroup', value)]);
        }
      };
      if (group) {
        const validateNext = (index: number, currentValue: any) => {
          if (index < this.whenGroups.length) {
            const whenGroup = this.whenGroups[index];
            if (group.includes(whenGroup.group)) {
              groupMatches++;
              whenGroup.validator.validatePath(value, path, ctx).then(
                result => {
                  validateNext(index + 1, result);
                },
                error => {
                  violations = violations.concat(violationsOf(error, path));
                  validateNext(index + 1, currentValue);
                },
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
    });
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

  constructor(
    group: GroupOrName,
    public readonly validator: Validator<T>,
  ) {
    this.group = isString(group) ? (group as string) : (group as Group).name;
    Object.freeze(this);
  }
}

export class MapValidator<K = unknown, V = unknown, E extends boolean = true> extends Validator<E extends true ? JsonMap<K, V> : Map<K, V>> {
  constructor(
    public readonly keys: Validator<K>,
    public readonly values: Validator<V>,
    public readonly jsonSafeMap: E,
  ) {
    super();
    Object.freeze(this);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<E extends true ? JsonMap<K, V> : Map<K, V>> {
    return new SyncPromise((success: (value: E extends true ? JsonMap<K, V> : Map<K, V>) => void, failure: (error: any) => void) => {
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
          success(this.jsonSafeMap ? new JsonMap<K, V>(entries) : (new Map<K, V>(entries) as any));
        }
      };

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
          this.keys.validatePath(key, entryPath.index(0), ctx).then(
            result => reportEntry(entryIndex, 0, result, undefined),
            error => reportEntry(entryIndex, 0, undefined, error),
          );
        } catch (error) {
          reportEntry(entryIndex, 0, undefined, error);
        }
        try {
          this.values.validatePath(value, entryPath.index(1), ctx).then(
            result => reportEntry(entryIndex, 1, result, undefined),
            error => reportEntry(entryIndex, 1, undefined, error),
          );
        } catch (error) {
          reportEntry(entryIndex, 1, undefined, error);
        }
      }
    });
  }
}

export class MapNormalizer<K = unknown, V = unknown, E extends boolean = true> extends MapValidator<K, V, E> {
  constructor(keys: Validator<K>, values: Validator<V>, jsonSafeMap: E) {
    super(keys, values, jsonSafeMap);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<E extends true ? JsonMap<K, V> : Map<K, V>> {
    return new SyncPromise((success: (value: E extends true ? JsonMap<K, V> : Map<K, V>) => void, failure: (error: any) => void) => {
      if (value instanceof Map) {
        return super.validatePath(value, path, ctx).then(success, failure);
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
        return super.validatePath(map, path, ctx).then(success, failure);
      }
      return failure(new TypeMismatch(path, 'Map OR array of [key, value] arrays'));
    });
  }
}

export class JsonMap<K, V> extends Map<K, V> {
  constructor(entries?: readonly (readonly [K, V])[] | null) {
    super(entries);
  }
  toJSON() {
    return [...this.entries()];
  }
}

export class SetValidator<T = unknown, E extends boolean = true> extends Validator<E extends true ? JsonSet<T> : Set<T>> {
  constructor(
    public readonly values: Validator<T>,
    public readonly jsonSafeSet: E,
  ) {
    super();
    Object.freeze(this);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<E extends true ? JsonSet<T> : Set<T>> {
    return new SyncPromise((success: (value: E extends true ? JsonSet<T> : Set<T>) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        return failure([defaultViolations.notNull(path)]);
      }
      if (!(value instanceof Set || Array.isArray(value))) {
        return failure(new TypeMismatch(path, 'Set'));
      }

      const items: T[] = [];
      let violations: Violation[] = [];
      let expectedResponses = value instanceof Set ? value.size : value.length;

      const reportResult = () => {
        if (violations.length > 0) {
          failure(violations);
        } else {
          success(this.jsonSafeSet ? new JsonSet<T>(items) : (new Set<T>(items) as any));
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
        const index = i++;
        try {
          this.values.validatePath(entry, path.index(index), ctx).then(
            result => reportItem(index, result, undefined),
            error => reportItem(index, undefined, error),
          );
        } catch (error) {
          reportItem(index, undefined, error);
        }
      }
    });
  }
}

export class JsonSet<K> extends Set<K> {
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
  }
  valueOf() {
    return this.value;
  }
  toJSON() {
    return this.value.toString(10);
  }
}

export class AnyValidator<InOut = any> extends Validator<InOut> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    return SyncPromise.resolve(value as InOut);
  }
}

export class UnknownValidator<InOut = unknown> extends Validator<InOut> {
  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    return SyncPromise.resolve(value);
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
  constructor(
    public readonly firstValidator: Validator<string, any>,
    public readonly nextValidator: Validator<string, any>,
  ) {
    super();
    Object.freeze(this);
  }

  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<string> {
    return new SyncPromise((success: (value: string) => void, failure: (error: any) => void) => {
      this.firstValidator
        .validatePath(value, path, ctx)
        .then(firstResult => this.nextValidator.validatePath(firstResult, path, ctx).then(success, failure), failure);
    });
  }
}

export class StringValidator extends StringValidatorBase<string> {
  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject([defaultViolations.notNull(path)]);
    } else if (isString(value)) {
      return SyncPromise.resolve(value);
    } else {
      return SyncPromise.reject([defaultViolations.string(value, path)]);
    }
  }
}

export class StringNormalizer extends StringValidatorBase<unknown> {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject([defaultViolations.notNull(path)]);
    } else if (isString(value)) {
      return SyncPromise.resolve(value);
    } else if (value instanceof String) {
      return SyncPromise.resolve(value.valueOf());
    } else if (isSimplePrimitive(value)) {
      return SyncPromise.resolve(String(value));
    } else {
      return SyncPromise.reject([new TypeMismatch(path, 'primitive value', value)]);
    }
  }
}

export class NotNullOrUndefinedValidator<InOut> extends Validator<Exclude<InOut, null | undefined>, InOut> {
  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<Exclude<InOut, null | undefined>> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject([defaultViolations.notNull(path)]);
    } else {
      return SyncPromise.resolve(value as any);
    }
  }
}

export class IsNullOrUndefinedValidator extends Validator<null | undefined> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<null | undefined> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.resolve(value);
    } else {
      return SyncPromise.reject([new TypeMismatch(path, 'NullOrUndefined', value)]);
    }
  }
}

export class NotEmptyValidator<InOut extends { length: number }> extends Validator<InOut, InOut> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    if (!isNullOrUndefined(value) && isNumber((value as any).length) && (value as any).length > 0) {
      return SyncPromise.resolve(value as InOut);
    } else {
      return SyncPromise.reject([defaultViolations.notEmpty(path)]);
    }
  }
}

export class SizeValidator<InOut extends { length: number }> extends Validator<InOut, InOut> {
  constructor(
    private readonly min: number,
    private readonly max: number,
  ) {
    super();
    if (max < min) {
      throw new Error('Size: max should be >= than min');
    }
    Object.freeze(this);
  }

  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject([defaultViolations.notNull(path)]);
    } else if (!isNumber(value.length)) {
      return SyncPromise.reject([new TypeMismatch(path, 'value with numeric length field', value)]);
    } else if (value.length < this.min || value.length > this.max) {
      return SyncPromise.reject([defaultViolations.size(this.min, this.max, path)]);
    } else {
      return SyncPromise.resolve(value);
    }
  }
}

export class NotBlankValidator extends Validator<string, string> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject([defaultViolations.notBlank(path)]);
    } else if (!isString(value)) {
      return SyncPromise.reject([defaultViolations.string(value, path)]);
    } else {
      const trimmed = (value as string).trim();
      if (trimmed === '') {
        return SyncPromise.reject([defaultViolations.notBlank(path)]);
      } else {
        return SyncPromise.resolve(value as string);
      }
    }
  }
}

export class BooleanValidator extends Validator<boolean> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<boolean> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject(defaultViolations.notNull(path));
    } else if (typeof value === 'boolean') {
      return SyncPromise.resolve(value);
    } else {
      return SyncPromise.reject(defaultViolations.boolean(value, path));
    }
  }
}

export class BooleanNormalizer extends Validator<boolean> {
  constructor(
    public readonly truePattern: RegExp,
    public readonly falsePattern: RegExp,
  ) {
    super();
    Object.freeze(this.truePattern);
    Object.freeze(this.falsePattern);
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<boolean> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject([defaultViolations.notNull(path)]);
    } else if (typeof value === 'boolean') {
      return SyncPromise.resolve(value);
    } else if (value instanceof Boolean) {
      return SyncPromise.resolve(value.valueOf());
    } else if (isString(value)) {
      if (this.truePattern.test(value)) {
        return SyncPromise.resolve(true);
      } else if (this.falsePattern.test(value)) {
        return SyncPromise.resolve(false);
      } else {
        return SyncPromise.reject([defaultViolations.boolean(value, path)]);
      }
    } else if (isNumber(value)) {
      return SyncPromise.resolve(!!value);
    } else {
      return SyncPromise.reject([defaultViolations.boolean(value, path)]);
    }
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
    return new NextNumberValidator<In>(
      this,
      new CompositionValidator<number, number>([new MinValidator(min, minInclusive), new MaxValidator(max, maxInclusive)]),
    );
  }

  protected validateNumberFormat(value: number, format: undefined | NumberFormat, path: Path, ctx: ValidationContext): PromiseLike<number> {
    switch (format) {
      case NumberFormat.integer:
        if (!Number.isInteger(value)) {
          return SyncPromise.reject(defaultViolations.number(value, format, path));
        }
        break;
    }
    return SyncPromise.resolve(value);
  }
}

const bigIntFormat = /^-?[0-9]+$/;

export class JsonBigIntValidator extends Validator<JsonBigInt, any> {
  constructor() {
    super();
    Object.freeze(this);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<JsonBigInt> {
    const valueType = typeof value;
    switch (valueType) {
      case 'bigint':
        return SyncPromise.resolve(new JsonBigInt(value));
      case 'number':
        try {
          return SyncPromise.resolve(new JsonBigInt(BigInt(value)));
        } catch (e) {
          return SyncPromise.reject(new TypeMismatch(path, 'integer', value));
        }
      case 'string':
        if (value.match(bigIntFormat)) {
          return SyncPromise.resolve(new JsonBigInt(BigInt(value)));
        } else {
          return SyncPromise.reject(new TypeMismatch(path, bigIntFormat.toString(), value));
        }
      case 'object':
        if (value instanceof JsonBigInt) {
          return SyncPromise.resolve(value);
        }
        break;
    }
    return SyncPromise.reject(new TypeMismatch(path, 'JsonBigInt, bigint or integer as number or string', value));
  }
}

export class NextNumberValidator<In> extends NumberValidatorBase<In> {
  constructor(
    public readonly firstValidator: Validator<number, any>,
    public readonly nextValidator: Validator<number, any>,
  ) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<number> {
    return new SyncPromise((success: (value: number) => void, failure: (error: any) => void) => {
      this.firstValidator
        .validatePath(value, path, ctx)
        .then(firstResult => this.nextValidator.validatePath(firstResult, path, ctx).then(success, failure), failure);
    });
  }
}

export class NumberValidator extends NumberValidatorBase<number> {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<number> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject(defaultViolations.notNull(path));
    } else if (!isNumber(value)) {
      return SyncPromise.reject(defaultViolations.number(value, this.format, path));
    } else {
      return super.validateNumberFormat(value, this.format, path, ctx);
    }
  }
}

export class NumberNormalizer extends NumberValidatorBase<any> {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<number> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject(defaultViolations.notNull(path));
    } else if (isNumber(value)) {
      return super.validateNumberFormat(value, this.format, path, ctx);
    } else if (value instanceof Number) {
      return super.validateNumberFormat(value.valueOf(), this.format, path, ctx);
    } else if (isString(value)) {
      if (value.trim() === '') {
        return SyncPromise.reject(defaultViolations.number(value, this.format, path));
      } else {
        const nbr = Number(value);
        if (isNumber(nbr)) {
          return super.validateNumberFormat(nbr, this.format, path, ctx);
        } else {
          return SyncPromise.reject(defaultViolations.number(value, this.format, path));
        }
      }
    } else {
      return SyncPromise.reject(defaultViolations.number(value, this.format, path));
    }
  }
}

export class MinValidator extends Validator<number, number> {
  constructor(
    public readonly min: number,
    public readonly inclusive: boolean,
  ) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<number> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject(defaultViolations.notNull(path));
    }
    if (!isNumber(value)) {
      return SyncPromise.reject(defaultViolations.number(value, NumberFormat.number, path));
    }
    if (this.inclusive) {
      if (value < this.min) {
        return SyncPromise.reject(defaultViolations.min(this.min, this.inclusive, value, path));
      }
    } else if (value <= this.min) {
      return SyncPromise.reject(defaultViolations.min(this.min, this.inclusive, value, path));
    }
    return SyncPromise.resolve(value);
  }
}

export class MaxValidator extends Validator<number, number> {
  constructor(
    public readonly max: number,
    public readonly inclusive: boolean,
  ) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<number> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject(defaultViolations.notNull(path));
    }
    if (!isNumber(value)) {
      return SyncPromise.reject(defaultViolations.number(value, NumberFormat.number, path));
    }
    if (this.inclusive) {
      if (value > this.max) {
        return SyncPromise.reject(defaultViolations.max(this.max, this.inclusive, value, path));
      }
    } else if (value >= this.max) {
      return SyncPromise.reject(defaultViolations.max(this.max, this.inclusive, value, path));
    }
    return SyncPromise.resolve(value);
  }
}

export class EnumValidator<Out extends Record<string, string | number>> extends Validator<Out[keyof Out]> {
  constructor(
    public readonly enumType: Out,
    public readonly name: string,
  ) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<Out[keyof Out]> {
    return new SyncPromise((success: (value: Out[keyof Out]) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        return failure([defaultViolations.notNull(path)]);
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const isValid = Object.values(this.enumType).includes(value);
        if (isValid) {
          return success(value as Out[keyof Out]);
        }
      }
      ctx.failure(defaultViolations.enum(this.name, value, path), value).then(success, failure);
    });
  }
}

export class AssertTrueValidator<In> extends Validator<In, In> {
  constructor(
    public readonly fn: AssertTrue<In>,
    public readonly type: string,
    public readonly path?: Path,
  ) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<In> {
    try {
      if (!this.fn(value, path, ctx)) {
        return SyncPromise.reject(new Violation(this.path ? this.path.connectTo(path) : path, this.type));
      }
    } catch (error) {
      return SyncPromise.reject(violationsOf(error, this.path ? this.path.connectTo(path) : path));
    }
    return SyncPromise.resolve(value);
  }
}

export class UuidValidator extends Validator<string> {
  constructor(public readonly version?: number) {
    super();
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject(defaultViolations.notNull(path));
    }
    if (!isString(value)) {
      return SyncPromise.reject(defaultViolations.string(value, path));
    }
    if (!uuidValidate(value)) {
      return SyncPromise.reject(new Violation(path, 'UUID', value));
    }
    if (this.version && uuidVersion(value) !== this.version) {
      return SyncPromise.reject(new Violation(path, `UUIDv${this.version}`, value));
    }
    return SyncPromise.resolve(value);
  }
}

export class HasValueValidator<InOut> extends Validator<InOut> {
  constructor(public readonly expectedValue: InOut) {
    super();
    Object.freeze(this);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    if (deepEqual(value, this.expectedValue)) {
      return SyncPromise.resolve(value as InOut);
    }
    return SyncPromise.reject(new HasValueViolation(path, this.expectedValue, value));
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
    super(validators.every(v => v.skipUndefined()));
    if (validators.length === 0) {
      throw new Error('At least one validator required');
    }
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      let violations: Violation[] = [];
      let firstResult = true;
      let convertedValue: any;
      const conflictingConversion = new Set<any>();
      let expectedResponses = this.validators.length;

      const reportResult = (result: undefined | Out, error: any) => {
        if (error) {
          violations = violations.concat(violationsOf(error, path));
        } else if (firstResult) {
          convertedValue = result;
          firstResult = false;
        } else if (!deepEqual(result, convertedValue)) {
          conflictingConversion.add(convertedValue);
          conflictingConversion.add(result);
        }
        if (--expectedResponses === 0) {
          if (conflictingConversion.size > 0) {
            violations.push(new Violation(path, 'ConflictingConversions', Array.from(conflictingConversion)));
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
          validator.validatePath(value, path, ctx).then(
            result => reportResult(result, undefined),
            error => reportResult(undefined, error),
          );
        } catch (error) {
          reportResult(undefined, error);
        }
      }
    });
  }
}

export class DateValidator extends Validator<Date> {
  constructor(public readonly dateType: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<Date> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject(defaultViolations.notNull(path));
    }
    let dateValue: any;
    if (isString(value) || isNumber(value)) {
      dateValue = new Date(value);
    } else {
      dateValue = value;
    }
    if (dateValue instanceof Date) {
      if (isNaN((dateValue as Date).getTime())) {
        return SyncPromise.reject(defaultViolations.date(value, path));
      }
      return SyncPromise.resolve(dateValue);
    }
    return SyncPromise.reject(defaultViolations.date(value, path, this.dateType));
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

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return SyncPromise.reject(defaultViolations.notNull(path));
    } else if (!isString(value)) {
      return SyncPromise.reject(defaultViolations.string(value, path));
    } else if (this.regExp.test(value)) {
      return SyncPromise.resolve(value);
    } else {
      return SyncPromise.reject(defaultViolations.pattern(this.regExp, value, path));
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
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<string> {
    return new SyncPromise((success: (value: string) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        failure(defaultViolations.notNull(path));
      } else if (isString(value)) {
        super.validatePath(value, path, ctx).then(success, failure);
      } else if (isSimplePrimitive(value)) {
        super.validatePath(String(value), path, ctx).then(success, failure);
      } else {
        failure(new TypeMismatch(path, 'primitive value', value));
      }
    });
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

  validatePath(value: null | undefined | In, path: Path, ctx: ValidationContext): PromiseLike<null | undefined | Out> {
    return new SyncPromise((success: (value: null | undefined | Out) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        success(value);
      } else {
        this.validator.validatePath(value as In, path, ctx).then(success, failure);
      }
    });
  }
}

export class OptionalUndefinedValidator<Out, In> extends Validator<undefined | Out, undefined | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  skipUndefined(): boolean {
    return true;
  }

  validatePath(value: undefined | In, path: Path, ctx: ValidationContext): PromiseLike<undefined | Out> {
    return new SyncPromise((success: (value: undefined | Out) => void, failure: (error: any) => void) => {
      if (value === undefined) {
        success(undefined);
      } else {
        this.validator.validatePath(value, path, ctx).then(success, failure);
      }
    });
  }
}

export class NullableValidator<Out, In> extends Validator<null | Out, null | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: null | In, path: Path, ctx: ValidationContext): PromiseLike<null | Out> {
    return new SyncPromise((success: (value: null | Out) => void, failure: (error: any) => void) => {
      if (value === null) {
        success(null);
      } else if (value === undefined) {
        failure([defaultViolations.notUndefined(path)]);
      } else {
        this.validator.validatePath(value, path, ctx).then(success, failure);
      }
    });
  }
}

export class RequiredValidator<Out, In> extends Validator<Out, In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        failure(defaultViolations.notNull(path));
      } else {
        this.validator.validatePath(value, path, ctx).then(success, failure);
      }
    });
  }
}

export class ValueMapper<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(
    public readonly fn: MappingFn<Out, In>,
    public readonly error?: any,
  ) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      const handleResult = (result: any) => {
        if (result instanceof Violation) {
          ctx.failure(result, value).then(success, failure);
        } else {
          success(result);
        }
      };

      try {
        const maybePromise = this.fn(value, path, ctx);
        if (isPromise(maybePromise)) {
          maybePromise.then(handleResult, (error: any) => failure(violationsOf(error, path)));
        } else {
          handleResult(maybePromise);
        }
      } catch (error) {
        failure(violationsOf(error, path));
      }
    });
  }
}

export class IdentityValidator<Out = unknown> extends Validator<Out, Out> {
  constructor() {
    super();
    Object.freeze(this);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return SyncPromise.resolve(value);
  }
}

export function isPromise(value: any): value is PromiseLike<any> {
  return value && typeof value['then'] === 'function';
}

export class IgnoreValidator extends Validator<undefined> {
  skipUndefined(): boolean {
    return true;
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<undefined> {
    return SyncPromise.resolve(undefined);
  }
}

export class JsonValidator<Out> extends Validator<Out, string> {
  constructor(private readonly validator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        return failure(defaultViolations.notNull(path));
      }
      if (!isString(value)) {
        return failure(defaultViolations.string(value, path));
      }
      try {
        const parsedValue = JSON.parse(value);
        this.validator.validatePath(parsedValue, path, ctx).then(success, failure);
      } catch (e) {
        return failure(new TypeMismatch(path, 'JSON', value));
      }
    });
  }
}

export type NextCompositionParameters<Out = unknown, In = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown> =
  | [Validator<Out, In>]
  | [Validator<T1, In>, Validator<Out, T1>]
  | [Validator<T1, In>, Validator<T2, T1>, Validator<Out, T2>]
  | [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<Out, T3>]
  | [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<T4, T3>, Validator<Out, T4>];

export type CompositionParameters<Out = unknown, In = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown, T5 = unknown> =
  | NextCompositionParameters<Out, In, T1, T2, T3, T4>
  | [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<T4, T3>, Validator<T5, T4>, Validator<Out, T5>];

export function maybeCompositionOf<Out = unknown, In = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown, T5 = unknown>(
  ...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>
): Validator<Out, In> {
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
