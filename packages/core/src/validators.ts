import {default as deepEqual } from 'fast-deep-equal';
import { Path } from '@finnair/path';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

const ROOT = Path.ROOT;

export interface ValidatorFn<Out = unknown, In = unknown>{
  (value: In, path: Path, ctx: ValidationContext): PromiseLike<Out>;
}

export interface MappingFn<Out = unknown, In = unknown> {
  (value: In, path: Path, ctx: ValidationContext): Out | PromiseLike<Out>;
}

export interface ValidatorOptions {
  readonly group?: Group;
  readonly ignoreUnknownProperties?: boolean;
  readonly ignoreUnknownEnumValues?: boolean;
  readonly warnLogger?: WarnLogger;
  readonly allowCycles?: boolean;
}

export class ValidationContext {
  constructor(public readonly options: ValidatorOptions) {}

  private readonly objects = new Map<any, any>();

  /**
   * Optionally ignore an error for backwards compatible changes (enum values, new properties).
   */
  failure<Out = unknown, In = unknown>(violation: Violation | Violation[], value: In) {
    const violations: Violation[] = ([] as Violation[]).concat(violation);
    if (violations.length === 1 && this.ignoreViolation(violations[0])) {
      if (this.options.warnLogger) {
        this.options.warnLogger(violations[0], this.options);
      }
      return Promise.resolve(value as unknown as Out);
    }
    return Promise.reject(violations);
  }
  registerObject<T = unknown>(value: any, path: Path, convertedValue: T): undefined | PromiseLike<T> {
    if (this.objects.has(value)) {
      if (this.options.allowCycles) {
        return Promise.resolve(this.objects.get(value));
      }
      return Promise.reject(defaultViolations.cycle(path));
    }
    this.objects.set(value, convertedValue);
    return undefined;
  }
  private ignoreViolation(violation: Violation) {
    return (
      (this.options.ignoreUnknownEnumValues && violation.type === ValidatorType.EnumMismatch) ||
      (this.options.ignoreUnknownProperties && violation.type === ValidatorType.UnknownProperty)
    );
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
      throw new ValidationError(violationsOf(error));
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
      return new ValidationResult<Out>(violationsOf(error));
    }
  }

  /**
   * Validate `value` and return either resolved of valid/converted value or rejected of Violation or Violation[] Promise.
   * @param value 
   * @param path 
   * @param ctx 
   */
  abstract validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out>;

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
  constructor(public readonly path: Path, public readonly type: string, public readonly invalidValue?: any) {}
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
  constructor(path: Path, public readonly error: any) {
    super(path, 'Error');
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

export class OneOfMismatch extends Violation {
  constructor(path: Path, public readonly matches: number) {
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
  oneOf: (matches: number, path: Path = ROOT) => new OneOfMismatch(path, matches),
  pattern: (pattern: RegExp, invalidValue: any, path: Path = ROOT) => new PatternViolation(path, '' + pattern, invalidValue),
  enum: (name: string, invalidValue: any, path: Path = ROOT) => new EnumMismatch(path, name, invalidValue),
  unknownProperty: (path: Path) => new Violation(path, ValidatorType.UnknownProperty),
  unknownPropertyDenied: (path: Path) => new Violation(path, ValidatorType.UnknownPropertyDenied),
  cycle: (path: Path) => new Violation(path, 'Cycle'),
};

export interface AssertTrue<In = unknown> {
  (value: In, path: Path, ctx: ValidationContext): boolean;
}

export class ValidatorFnWrapper<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(private readonly fn: ValidatorFn<Out, In>, public readonly type?: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return this.fn(value, path, ctx);
  }
}

export class ArrayValidator<Out = unknown> extends Validator<Out[]> {
  constructor(public readonly itemsValidator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<Out[]> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!Array.isArray(value)) {
      return Promise.reject(new TypeMismatch(path, 'array', value));
    }
    const convertedArray: Array<any> = [];
    const cycleResult = ctx.registerObject(value, path, convertedArray);
    if (cycleResult) {
      return cycleResult;
    }

    const promises: PromiseLike<any>[] = [];
    let violations: Violation[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      promises[i] = this.itemsValidator.validatePath(item, path.index(i), ctx).then(
        result => convertedArray[i] = result, 
        reject => violations = violations.concat(violationsOf(reject))
      );
    }

    return Promise.allSettled(promises).then(_ => {
      if (violations.length == 0) {
        return Promise.resolve(convertedArray);
      }
      return Promise.reject(violations);
    });
  }
}

