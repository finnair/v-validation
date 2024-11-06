import deepEqual from 'deep-equal';
import { Path } from '@finnair/path';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

const ROOT = Path.ROOT;

export interface ValidatorFn<Out = unknown, In = any>{
  (value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>>;
}

export interface MappingFn<Out = unknown, In = any> {
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

  failure(violation: Violation | Violation[], value: any) {
    const violations: Violation[] = ([] as Violation[]).concat(violation);
    if (violations.length === 1) {
      if (this.ignoreViolation(violations[0])) {
        if (this.options.warnLogger) {
          this.options.warnLogger(violations[0], this.options);
        }
        return this.success(value);
      }
    }
    return new ValidationResult(violations);
  }
  success<T = unknown>(value: T) {
    return new ValidationResult<T>(undefined, value);
  }
  failurePromise(violation: Violation | Violation[], value: any) {
    return this.promise(this.failure(violation, value));
  }
  successPromise<T = unknown>(value: T) {
    return this.promise(this.success(value));
  }
  promise<T = unknown>(result: ValidationResult<T>) {
    return new SyncPromise(result);
  }
  registerObject<T = unknown>(value: any, path: Path, convertedValue: T): undefined | ValidationResult<T> {
    if (this.objects.has(value)) {
      if (this.options.allowCycles) {
        return this.success(this.objects.get(value));
      }
      return this.failure(defaultViolations.cycle(path), value);
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

export class SyncPromise<T> implements PromiseLike<T> {
  constructor(private readonly value: T) {}
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (onfulfilled) {
      let result: any;
      try {
        result = onfulfilled(this.value);
      } catch (reason) {
        if (onrejected) {
          result = onrejected(reason);
        } else {
          throw reason;
        }
      }
      if (result && result.then) {
        return result;
      }
      return new SyncPromise(result);
    }
    return this as unknown as PromiseLike<TResult1>;
  }
}

export abstract class Validator<Out = unknown, In = unknown> {
  validateGroup(value: In, group: Group): Promise<ValidationResult<Out>> {
    return this.validate(value, { group });
  }

  validate(value: In, options?: ValidatorOptions): Promise<ValidationResult<Out>> {
    return Promise.resolve(this.validatePath(value, ROOT, new ValidationContext(options || {})));
  }

  abstract validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>>;

  next<V extends Validator<any, Out>>(validator: V): Validator<VType<V>, In> {
    return new NextValidator<VType<V>, In>(this, validator);
  }

  nextMap<XOut>(fn: MappingFn<XOut, Out>): Validator<XOut> {
    return this.next<Validator<XOut>>(new ValueMapper<XOut, Out>(fn));
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

export function isNullOrUndefined(value: any) {
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

export class ValidatorFnWrapper<Out = unknown> extends Validator<Out> {
  constructor(private readonly fn: ValidatorFn<Out>, public readonly type?: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>> {
    return this.fn(value, path, ctx);
  }
}

export class ArrayValidator<Out = unknown> extends Validator<Out[]> {
  constructor(public readonly itemsValidator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out[]>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!Array.isArray(value)) {
      return ctx.failurePromise(new TypeMismatch(path, 'array', value), value);
    }
    const convertedArray: Array<any> = [];
    const cycleResult = ctx.registerObject(value, path, convertedArray);
    if (cycleResult) {
      return ctx.promise(cycleResult);
    }

    const promises: PromiseLike<ValidationResult>[] = [];
    let violations: Violation[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      promises[i] = this.itemsValidator.validatePath(item, path.index(i), ctx).then(result => {
        if (result.isSuccess()) {
          convertedArray[i] = result.getValue();
        } else {
          violations = violations.concat(result.getViolations());
        }
        return result;
      });
    }

    return Promise.all(promises).then(_ => {
      if (violations.length == 0) {
        return ctx.successPromise(convertedArray);
      }
      return ctx.failurePromise(violations, value);
    });
  }
}

export class ArrayNormalizer<T> extends ArrayValidator<T> {
  constructor(itemsValidator: Validator<T>) {
    super(itemsValidator);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<T[]>> {
    if (value === undefined) {
      return super.validatePath([], path, ctx);
    }
    if (Array.isArray(value)) {
      return super.validatePath(value, path, ctx);
    }
    return super.validatePath([value], path, ctx);
  }
}

export class NextValidator<Out = unknown, In = any> extends Validator<Out, In> {
  constructor(public readonly firstValidator: Validator<any, In>, public readonly nextValidator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>> {
    return this.firstValidator.validatePath(value, path, ctx).then(firstResult => {
      if (firstResult.isSuccess()) {
        return this.nextValidator.validatePath(firstResult.getValue(), path, ctx);
      }
      // Violations without value is essentially same for both
      return firstResult as unknown as ValidationResult<Out>;
    });
  }
}

export class CheckValidator<In> extends Validator<In, In> {
  constructor(public readonly validator: Validator<any, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<In>> {
    return this.validator.validatePath(value, path, ctx).then(result => {
      if (result.isSuccess()) {
        return ctx.successPromise(value);
      }
      return result;
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

  async validatePath(value: In, path: Path, ctx: ValidationContext): Promise<ValidationResult<Out>> {
    let currentValue: any = value;
    for (let i = 0; i < this.validators.length; i++) {
      const result = await this.validators[i].validatePath(currentValue, path, ctx);
      if (result.isSuccess()) {
        currentValue = result.getValue();
      } else {
        return result as ValidationResult<Out>;
      }
    }
    return ctx.success(currentValue);
  }
}

export class OneOfValidator<T = unknown> extends Validator<T> {
  constructor(public readonly validators: [Validator<T>, ...Validator<T>[]]) {
    super();
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  async validatePath(value: unknown, path: Path, ctx: ValidationContext): Promise<ValidationResult<T>> {
    let matches = 0;
    let newValue: any = null;
    const promises: PromiseLike<ValidationResult>[] = [];
    for (let i = 0; i < this.validators.length; i++) {
      promises[i] = this.validators[i].validatePath(value, path, ctx).then(result => {
        if (result.isSuccess()) {
          matches++;
          newValue = result.getValue();
        }
        return result;
      });
    }
    await Promise.all(promises);
    if (matches === 1) {
      return ctx.successPromise(newValue);
    }
    return ctx.failurePromise(defaultViolations.oneOf(matches, path), value);
  }
}

export class AnyOfValidator<T = unknown> extends Validator<T> {
  constructor(public readonly validators: Validator<T>[]) {
    super();
    Object.freeze(this.validators);
    Object.freeze(this);
  }
  async validatePath(value: unknown, path: Path, ctx: ValidationContext): Promise<ValidationResult<T>> {
    const passes: T[] = [];
    const failures: Violation[] = [];

    for (const validator of this.validators) {
      const result = await validator.validatePath(value, path, ctx);
      result.isSuccess() ? passes.push(result.getValue()) : failures.push(...result.getViolations());
    }

    return passes.length > 0 ? ctx.success(passes.pop()) : ctx.failure(failures, value);
  }
}

export class IfValidator<If = unknown, In = unknown, Else = unknown> extends Validator<If | Else, In> {
  constructor(public readonly conditionals: Conditional<If, In>[], public readonly elseValidator?: Validator<Else, In>) {
    super();
    Object.freeze(this.conditionals);
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<If | Else>> {
    for (let i = 0; i < this.conditionals.length; i++) {
      const conditional = this.conditionals[i];
      if (conditional.fn(value, path, ctx)) {
        return conditional.validator.validatePath(value, path, ctx);
      }
    }
    if (this.elseValidator) {
      return this.elseValidator.validatePath(value, path, ctx);
    }
    return ctx.successPromise(value as If | Else);
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

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<When | Otherwise>>{
    if (ctx.options.group) {
      for (let i = 0; i < this.whenGroups.length; i++) {
        const whenGroup = this.whenGroups[i];
        if (ctx.options.group.includes(whenGroup.group)) {
          return whenGroup.validator.validatePath(value, path, ctx);
        }
      }
    }
    if (this.otherwiseValidator) {
      return this.otherwiseValidator.validatePath(value, path, ctx);
    }
    return ctx.successPromise(value as When | Otherwise);
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

export class MapValidator<K extends unknown, V extends unknown> extends Validator<Map<K, V>> {
  constructor(public readonly keys: Validator<K>, public readonly values: Validator<V>, public readonly jsonSafeMap: boolean) {
    super();
    Object.freeze(this);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Map<K, V>>>{
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!(value instanceof Map)) {
      return ctx.failurePromise(new TypeMismatch(path, 'Map'), value);
    }
    const map: Map<any, any> = value as Map<any, any>;
    const convertedMap: Map<K, V> = this.jsonSafeMap ? new JsonMap<K, V>() : new Map<K, V>();
    const promises: Promise<void>[] = [];
    let violations: Violation[] = [];
    let i = 0;
    for (const [key, value] of map) {
      const entryPath = path.index(i);
      const keyPromise = this.keys.validatePath(key, entryPath.index(0), ctx);
      const valuePromise = this.values.validatePath(value, entryPath.index(1), ctx);
      promises[i] = Promise.all([keyPromise, valuePromise]).then(results => {
        const keyResult = results[0];
        const valueResult = results[1];
        const keySuccess = handleResult(keyResult);
        const valueSuccess = handleResult(valueResult);
        if (keySuccess && valueSuccess) {
          convertedMap.set(keyResult.getValue(), valueResult.getValue());
        }
      });
      ++i;
    }

    return Promise.all(promises).then(_ => {
      if (violations.length > 0) {
        return ctx.failurePromise(violations, value);
      }
      return ctx.successPromise(convertedMap);
    });

    function handleResult(result: ValidationResult) {
      if (result.isFailure()) {
        violations = violations.concat(result.getViolations());
        return false;
      }
      return true;
    }
  }
}

export class MapNormalizer<K = unknown, V = unknown> extends MapValidator<K, V> {
  constructor(keys: Validator<K>, values: Validator<V>, jsonSafeMap: boolean = true) {
    super(keys, values, jsonSafeMap);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Map<K, V>>> {
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
        return ctx.failurePromise(violations, value);
      }
      return super.validatePath(map, path, ctx);
    }
    return ctx.failurePromise(new TypeMismatch(path, 'Map OR array of [key, value] arrays'), value);
  }
}

export class JsonMap<K, V> extends Map<K, V> {
  constructor(params?: any) {
    super(params);
  }
  toJSON() {
    return [...this.entries()];
  }
}

export class SetValidator<T = unknown> extends Validator<Set<T>> {
  constructor(public readonly values: Validator, public readonly jsonSafeSet: boolean) {
    super();
    Object.freeze(this);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Set<T>>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!(value instanceof Set || Array.isArray(value))) {
      return ctx.failurePromise(new TypeMismatch(path, 'Set'), value);
    }
    const convertedSet: Set<any> = this.jsonSafeSet ? new JsonSet() : new Set<any>();
    const promises: PromiseLike<void>[] = [];
    let violations: Violation[] = [];
    let i = 0;
    for (const entry of value) {
      const entryPath = path.index(i);
      promises[i] = this.values.validatePath(entry, entryPath, ctx).then((result: ValidationResult) => {
        if (result.isFailure()) {
          violations = violations.concat(result.getViolations());
        } else {
          convertedSet.add(result.getValue());
        }
      });
      ++i;
    }

    return Promise.all(promises).then(_ => {
      if (violations.length > 0) {
        return ctx.failurePromise(violations, value);
      }
      return ctx.successPromise(convertedSet);
    });
  }
}

export class JsonSet<K> extends Set<K> {
  constructor(params?: any) {
    super(params);
  }
  toJSON() {
    return [...this.values()];
  }
}


export class AnyValidator extends Validator<any> {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<any>> {
    return ctx.successPromise(value);
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
}

export class NextStringValidator extends StringValidatorBase<string> {
  constructor(public readonly firstValidator: Validator<string, any>, public readonly nextValidator: Validator<string, any>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<string>> {
    return this.firstValidator.validatePath(value, path, ctx).then(firstResult => {
      if (firstResult.isSuccess()) {
        return this.nextValidator.validatePath(firstResult.getValue(), path, ctx);
      }
      // Violations without value is essentially same for both
      return firstResult;
    });
  }
}

export class StringValidator extends StringValidatorBase<string> {
  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<string>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (isString(value)) {
      return ctx.successPromise(value);
    }
    return ctx.failurePromise(defaultViolations.string(value, path), value);
  }
}

export class StringNormalizer extends StringValidatorBase<unknown> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<string>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (isString(value)) {
      return ctx.successPromise(value);
    }
    if (value instanceof String) {
      return ctx.successPromise(value.valueOf());
    }
    if (isSimplePrimitive(value)) {
      return ctx.successPromise(String(value));
    }
    return ctx.failurePromise(new TypeMismatch(path, 'primitive value', value), value);
  }
}

export class NotNullOrUndefinedValidator<InOut> extends Validator<
    InOut extends null ? never : InOut extends undefined ? never : InOut, 
    InOut extends null ? never : InOut extends undefined ? never : InOut
  > {
  validatePath(value: InOut extends null ? never : InOut extends undefined ? never : InOut, path: Path, ctx: ValidationContext): 
      PromiseLike<ValidationResult<InOut extends null ? never : InOut extends undefined ? never : InOut>> {
    return isNullOrUndefined(value) ? ctx.failurePromise(defaultViolations.notNull(path), value) : ctx.successPromise(value);
  }
}

export class IsNullOrUndefinedValidator extends Validator<null | undefined> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<null | undefined>> {
    return isNullOrUndefined(value) ? ctx.successPromise(value) : ctx.failurePromise(new TypeMismatch(path, 'NullOrUndefined', value), value);
  }
}

export class NotEmptyValidator<InOut extends { length: number}> extends Validator<InOut, InOut> {
  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<InOut>> {
    return !isNullOrUndefined(value) && isNumber((value as any).length) && (value as any).length > 0
      ? ctx.successPromise(value)
      : ctx.failurePromise(defaultViolations.notEmpty(path), value);
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

  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<InOut>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value.length)) {
      return ctx.failurePromise(new TypeMismatch(path, 'value with numeric length field'), value);
    }
    if (value.length < this.min || value.length > this.max) {
      return ctx.failurePromise(defaultViolations.size(this.min, this.max, path), value);
    }
    return ctx.successPromise(value);
  }
}

export class NotBlankValidator extends Validator<string, string> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<string>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notBlank(path), value);
    }
    if (!isString(value)) {
      return ctx.failurePromise(defaultViolations.string(value, path), value);
    }
    const trimmed = (value as String).trim();
    if (trimmed === '') {
      return ctx.failurePromise(defaultViolations.notBlank(path), value);
    }
    return ctx.successPromise(value);
  }
}

export class BooleanValidator extends Validator<boolean> {
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<boolean>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (typeof value === 'boolean') {
      return ctx.successPromise(value);
    }
    return ctx.failurePromise(defaultViolations.boolean(value, path), value);
  }
}

export class BooleanNormalizer extends Validator<boolean> {
  constructor(public readonly truePattern: RegExp, public readonly falsePattern: RegExp) {
    super();
    Object.freeze(this.truePattern);
    Object.freeze(this.falsePattern);
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<boolean>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (typeof value === 'boolean') {
      return ctx.successPromise(value);
    }
    if (value instanceof Boolean) {
      return ctx.successPromise(value.valueOf());
    }
    if (isString(value)) {
      if (this.truePattern.test(value)) {
        return ctx.successPromise(true);
      }
      if (this.falsePattern.test(value)) {
        return ctx.successPromise(false);
      }
      return ctx.failurePromise(defaultViolations.boolean(value, path), value);
    } else if (isNumber(value)) {
      return ctx.successPromise(!!value);
    }
    return ctx.failurePromise(defaultViolations.boolean(value, path), value);
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

  protected validateNumberFormat(value: number, format: undefined | NumberFormat, path: Path, ctx: ValidationContext) {
    switch (format) {
      case NumberFormat.integer:
        if (!Number.isInteger(value)) {
          return ctx.failurePromise(defaultViolations.number(value, format, path), value);
        }
        break;
    }
    return ctx.successPromise(value);
  }
}

export class NextNumberValidator<In> extends NumberValidatorBase<In> {
  constructor(public readonly firstValidator: Validator<number, any>, public readonly nextValidator: Validator<number, any>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<number>> {
    return this.firstValidator.validatePath(value, path, ctx).then(firstResult => {
      if (firstResult.isSuccess()) {
        return this.nextValidator.validatePath(firstResult.getValue(), path, ctx);
      }
      // Violations without value is essentially same for both
      return firstResult;
    });
  }
}

export class NumberValidator extends NumberValidatorBase<number> {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePath(value: number, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<number>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value)) {
      return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
    }
    return super.validateNumberFormat(value, this.format, path, ctx);
  }
}

export class NumberNormalizer extends NumberValidatorBase<any> {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<number>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (isNumber(value)) {
      return super.validateNumberFormat(value, this.format, path, ctx);
    }
    if (value instanceof Number) {
      return super.validateNumberFormat(value.valueOf(), this.format, path, ctx);
    }
    if (isString(value)) {
      if (value.trim() === '') {
        return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
      }
      const nbr = Number(value);
      if (isNumber(nbr)) {
        return super.validateNumberFormat(nbr, this.format, path, ctx);
      }
      return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
    }
    return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
  }
}

export class MinValidator extends Validator<number, number> {
  constructor(public readonly min: number, public readonly inclusive: boolean) {
    super();
    Object.freeze(this);
  }

  validatePath(value: number, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<number>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value)) {
      return ctx.failurePromise(defaultViolations.number(value, NumberFormat.number, path), value);
    }
    if (this.inclusive) {
      if (value < this.min) {
        return ctx.failurePromise(defaultViolations.min(this.min, this.inclusive, value, path), value);
      }
    } else if (value <= this.min) {
      return ctx.failurePromise(defaultViolations.min(this.min, this.inclusive, value, path), value);
    }
    return ctx.successPromise(value);
  }
}

export class MaxValidator extends Validator<number, number> {
  constructor(public readonly max: number, public readonly inclusive: boolean) {
    super();
    Object.freeze(this);
  }

  validatePath(value: number, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<number>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value)) {
      return ctx.failurePromise(defaultViolations.number(value, NumberFormat.number, path), value);
    }
    if (this.inclusive) {
      if (value > this.max) {
        return ctx.failurePromise(defaultViolations.max(this.max, this.inclusive, value, path), value);
      }
    } else if (value >= this.max) {
      return ctx.failurePromise(defaultViolations.max(this.max, this.inclusive, value, path), value);
    }
    return ctx.successPromise(value);
  }
}

export class EnumValidator<T extends {[key: number]: string | number}> extends Validator<T> {
  constructor(public readonly enumType: T, public readonly name: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<T>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const isValid = Object.values(this.enumType).includes(value);
      if (isValid) {
        return ctx.successPromise(value as T);
      }
    }
    return ctx.failurePromise(defaultViolations.enum(this.name, value, path), value);
  }
}

