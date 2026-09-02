import { default as deepEqual } from 'fast-deep-equal';
import { Path } from '@finnair/path';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

const ROOT = Path.ROOT;

export interface ValidatorFn<Out = unknown, In = unknown> {
  (value: In, path: Path, ctx: ValidationContext): Out | PromiseLike<Out>;
}

export interface ValidatorFnV2<Out = unknown, In = unknown> {
  (value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void;
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
  constructor(public readonly options: ValidatorOptions) { }

  /**
  * Optionally ignore an error for backwards compatible changes (enum values, new properties).
  * @deprecated use failureV2 instead
  */
  failure<Out = unknown, In = unknown>(violation: Violation | Violation[], value: In) {
    return new Promise((resolve, reject) => {
      this.failureV2<Out, In>(violation, value, resolve, reject);
    });
  }
  failureV2<Out = unknown, In = unknown>(violation: Violation | Violation[], value: In, success: SuccessCallback<Out>, failure: FailureCallback) {
    const violations: Violation[] = ([] as Violation[]).concat(violation);
    if (violations.length === 1 && this.ignoreViolation(violations[0])) {
      if (this.options.warnLogger) {
        this.options.warnLogger(violations[0], this.options);
      }
      success(value as unknown as Out);
    } else {
      failure(violations);
    }
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
      const result = await new Promise((resolve: (value: Out) => void, reject: (violations: Violation[]) => void) => {
        this.validatePathV2(value, ROOT, new ValidationContext(options || {}), resolve, reject);
      });
      return new ValidationResult(undefined, result);
    } catch (error) {
      return new ValidationResult<Out>(violationsOf(error, ROOT));
    }
  }

  /**
  * Validate `value` and return either resolved of valid/converted value or rejected of Violation or Violation[] Promise.
  * @param value 
  * @param path 
  * @param ctx 
  * @deprecated Use validatePathV2() instead for better performance and less memory usage.
  */
  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new Promise((resolve: (value: Out) => void, reject: (violations: Violation[]) => void) => {
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
  constructor(public readonly path: Path, public readonly type: string, public readonly invalidValue?: any) { }
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
  constructor(private readonly fn: ValidatorFn<Out, In>, public readonly type?: string) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    try {
      const maybePromise = this.fn(value, path, ctx);
      if (isPromise(maybePromise)) {
        maybePromise.then(
          success,
          error => ctx.failureV2(violationsOf(error, path), value, success, failure)
        );
      } else {
        success(maybePromise);
      }
    } catch (error) {
      ctx.failureV2(violationsOf(error, path), value, success, failure);
    }
  }
}

export class ValidatorFnWrapperV2<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(private readonly fn: ValidatorFnV2<Out, In>, public readonly type?: string) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    try {
      this.fn(value, path, ctx,
        (result) => {
          success(result);
        },
        error => {
          ctx.failureV2(error, value, success, failure);
        });
    } catch (error) {
      ctx.failureV2(violationsOf(error, path), value, success, failure);
    }
  }
}

export class ArrayValidator<Out = unknown> extends Validator<Out[]> {
  constructor(public readonly itemsValidator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<Out[]>, failure: FailureCallback): void {
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
  constructor(public readonly validator: Validator<any, In>) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<In>, failure: FailureCallback): void {
    return this.validator.validatePathV2(value, path, ctx, () => success(value), failure);
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
    super(validators.every((v) => v.skipUndefined()));
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
}

export class OneOfValidator<Out = unknown> extends Validator<Out> {
  constructor(public readonly validators: [Validator<Out>, ...Validator<Out>[]]) {
    super();
    // NOTE: This doesn't skipUndefined because a child validator may allow undefined even if it's not configured to skipUndefined
    Object.freeze(this.validators);
    Object.freeze(this);
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
            results.push({ violations: violationsOf(error, path) });
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
  constructor(public readonly validators: Validator<Out>[]) {
    super();
    if (this.validators.length === 0) {
      throw new Error('At least one validator required');
    }
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
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
  constructor(public readonly conditionals: Conditional<If, In>[], public readonly elseValidator?: Validator<Else, In>) {
    super();
    if (conditionals.length === 0) {
      throw new Error('At least one conditional required');
    }
    Object.freeze(this.conditionals);
    Object.freeze(this);
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

export class WhenGroupValidator<When = unknown, Otherwise = unknown, In = unknown> extends Validator<When | Otherwise, In> {
  constructor(public readonly whenGroups: WhenGroup<When>[], public readonly otherwiseValidator?: Validator<Otherwise>) {
    super();
    Object.freeze(this.whenGroups);
    Object.freeze(this);
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
        success(this.jsonSafeMap ? new JsonMap<K, V>(entries) : new Map<K, V>(entries) as any);
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

export class JsonMap<K, V> extends Map<K, V> {
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
        success(this.jsonSafeSet ? new JsonSet<T>(items) : new Set<T>(items) as any);
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
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<InOut>, failure: FailureCallback): void {
    success(value as InOut);
  }
}

export class UnknownValidator<InOut = unknown> extends Validator<InOut> {
  validatePathV2(value: InOut, path: Path, ctx: ValidationContext, success: SuccessCallback<InOut>, failure: FailureCallback): void {
    success(value);
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
  constructor(public readonly firstValidator: Validator<string, any>, public readonly nextValidator: Validator<string, any>) {
    super();
    Object.freeze(this);
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
}

export class IsNullOrUndefinedValidator extends Validator<null | undefined> {
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<null | undefined>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      success(value);
    } else {
      failure([new TypeMismatch(path, 'NullOrUndefined', value)]);
    }
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
}

export class SizeValidator<InOut extends { length: number }> extends Validator<InOut, InOut> {
  constructor(private readonly min: number, private readonly max: number) {
    super();
    if (max < min) {
      throw new Error('Size: max should be >= than min');
    }
    Object.freeze(this);
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
  constructor(public readonly enumType: Out, public readonly name: string) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<Out[keyof Out]>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      return failure([defaultViolations.notNull(path)]);
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const isValid = Object.values(this.enumType).includes(value);
      if (isValid) {
        return success(value as Out[keyof Out]);
      }
    }
    ctx.failureV2(defaultViolations.enum(this.name, value, path), value, success, failure);
  }
}

export class AssertTrueValidator<In> extends Validator<In, In> {
  constructor(public readonly fn: AssertTrue<In>, public readonly type: string, public readonly path?: Path) {
    super();
    Object.freeze(this);
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
  constructor(public readonly expectedValue: InOut) {
    super();
    Object.freeze(this);
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
    super(validators.every(v => v.skipUndefined()));
    if (validators.length === 0) {
      throw new Error('At least one validator required');
    }
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
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

  skipUndefined(): boolean {
    return true;
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

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    if (isNullOrUndefined(value)) {
      failure(defaultViolations.notNull(path));
    } else {
      this.validator.validatePathV2(value, path, ctx, success, failure);
    }
  }
}

export class ValueMapper<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(public readonly fn: MappingFn<Out, In>, public readonly error?: any) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    const handleResult = (result: any) => {
      if (result instanceof Violation) {
        ctx.failureV2(result, value, success, failure);
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
  constructor() {
    super();
    Object.freeze(this);
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
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<undefined>, failure: FailureCallback): void {
    return success(undefined);
  }
}

export class JsonValidator<Out> extends Validator<Out, string> {
  constructor(private readonly validator: Validator<Out>) {
    super();
    Object.freeze(this);
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