export class ArrayNormalizer<T> extends ArrayValidator<T> {
  constructor(itemsValidator: Validator<T>) {
    super(itemsValidator);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<T[]> {
    if (value === undefined) {
      return super.validatePath([], path, ctx);
    }
    if (Array.isArray(value)) {
      return super.validatePath(value, path, ctx);
    }
    return super.validatePath([value], path, ctx);
  }
}

export class CheckValidator<In> extends Validator<In, In> {
  constructor(public readonly validator: Validator<any, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<In> {
    return this.validator.validatePath(value, path, ctx).then(() => {
      return value;
    });
  }
}

export class CompositionValidator<Out = unknown, In = any> extends Validator<Out, In> {
  public readonly validators: Validator[];
  constructor(validators: Validator[]) {
    super();
    this.validators = ([] as Validator[]).concat(validators);
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  async validatePath(value: In, path: Path, ctx: ValidationContext): Promise<Out> {
    let currentValue: any = value;
    for (let i = 0; i < this.validators.length; i++) {
      currentValue = await this.validators[i].validatePath(currentValue, path, ctx);
    }
    return Promise.resolve(currentValue);
  }
}

export class OneOfValidator<Out = unknown> extends Validator<Out> {
  constructor(public readonly validators: [Validator<Out>, ...Validator<Out>[]]) {
    super();
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  async validatePath(value: unknown, path: Path, ctx: ValidationContext): Promise<Out> {
    let matches = 0;
    let newValue: any = null;
    const promises: PromiseLike<void>[] = [];
    for (let i = 0; i < this.validators.length; i++) {
      promises[i] = this.validators[i].validatePath(value, path, ctx).then(
        result => {
          matches++;
          newValue = result;
        },
        error => {}
      );
    }
    await Promise.allSettled(promises);
    if (matches === 1) {
      return Promise.resolve(newValue);
    }
    return Promise.reject(defaultViolations.oneOf(matches, path));
  }
}

export class AnyOfValidator<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(public readonly validators: Validator<Out>[]) {
    super();
    Object.freeze(this.validators);
    Object.freeze(this);
  }
  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    let passes: Out[] = [];
    let violations: Violation[] = [];
    const promises = [] as PromiseLike<void>[];
    for (const validator of this.validators) {
      promises.push(
        validator.validatePath(value, path, ctx).then(
          result => { 
            passes.push(result);
          },
          (error) => {
            violations = violations.concat(violationsOf(error));
          }
        )
      );
    }
    return Promise.allSettled(promises).then(() => {
      if (passes.length > 0) {
        return Promise.resolve(passes[passes.length - 1]);
      }
      return Promise.reject(violations);
    })
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

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<If | Else> {
    for (let i = 0; i < this.conditionals.length; i++) {
      const conditional = this.conditionals[i];
      if (conditional.fn(value, path, ctx)) {
        return conditional.validator.validatePath(value, path, ctx);
      }
    }
    if (this.elseValidator) {
      return this.elseValidator.validatePath(value, path, ctx);
    }
    return Promise.reject(new Violation(path, 'NoMatchingCondition', value));
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

export class WhenGroupValidator<When = unknown, Otherwise = unknown> extends Validator<When | Otherwise> {
  constructor(public readonly whenGroups: WhenGroup<When>[], public readonly otherwiseValidator?: Validator<Otherwise>) {
    super();
    Object.freeze(this.whenGroups);
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<When | Otherwise>{
    if (ctx.options.group) {
      let passes: When[] = [];
      let violations: Violation[] = [];
      const promises = [] as PromiseLike<void>[];
      for (let i = 0; i < this.whenGroups.length; i++) {
        const whenGroup = this.whenGroups[i];
        if (ctx.options.group.includes(whenGroup.group)) {
          promises.push(whenGroup.validator.validatePath(value, path, ctx).then(
            result => {
              passes.push(result);
            },
            error => {
              violations = violations.concat(violationsOf(error));
            }
          ));
        }
      }
      if (promises.length) {
        return Promise.allSettled(promises).then(() => {
          if (violations.length > 0) {
            return Promise.reject(violations);
          }
          return passes[passes.length - 1];
        });
      }
    }
    if (this.otherwiseValidator) {
      return this.otherwiseValidator.validatePath(value, path, ctx);
    }
    return Promise.reject(new Violation(path, 'NoMatchingGroup', value));
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
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<E extends true ? JsonMap<K, V> : Map<K, V>>{
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!(value instanceof Map)) {
      return Promise.reject(new TypeMismatch(path, 'Map'));
    }
    const map: Map<any, any> = value as Map<any, any>;
    const convertedMap = this.jsonSafeMap ? new JsonMap<K, V>() : new Map<K, V>();
    const promises: Promise<void>[] = [];
    let violations: Violation[] = [];
    let i = 0;
    for (const [key, value] of map) {
      const entryPath = path.index(i);
      const keyPromise = this.keys.validatePath(key, entryPath.index(0), ctx);
      const valuePromise = this.values.validatePath(value, entryPath.index(1), ctx);
      promises[i] = Promise.allSettled([keyPromise, valuePromise]).then(results => {
        const keyResult = results[0];
        const valueResult = results[1];
        if (keyResult.status === 'fulfilled' && valueResult.status === 'fulfilled') {
          convertedMap.set(keyResult.value, valueResult.value);
        } else {
          if (keyResult.status === 'rejected') {
            violations = violations.concat(violationsOf(keyResult.reason));
          }
          if (valueResult.status === 'rejected') {
            violations = violations.concat(violationsOf(valueResult.reason));
          }
        }
      });
      ++i;
    }

    return Promise.allSettled(promises).then(_ => {
      if (violations.length > 0) {
        return Promise.reject(violations);
      }
      return Promise.resolve(convertedMap as any);
    });
  }
}

export class MapNormalizer<K = unknown, V = unknown, E extends boolean = true> extends MapValidator<K, V, E> {
  constructor(keys: Validator<K>, values: Validator<V>, jsonSafeMap: E) {
    super(keys, values, jsonSafeMap);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<E extends true ? JsonMap<K, V> : Map<K, V>> {
    if (value instanceof Map) {
      return super.validatePath(value, path, ctx);
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
        return Promise.reject(violations);
      }
      return super.validatePath(map, path, ctx);
    }
    return Promise.reject(new TypeMismatch(path, 'Map OR array of [key, value] arrays'));
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
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<E extends true ? JsonSet<T> : Set<T>> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!(value instanceof Set || Array.isArray(value))) {
      return Promise.reject(new TypeMismatch(path, 'Set'));
    }
    const convertedSet = this.jsonSafeSet ? new JsonSet<T>() : new Set<T>();
    const promises: PromiseLike<void>[] = [];
    let violations: Violation[] = [];
    let i = 0;
    for (const entry of value) {
      const entryPath = path.index(i);
      promises[i] = this.values.validatePath(entry, entryPath, ctx).then(
        result => {
          convertedSet.add(result);
        },
        error => {
          violations = violations.concat(violationsOf(error));
        }
      );
      ++i;
    }

    return Promise.allSettled(promises).then(_ => {
      if (violations.length > 0) {
        return Promise.reject(violations);
      }
      return Promise.resolve(convertedSet as any);
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


export class AnyValidator<InOut = any> extends Validator<InOut> {
  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    return Promise.resolve(value);
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

  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<string> {
    return this.firstValidator.validatePath(value, path, ctx).then(firstResult => this.nextValidator.validatePath(firstResult, path, ctx));
  }
}

export class StringValidator extends StringValidatorBase<string> {
  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (isString(value)) {
      return Promise.resolve(value);
    }
    return Promise.reject(defaultViolations.string(value, path));
  }
}

export class StringNormalizer extends StringValidatorBase<unknown> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (isString(value)) {
      return Promise.resolve(value);
    }
    if (value instanceof String) {
      return Promise.resolve(value.valueOf());
    }
    if (isSimplePrimitive(value)) {
      return Promise.resolve(String(value));
    }
    return Promise.reject(new TypeMismatch(path, 'primitive value', value));
  }
}

export class NotNullOrUndefinedValidator<InOut> extends Validator<
    InOut extends null ? never : InOut extends undefined ? never : InOut, 
    InOut extends null ? never : InOut extends undefined ? never : InOut
  > {
  validatePath(value: InOut extends null ? never : InOut extends undefined ? never : InOut, path: Path, ctx: ValidationContext): 
      PromiseLike<InOut extends null ? never : InOut extends undefined ? never : InOut> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    return Promise.resolve(value);
  }
}

export class IsNullOrUndefinedValidator extends Validator<null | undefined> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<null | undefined> {
    if (isNullOrUndefined(value)) {
      return Promise.resolve(value);
    }
    return Promise.reject(new TypeMismatch(path, 'NullOrUndefined', value));
  }
}

export class NotEmptyValidator<InOut extends { length: number}> extends Validator<InOut, InOut> {
  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    if (!isNullOrUndefined(value) && isNumber((value as any).length) && (value as any).length > 0) {
      return Promise.resolve(value);
    }
    return Promise.reject(defaultViolations.notEmpty(path));
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

  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!isNumber(value.length)) {
      return Promise.reject(new TypeMismatch(path, 'value with numeric length field'));
    }
    if (value.length < this.min || value.length > this.max) {
      return Promise.reject(defaultViolations.size(this.min, this.max, path));
    }
    return Promise.resolve(value);
  }
}

export class NotBlankValidator extends Validator<string, string> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notBlank(path));
    }
    if (!isString(value)) {
      return Promise.reject(defaultViolations.string(value, path));
    }
    const trimmed = (value as String).trim();
    if (trimmed === '') {
      return Promise.reject(defaultViolations.notBlank(path));
    }
    return Promise.resolve(value);
  }
}