export class AssertTrueValidator<In> extends Validator<In, In> {
  constructor(public readonly fn: AssertTrue<In>, public readonly type: string, public readonly path?: Path) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<In>> {
    if (!this.fn(value, path, ctx)) {
      return ctx.failurePromise(new Violation(this.path ? this.path.connectTo(path) : path, this.type), value);
    }
    return ctx.successPromise(value);
  }
}

export class UuidValidator extends Validator<string> {
  constructor(public readonly version?: number) {
    super();
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<string>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!isString(value)) {
      return ctx.failurePromise(defaultViolations.string(value, path), value);
    }
    if (!uuidValidate(value)) {
      return ctx.failurePromise(new Violation(path, 'UUID', value), value);
    }
    if (this.version && uuidVersion(value) !== this.version) {
      return ctx.failurePromise(new Violation(path, `UUIDv${this.version}`, value), value);
    }
    return ctx.successPromise(value);
  }
}

export class HasValueValidator<InOut> extends Validator<InOut> {
  constructor(public readonly expectedValue: InOut) {
    super();
    Object.freeze(this);
  }
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<InOut>> {
    if (deepEqual(value, this.expectedValue)) {
      return ctx.successPromise(value as InOut);
    }
    return ctx.failurePromise(new HasValueViolation(path, this.expectedValue, value), value);
  }
}