export class BooleanValidator extends Validator<boolean> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<boolean> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (typeof value === 'boolean') {
      return Promise.resolve(value);
    }
    return Promise.reject(defaultViolations.boolean(value, path));
  }
}

export class BooleanNormalizer extends Validator<boolean> {
  constructor(public readonly truePattern: RegExp, public readonly falsePattern: RegExp) {
    super();
    Object.freeze(this.truePattern);
    Object.freeze(this.falsePattern);
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<boolean> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (typeof value === 'boolean') {
      return Promise.resolve(value);
    }
    if (value instanceof Boolean) {
      return Promise.resolve(value.valueOf());
    }
    if (isString(value)) {
      if (this.truePattern.test(value)) {
        return Promise.resolve(true);
      }
      if (this.falsePattern.test(value)) {
        return Promise.resolve(false);
      }
      return Promise.reject(defaultViolations.boolean(value, path));
    } else if (isNumber(value)) {
      return Promise.resolve(!!value);
    }
    return Promise.reject(defaultViolations.boolean(value, path));
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

  protected validateNumberFormat(value: number, format: undefined | NumberFormat, path: Path, ctx: ValidationContext) {
    switch (format) {
      case NumberFormat.integer:
        if (!Number.isInteger(value)) {
          return Promise.reject(defaultViolations.number(value, format, path));
        }
        break;
    }
    return Promise.resolve(value);
  }
}

export class NextNumberValidator<In> extends NumberValidatorBase<In> {
  constructor(public readonly firstValidator: Validator<number, any>, public readonly nextValidator: Validator<number, any>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<number> {
    return this.firstValidator.validatePath(value, path, ctx).then(
      firstResult => this.nextValidator.validatePath(firstResult, path, ctx));
  }
}

export class NumberValidator extends NumberValidatorBase<number> {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePath(value: number, path: Path, ctx: ValidationContext): PromiseLike<number> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!isNumber(value)) {
      return Promise.reject(defaultViolations.number(value, this.format, path));
    }
    return super.validateNumberFormat(value, this.format, path, ctx);
  }
}

export class NumberNormalizer extends NumberValidatorBase<any> {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<number> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (isNumber(value)) {
      return super.validateNumberFormat(value, this.format, path, ctx);
    }
    if (value instanceof Number) {
      return super.validateNumberFormat(value.valueOf(), this.format, path, ctx);
    }
    if (isString(value)) {
      if (value.trim() === '') {
        return Promise.reject(defaultViolations.number(value, this.format, path));
      }
      const nbr = Number(value);
      if (isNumber(nbr)) {
        return super.validateNumberFormat(nbr, this.format, path, ctx);
      }
      return Promise.reject(defaultViolations.number(value, this.format, path));
    }
    return Promise.reject(defaultViolations.number(value, this.format, path));
  }
}

export class MinValidator extends Validator<number, number> {
  constructor(public readonly min: number, public readonly inclusive: boolean) {
    super();
    Object.freeze(this);
  }

  validatePath(value: number, path: Path, ctx: ValidationContext): PromiseLike<number> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!isNumber(value)) {
      return Promise.reject(defaultViolations.number(value, NumberFormat.number, path));
    }
    if (this.inclusive) {
      if (value < this.min) {
        return Promise.reject(defaultViolations.min(this.min, this.inclusive, value, path));
      }
    } else if (value <= this.min) {
      return Promise.reject(defaultViolations.min(this.min, this.inclusive, value, path));
    }
    return Promise.resolve(value);
  }
}