export class AllOfValidator<Out, In> extends Validator<Out, In> {
  constructor(public readonly validators: [Validator<Out, In>, ...Validator<Out, In>[]]) {
    super();
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>> {
    let violations: Violation[] = [];
    let convertedValue: any;
    const promises: PromiseLike<any>[] = [];
    for (let i = 0; i < this.validators.length; i++) {
      const validator = this.validators[i];
      promises[i] = validator.validatePath(value, path, ctx).then(result => {
        if (!result.isSuccess()) {
          violations = violations.concat(result.getViolations());
        } else {
          const resultValue = result.getValue();
          if (resultValue !== value as any) {
            if (convertedValue !== undefined && !deepEqual(resultValue, convertedValue)) {
              violations.push(new Violation(path, 'ConflictingConversions', value));
            } else {
              convertedValue = resultValue;
            }
          }
        }
      });
    }
    return Promise.all(promises).then(_ => {
      if (violations.length == 0) {
        return ctx.successPromise(convertedValue !== undefined ? convertedValue : value);
      }
      return ctx.failurePromise(violations, value);
    });
  }
}

export class DateValidator extends Validator<Date> {
  constructor(public readonly dateType: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Date>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    let dateValue: any;
    if (isString(value) || isNumber(value)) {
      dateValue = new Date(value);
    } else {
      dateValue = value;
    }
    if (dateValue instanceof Date) {
      if (isNaN((dateValue as Date).getTime())) {
        return ctx.failurePromise(defaultViolations.date(value, path), value);
      }
      return ctx.successPromise(dateValue);
    }
    return ctx.failurePromise(defaultViolations.date(value, path, this.dateType), value);
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

  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<string>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!isString(value)) {
      return ctx.failurePromise(defaultViolations.string(value, path), value);
    }
    if (this.regExp.test(value)) {
      return ctx.successPromise(value);
    }
    return ctx.failurePromise(defaultViolations.pattern(this.regExp, value, path), value);
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
  validatePath(value: unknown, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<string>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (isString(value)) {
      return super.validatePath(value, path, ctx);
    }
    if (isSimplePrimitive(value)) {
      return super.validatePath(String(value), path, ctx);
    }
    return ctx.failurePromise(new TypeMismatch(path, 'primitive value', value), value);
  }
}

export class OptionalValidator<Out, In> extends Validator<null | undefined | Out, null | undefined | In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: null | undefined | In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<null | undefined | Out>> {
    if (isNullOrUndefined(value)) {
      return ctx.successPromise(value as null | undefined);
    }
    return this.validator.validatePath(value as In, path, ctx);
  }
}