export class MaxValidator extends Validator<number, number> {
  constructor(public readonly max: number, public readonly inclusive: boolean) {
    super();
    Object.freeze(this);
  }

  validatePath(value: number, path: Path, ctx: ValidationContext): PromiseLike<number> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!isNumber(value)) {
      return Promise.reject(defaultViolations.number(value, NumberFormat.number, path));
    }
    if (this.inclusive) {
      if (value > this.max) {
        return Promise.reject(defaultViolations.max(this.max, this.inclusive, value, path));
      }
    } else if (value >= this.max) {
      return Promise.reject(defaultViolations.max(this.max, this.inclusive, value, path));
    }
    return Promise.resolve(value);
  }
}

export class EnumValidator<Out extends Record<string, string | number>> extends Validator<Out[keyof Out]> {
  constructor(public readonly enumType: Out, public readonly name: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<Out[keyof Out]> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const isValid = Object.values(this.enumType).includes(value);
      if (isValid) {
        return Promise.resolve(value as Out[keyof Out]);
      }
    }
    return ctx.failure(defaultViolations.enum(this.name, value, path), value);
  }
}

export class AssertTrueValidator<In> extends Validator<In, In> {
  constructor(public readonly fn: AssertTrue<In>, public readonly type: string, public readonly path?: Path) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<In> {
    if (!this.fn(value, path, ctx)) {
      return Promise.reject(new Violation(this.path ? this.path.connectTo(path) : path, this.type));
    }
    return Promise.resolve(value);
  }
}

export class UuidValidator extends Validator<string> {
  constructor(public readonly version?: number) {
    super();
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<string> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!isString(value)) {
      return Promise.reject(defaultViolations.string(value, path));
    }
    if (!uuidValidate(value)) {
      return Promise.reject(new Violation(path, 'UUID', value));
    }
    if (this.version && uuidVersion(value) !== this.version) {
      return Promise.reject(new Violation(path, `UUIDv${this.version}`, value));
    }
    return Promise.resolve(value);
  }
}