export class RequiredValidator<Out, In> extends Validator<Out, In> {
  constructor(private readonly validator: Validator<Out, In>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    return this.validator.validatePath(value, path, ctx);
  }
}

export class ValueMapper<Out = unknown, In = unknown> extends Validator<Out, In> {
  constructor(public readonly fn: MappingFn<Out, In>, public readonly error?: any) {
    super();
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>> {
    try {
      const maybePromise = this.fn(value, path, ctx);
      if (isPromise(maybePromise)) {
        return maybePromise.then(
          (result: any) => this.handleResult(result, value, ctx),
          (error: any) => this.handleError(error, value, path, ctx),
        );
      } else {
        return this.handleResult(maybePromise, value, ctx);
      }
    } catch (error) {
      return this.handleError(error, value, path, ctx);
    }
  }

  private handleError(error: any, value: any, path: Path, ctx: ValidationContext) {
    if (error instanceof ValidationError) {
      return ctx.failurePromise(error.violations, value);
    }
    return ctx.failurePromise(new ErrorViolation(path, this.error || error), value);
  }

  private handleResult(result: any, value: any, ctx: ValidationContext) {
    if (result instanceof Violation) {
      return ctx.failurePromise(result as Violation, value);
    }
    return ctx.successPromise(result);
  }
}

export function isPromise(value: any): value is PromiseLike<any> {
  return value && typeof value['then'] === 'function';
}

export class IgnoreValidator extends Validator<undefined> {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<undefined>> {
    return ctx.successPromise(undefined);
  }
}

export class JsonValidator<Out> extends Validator<Out, string> {
  constructor(private readonly validator: Validator<Out>) {
    super();
    Object.freeze(this);
  }

  validatePath(value: string, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!isString(value)) {
      return ctx.failurePromise(defaultViolations.string(value, path), value);
    }
    try {
      const parsedValue = JSON.parse(value);
      return this.validator.validatePath(parsedValue, path, ctx);
    } catch (e) {
      return ctx.failurePromise(new TypeMismatch(path, 'JSON', value), value);
    }
  }
}

export type CompositionParameters<Out = unknown, In = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown, T5 = unknown> = 
  [Validator<Out, In>] | 
  [Validator<T1, In>, Validator<Out, T1>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<Out, T2>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<Out, T3>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<T4, T3>, Validator<Out, T4>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<T4, T3>, Validator<T5, T4>, Validator<Out, T5>];

export function maybeCompositionOf<Out = unknown, In = unknown, T1 = unknown, T2 = unknown, T3 = unknown, T4 = unknown, T5 = unknown>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) {
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