export class HasValueValidator<InOut> extends Validator<InOut> {
  constructor(public readonly expectedValue: InOut) {
    super();
    Object.freeze(this);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<InOut> {
    if (deepEqual(value, this.expectedValue)) {
      return Promise.resolve(value as InOut);
    }
    return Promise.reject(new HasValueViolation(path, this.expectedValue, value));
  }
}

export class AllOfValidator<Out, In> extends Validator<Out, In> {
  constructor(public readonly validators: [Validator<Out, In>, ...Validator<Out, In>[]]) {
    super();
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    let violations: Violation[] = [];
    let firstResult = true;
    let convertedValue: any;
    const promises: PromiseLike<any>[] = [];
    for (let i = 0; i < this.validators.length; i++) {
      const validator = this.validators[i];
      promises[i] = validator.validatePath(value, path, ctx).then(
        result => {
          if (firstResult) {
            convertedValue = result;
            firstResult = false;
          } else if (!deepEqual(result, convertedValue)) {
            violations.push(new Violation(path, 'ConflictingConversions', value));
          }
        },
        error => {
          violations = violations.concat(violationsOf(error));
        }
      );
    }
    return Promise.allSettled(promises).then(_ => {
      if (violations.length == 0) {
        return Promise.resolve(convertedValue);
      }
      return Promise.reject(violations);
    });
  }
}

export class DateValidator extends Validator<Date> {
  constructor(public readonly dateType: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<Date> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    let dateValue: any;
    if (isString(value) || isNumber(value)) {
      dateValue = new Date(value);
    } else {
      dateValue = value;
    }
    if (dateValue instanceof Date) {
      if (isNaN((dateValue as Date).getTime())) {
        return Promise.reject(defaultViolations.date(value, path));
      }
      return Promise.resolve(dateValue);
    }
    return Promise.reject(defaultViolations.date(value, path, this.dateType));
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
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!isString(value)) {
      return Promise.reject(defaultViolations.string(value, path));
    }
    if (this.regExp.test(value)) {
      return Promise.resolve(value);
    }
    return Promise.reject(defaultViolations.pattern(this.regExp, value, path));
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
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (isString(value)) {
      return super.validatePath(value, path, ctx);
    }
    if (isSimplePrimitive(value)) {
      return super.validatePath(String(value), path, ctx);
    }
    return Promise.reject(new TypeMismatch(path, 'primitive value', value));
  }
}

export class OptionalValidator<Out, In> extends Validator<null | undefined | Out, null | undefined | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: null | undefined | In, path: Path, ctx: ValidationContext): PromiseLike<null | undefined | Out> {
    if (isNullOrUndefined(value)) {
      return Promise.resolve(value as null | undefined);
    }
    return this.validator.validatePath(value as In, path, ctx);
  }
}

export class OptionalUndefinedValidator<Out, In> extends Validator<undefined | Out, undefined | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: undefined | In, path: Path, ctx: ValidationContext): PromiseLike<undefined | Out> {
    if (value === undefined) {
      return Promise.resolve(undefined);
    }
    return this.validator.validatePath(value, path, ctx);
  }
}

export class NullableValidator<Out, In> extends Validator<null | Out, null | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: null | In, path: Path, ctx: ValidationContext): PromiseLike<null | Out> {
    if (value === null) {
      return Promise.resolve(null);
    }
    if (value === undefined) {
      return Promise.reject(defaultViolations.notUndefined(path));
    }
    return this.validator.validatePath(value, path, ctx);
  }
}

export class RequiredValidator<Out, In> extends Validator<Out, In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    return this.validator.validatePath(value, path, ctx);
  }
}

export class ValueMapper<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(public readonly fn: MappingFn<Out, In>, public readonly error?: any) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    try {
      const maybePromise = this.fn(value, path, ctx);
      if (isPromise(maybePromise)) {
        return maybePromise.then(
          (result: any) => this.handleResult(result, value, ctx),
          (error: any) => Promise.reject(violationsOf(error)),
        );
      } else {
        return this.handleResult(maybePromise, value, ctx);
      }
    } catch (error) {
      return Promise.reject(violationsOf(error));
    }
  }

  private handleResult(result: any, value: any, ctx: ValidationContext) {
    if (result instanceof Violation) {
      return ctx.failure(result, value);
    }
    return Promise.resolve(result);
  }
}

export function isPromise(value: any): value is PromiseLike<any> {
  return value && typeof value['then'] === 'function';
}

export class IgnoreValidator extends Validator<undefined> {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<undefined> {
    return Promise.resolve(undefined);
  }
}

export class JsonValidator<Out> extends Validator<Out, string> {
  constructor(private readonly validator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (!isString(value)) {
      return Promise.reject(defaultViolations.string(value, path));
    }
    try {
      const parsedValue = JSON.parse(value);
      return this.validator.validatePath(parsedValue, path, ctx);
    } catch (e) {
      return Promise.reject(new TypeMismatch(path, 'JSON', value));
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

export function violationsOf<Out>(error: any): Violation[] {
  if (error instanceof Violation) {
    return [ error ];
  }
  if (error instanceof ValidationError) {
    return error.violations;
  }
  if (Array.isArray(error) && error[0] instanceof Violation) {
    return error as Violation[];
  }
  return [ new ErrorViolation(ROOT, error) ];
}
