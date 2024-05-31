import deepEqual from 'deep-equal';
import { Path } from '@finnair/path';

const ROOT = Path.ROOT;

export interface ValidatorFn {
  (value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult>;
}

export interface MappingFn {
  (value: any, path: Path, ctx: ValidationContext): any | Promise<any>;
}

export type Properties = { [s: string]: Validator };

export interface ValidatorOptions {
  readonly group?: Group;
  readonly ignoreUnknownProperties?: boolean;
  readonly ignoreUnknownEnumValues?: boolean;
  readonly warnLogger?: WarnLogger;
  readonly allowCycles?: boolean;
}

export class ValidationContext {
  constructor(public readonly options: ValidatorOptions) {
  }

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

  success(value: any) {
    return new ValidationResult(undefined, value);
  }

  failurePromise(violation: Violation | Violation[], value: any) {
    return this.promise(this.failure(violation, value));
  }

  successPromise(value: any) {
    return this.promise(this.success(value));
  }

  promise<T>(result: ValidationResult) {
    return new SyncPromise(result);
  }

  registerObject(value: any, path: Path, convertedValue: any): undefined | ValidationResult {
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
  constructor(private readonly value: T) {
  }

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

export abstract class Validator {
  validateGroup(value: any, group: Group): Promise<ValidationResult> {
    return this.validate(value, { group });
  }

  validate(value: any, options?: ValidatorOptions): Promise<ValidationResult> {
    return Promise.resolve(this.validatePath(value, ROOT, new ValidationContext(options || {})));
  }

  abstract validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult>;

  next(...allOf: Validator[]): Validator {
    if (allOf.length == 0) {
      return this;
    }
    return new NextValidator(this, maybeAllOfValidator(allOf));
  }

  nextMap(fn: MappingFn): Validator {
    return this.next(new ValueMapper(fn));
  }
}

export interface WarnLogger {
  (violation: Violation, ctx: ValidatorOptions): void;
}

export class ValidationResult {
  private value?: any;

  private violations?: Violation[];

  constructor(violations?: Violation[], value?: any) {
    this.violations = violations;
    this.value = value;
    Object.freeze(this.violations);
  }

  isSuccess() {
    return this.violations === undefined || this.violations.length === 0;
  }

  isFailure() {
    return !this.isSuccess();
  }

  getValue(): any {
    if (!this.isSuccess()) {
      throw new ValidationError(this.getViolations());
    }
    return this.value;
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
  constructor(public readonly path: Path, public readonly type: string, public readonly invalidValue?: any) {
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
  notEmpty: (path: Path = ROOT, invalidValue?: any) => new Violation(path, ValidatorType.NotEmpty),
  notBlank: (path: Path = ROOT) => new Violation(path, ValidatorType.NotBlank),
  oneOf: (matches: number, path: Path = ROOT) => new OneOfMismatch(path, matches),
  pattern: (pattern: RegExp, invalidValue: any, path: Path = ROOT) => new PatternViolation(path, '' + pattern, invalidValue),
  enum: (name: string, invalidValue: any, path: Path = ROOT) => new EnumMismatch(path, name, invalidValue),
  unknownProperty: (path: Path) => new Violation(path, ValidatorType.UnknownProperty),
  unknownPropertyDenied: (path: Path) => new Violation(path, ValidatorType.UnknownPropertyDenied),
  cycle: (path: Path) => new Violation(path, 'Cycle'),
};

export interface AssertTrue {
  (value: any, path: Path, ctx: ValidationContext): boolean;
}

export type PropertyModel = { [s: string]: string | number | Validator | Validator[] };

export type ParentModel = ObjectModel | ObjectValidator | (ObjectModel | ObjectValidator)[];

export interface ObjectModel {
  readonly extends?: ParentModel;
  readonly properties?: PropertyModel;
  readonly localProperties?: PropertyModel;
  readonly additionalProperties?: boolean | MapEntryModel | MapEntryModel[];
  readonly next?: Validator | Validator[];
  readonly localNext?: Validator;
}

export interface MapEntryModel {
  readonly keys: Validator | Validator[];
  readonly values: Validator | Validator[];
}

function getPropertyValidators(properties?: PropertyModel): Properties {
  const propertyValidators: Properties = {};
  if (properties) {
    for (const name in properties) {
      if (isString(properties[name]) || isNumber(properties[name])) {
        propertyValidators[name] = new HasValueValidator(properties[name]);
      } else {
        propertyValidators[name] = maybeAllOfValidator(properties[name] as Validator | Validator[]);
      }
    }
  }
  return propertyValidators;
}

function getParentValidators(parents: undefined | ParentModel): ObjectValidator[] {
  let validators: ObjectValidator[] = [];
  let parentValidators: any = [];
  if (parents) {
    parentValidators = parentValidators.concat(parents);
  }
  for (let i = 0; i < parentValidators.length; i++) {
    const modelOrValidator = parentValidators[i];
    if (modelOrValidator instanceof ObjectValidator) {
      validators[i] = modelOrValidator as ObjectValidator;
    } else {
      validators[i] = new ObjectValidator(modelOrValidator as ObjectModel);
    }
  }
  return validators;
}

function getMapEntryValidators(additionalProperties?: boolean | MapEntryModel | MapEntryModel[]): MapEntryValidator[] {
  if (isNullOrUndefined(additionalProperties)) {
    return [];
  }
  if (typeof additionalProperties === 'boolean') {
    if (additionalProperties) {
      return [allowAllMapEntries];
    }
    return [allowNoneMapEntries];
  }
  const models: MapEntryModel[] = ([] as MapEntryModel[]).concat(additionalProperties as MapEntryModel | MapEntryModel[]);
  const validators: MapEntryValidator[] = [];
  for (let i = 0; i < models.length; i++) {
    validators[i] = new MapEntryValidator(models[i]);
  }
  return validators;
}

export class ValidatorFnWrapper extends Validator {
  private readonly fn: ValidatorFn;

  constructor(fn: ValidatorFn, public readonly type?: string) {
    super();
    this.fn = fn;
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return this.fn(value, path, ctx);
  }
}

const lenientUnknownPropertyValidator = new ValidatorFnWrapper((value: any, path: Path, ctx: ValidationContext) =>
  ctx.failurePromise(defaultViolations.unknownProperty(path), value),
);

const strictUnknownPropertyValidator = new ValidatorFnWrapper((value: any, path: Path, ctx: ValidationContext) =>
  ctx.failurePromise(defaultViolations.unknownPropertyDenied(path), value),
);

export interface PropertyFilter {
  (key: string): boolean;
}

export function mergeProperties(from: Properties, to: Properties): Properties {
  if (from) {
    for (const key in from) {
      if (to[key]) {
        to[key] = to[key].next(from[key]);
      } else {
        to[key] = from[key];
      }
    }
  }
  return to;
}

export class ObjectValidator extends Validator {
  public readonly properties: Properties;

  public readonly localProperties: Properties;

  public readonly additionalProperties: MapEntryValidator[];

  public readonly parentValidators: ObjectValidator[];

  public readonly nextValidator: undefined | Validator;

  public readonly localNextValidator: undefined | Validator;

  constructor(public readonly model: ObjectModel) {
    super();
    let properties: Properties = {};
    let additionalProperties: MapEntryValidator[] = [];
    let inheritedThenValidators: Validator[] = [];

    this.parentValidators = getParentValidators(model.extends);
    for (let i = 0; i < this.parentValidators.length; i++) {
      const parent = this.parentValidators[i];
      additionalProperties = additionalProperties.concat(parent.additionalProperties);
      properties = mergeProperties(parent.properties, properties);
      if (parent.nextValidator) {
        inheritedThenValidators = inheritedThenValidators.concat(parent.nextValidator);
      }
    }
    let nextValidator = inheritedThenValidators.length ? maybeAllOfValidator(inheritedThenValidators) : undefined;
    if (model.next) {
      if (nextValidator) {
        nextValidator = nextValidator.next(maybeAllOfValidator(model.next));
      } else {
        nextValidator = maybeAllOfValidator(model.next);
      }
    }
    this.additionalProperties = additionalProperties.concat(getMapEntryValidators(model.additionalProperties));
    this.properties = mergeProperties(getPropertyValidators(model.properties), properties);
    this.localProperties = getPropertyValidators(model.localProperties);
    this.nextValidator = nextValidator;
    this.localNextValidator = model.localNext;

    Object.freeze(this.properties);
    Object.freeze(this.localProperties);
    Object.freeze(this.additionalProperties);
    Object.freeze(this.parentValidators);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return this.validateFilteredPath(value, path, ctx, _ => true);
  }

  validateFilteredPath(value: any, path: Path, ctx: ValidationContext, filter: PropertyFilter): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (typeof value !== 'object') {
      return ctx.failurePromise(defaultViolations.object(path), value);
    }
    const context: ObjectValidationContext = {
      path,
      ctx,
      filter,
      convertedObject: {},
      violations: [],
    };
    const cycleResult = ctx.registerObject(value, path, context.convertedObject);
    if (cycleResult) {
      return ctx.promise(cycleResult);
    }
    const propertyResults: PromiseLike<ValidationResult>[] = [];

    for (const key in this.properties) {
      propertyResults.push(validateProperty(key, value[key], this.properties[key], context));
    }
    for (const key in this.localProperties) {
      propertyResults.push(validateProperty(key, value[key], this.localProperties[key], context));
    }
    for (const key in value) {
      if (!this.properties[key] && !this.localProperties[key]) {
        propertyResults.push(validateAdditionalProperty(key, value[key], this.additionalProperties, context));
      }
    }

    let validationChain = Promise.all(propertyResults).then(_ => {
      if (context.violations.length === 0) {
        return ctx.successPromise(context.convertedObject);
      }
      return ctx.failurePromise(context.violations, context.convertedObject);
    });
    if (this.nextValidator) {
      const validator = this.nextValidator;
      validationChain = validationChain.then(result => (result.isSuccess() ? validator.validatePath(result.getValue(), path, ctx) : result));
    }
    if (this.localNextValidator) {
      const validator = this.localNextValidator;
      validationChain = validationChain.then(result => (result.isSuccess() ? validator.validatePath(result.getValue(), path, ctx) : result));
    }
    return validationChain;
  }
}

interface ObjectValidationContext {
  readonly path: Path;
  readonly ctx: ValidationContext;
  readonly filter: PropertyFilter;
  readonly convertedObject: any;
  violations: Violation[];
}

function validateProperty(key: string, currentValue: any, validator: Validator, context: ObjectValidationContext) {
  if (!context.filter(key)) {
    return context.ctx.successPromise(undefined);
  }
  // Assign for property order
  context.convertedObject[key] = undefined;
  return validator.validatePath(currentValue, context.path.property(key), context.ctx).then(result => {
    if (result.isSuccess()) {
      const newValue = result.getValue();
      if (newValue !== undefined) {
        context.convertedObject[key] = newValue;
      } else {
        delete context.convertedObject[key];
      }
    } else {
      delete context.convertedObject[key];
      context.violations = context.violations.concat(result.getViolations());
    }
    return result;
  });
}

async function validateAdditionalProperty(
  key: string,
  originalValue: any,
  additionalProperties: MapEntryValidator[],
  context: ObjectValidationContext,
): Promise<any> {
  if (!context.filter(key)) {
    return Promise.resolve(context.ctx.success(undefined));
  }
  const keyPath = context.path.property(key);
  let currentValue = originalValue;
  let validKey = false;
  let result: undefined | ValidationResult;
  for (let i = 0; i < additionalProperties.length; i++) {
    const entryValidator = additionalProperties[i];
    result = await entryValidator.keyValidator.validatePath(key, keyPath, context.ctx);
    if (result.isSuccess()) {
      validKey = true;
      result = await validateProperty(key, currentValue, entryValidator.valueValidator, context);
      if (result.isSuccess()) {
        currentValue = result.getValue();
      } else {
        return result;
      }
    }
  }
  if (!validKey) {
    if (additionalProperties.length == 1 && result) {
      // Only one kind of key accepted -> give out violations related to that
      context.violations = context.violations.concat(result!.getViolations());
    } else {
      return validateProperty(key, originalValue, lenientUnknownPropertyValidator, context);
    }
  }
}

/**
 * Converts a primitive `value` into an object `{ property: value }`. This normalizer can be used
 * to e.g. preprocess the results of an XML parser and a schema having textual elements with optional attributes
 * where an element without attributes would be simple string and an element with attributes would be an object.
 */
export class ObjectNormalizer extends Validator {
  constructor(public readonly property: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (value === undefined) {
      return ctx.successPromise(undefined);
    }
    if (typeof value !== 'object' || value === null) {
      const object: any = {};
      object[this.property] = value;
      return ctx.successPromise(object);
    }
    return ctx.successPromise(value);
  }
}

export class MapEntryValidator {
  public readonly keyValidator: Validator;

  public readonly valueValidator: Validator;

  constructor(entryModel: MapEntryModel) {
    this.keyValidator = maybeAllOfValidator(entryModel.keys);
    this.valueValidator = maybeAllOfValidator(entryModel.values);
    Object.freeze(this);
  }
}

export class ArrayValidator extends Validator {
  constructor(public readonly itemsValidator: Validator) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class ArrayNormalizer extends ArrayValidator {
  constructor(itemsValidator: Validator) {
    super(itemsValidator);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (value === undefined) {
      return super.validatePath([], path, ctx);
    }
    if (Array.isArray(value)) {
      return super.validatePath(value, path, ctx);
    }
    return super.validatePath([value], path, ctx);
  }
}

export class NextValidator extends Validator {
  constructor(public readonly firstValidator: Validator, public readonly nextValidator: Validator) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return this.firstValidator.validatePath(value, path, ctx).then(firstResult => {
      if (firstResult.isSuccess()) {
        return this.nextValidator.validatePath(firstResult.getValue(), path, ctx);
      }
      return firstResult;
    });
  }
}

export class CheckValidator extends Validator {
  constructor(public readonly validator: Validator) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return this.validator.validatePath(value, path, ctx).then(result => {
      if (result.isSuccess()) {
        return ctx.successPromise(value);
      }
      return result;
    });
  }
}

export class CompositionValidator extends Validator {
  public readonly validators: Validator[];

  constructor(validators: Validator | Validator[]) {
    super();
    this.validators = ([] as Validator[]).concat(validators);
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    let currentValue = value;
    for (let i = 0; i < this.validators.length; i++) {
      const result = await this.validators[i].validatePath(currentValue, path, ctx);
      if (result.isSuccess()) {
        currentValue = result.getValue();
      } else {
        return result;
      }
    }
    return ctx.success(currentValue);
  }
}

export class OneOfValidator extends Validator {
  constructor(public readonly validators: Validator[]) {
    super();
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
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

export class AnyOfValidator extends Validator {
  constructor(public readonly validators: Validator[]) {
    super();
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    const passes: ValidationResult[] = [];
    const failures: Violation[] = [];

    for (let i = 0; i < this.validators.length; i++) {
      const validator = this.validators[i];
      const result = await validator.validatePath(value, path, ctx);
      result.isSuccess() ? passes.push(result.getValue()) : failures.push(...result.getViolations());
    }

    return passes.length > 0 ? ctx.success(passes.pop()) : ctx.failure(failures, value);
  }
}

export class IfValidator extends Validator {
  constructor(public readonly conditionals: Conditional[], public readonly elseValidator?: Validator) {
    super();
    Object.freeze(this.conditionals);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    for (let i = 0; i < this.conditionals.length; i++) {
      const conditional = this.conditionals[i];
      if (conditional.fn(value, path, ctx)) {
        return conditional.validator.validatePath(value, path, ctx);
      }
    }
    if (this.elseValidator) {
      return this.elseValidator.validatePath(value, path, ctx);
    }
    return ctx.successPromise(value);
  }

  elseIf(fn: AssertTrue, ...allOf: Validator[]): IfValidator {
    if (this.elseValidator) {
      throw new Error('Else is already defined. Define elseIfs first.');
    }
    return new IfValidator([...this.conditionals, new Conditional(fn, allOf)], this.elseValidator);
  }

  else(...allOf: Validator[]): Validator {
    if (this.elseValidator) {
      throw new Error('Else is already defined.');
    }
    return new IfValidator(this.conditionals, maybeAllOfValidator(allOf));
  }
}

export class Conditional {
  public readonly fn: AssertTrue;
  public readonly validator: Validator;

  constructor(fn: AssertTrue, allOf: Validator[]) {
    this.fn = fn;
    this.validator = maybeAllOfValidator(allOf);
    Object.freeze(this.validator);
    Object.freeze(this);
  }
}

export class WhenGroupValidator extends Validator {
  constructor(public readonly whenGroups: WhenGroup[], public readonly otherwiseValidator?: Validator) {
    super();
    Object.freeze(this.whenGroups);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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
    return ctx.successPromise(value);
  }

  whenGroup(group: GroupOrName, ...allOf: Validator[]) {
    if (this.otherwiseValidator) {
      throw new Error('Otherwise already defined. Define whenGroups first.');
    }
    return new WhenGroupValidator([...this.whenGroups, new WhenGroup(group, allOf)], this.otherwiseValidator);
  }

  otherwise(...allOf: Validator[]): Validator {
    if (this.otherwiseValidator) {
      throw new Error('Otherwise already defined.');
    }
    return new WhenGroupValidator(this.whenGroups, maybeAllOfValidator(allOf));
  }
}

export class WhenGroup {
  public readonly group: string;

  public readonly validator: Validator;

  constructor(group: GroupOrName, allOf: Validator[]) {
    this.group = isString(group) ? (group as string) : (group as Group).name;
    this.validator = maybeAllOfValidator(allOf);
    Object.freeze(this);
  }
}

export class MapValidator extends Validator {
  constructor(public readonly keys: Validator, public readonly values: Validator, public readonly jsonSafeMap: boolean) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!(value instanceof Map)) {
      return ctx.failurePromise(new TypeMismatch(path, 'Map'), value);
    }
    const map: Map<any, any> = value as Map<any, any>;
    const convertedMap: Map<any, any> = this.jsonSafeMap ? new JsonMap() : new Map<any, any>();
    const promises: Promise<void>[] = [];
    let violations: Violation[] = [];
    let i = 0;
    for (const [key, value] of map) {
      const entryPath = path.index(i);
      const keyPromise = this.keys.validatePath(key, entryPath.index(0), ctx);
      const valuePromise = this.values.validatePath(value, entryPath.index(1), ctx);
      promises[i] = Promise.all([keyPromise, valuePromise]).then(results => {
        const keyResult = results[0] as ValidationResult;
        const valueResult = results[1] as ValidationResult;
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

export class MapNormalizer extends MapValidator {
  constructor(keys: Validator, values: Validator) {
    super(keys, values, true);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class SetValidator extends Validator {
  constructor(public readonly values: Validator, public readonly jsonSafeSet: boolean) {
    super();
    Object.freeze(this);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class AnyValidator extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return ctx.successPromise(value);
  }
}

export function isString(value: any) {
  return typeof value === 'string' || value instanceof String;
}

export function isSimplePrimitive(value: any) {
  const type = typeof value;
  return type === 'boolean' || type === 'number' || type === 'bigint' || type === 'string' || type === 'symbol';
}

export class StringValidator extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (isString(value)) {
      return ctx.successPromise(value);
    }
    return ctx.failurePromise(defaultViolations.string(value, path), value);
  }
}

export class StringNormalizer extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (isString(value)) {
      return ctx.successPromise(value);
    }
    if (isSimplePrimitive(value)) {
      return ctx.successPromise(String(value));
    }
    return ctx.failurePromise(new TypeMismatch(path, 'primitive value', value), value);
  }
}

export class NotNullOrUndefinedValidator extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return isNullOrUndefined(value) ? ctx.failurePromise(defaultViolations.notNull(path), value) : ctx.successPromise(value);
  }
}

export class IsNullOrUndefinedValidator extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return isNullOrUndefined(value) ? ctx.successPromise(value) : ctx.failurePromise(new TypeMismatch(path, 'NullOrUndefined', value), value);
  }
}

export class NotEmptyValidator extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value) || (isObject(value) && !Object.keys(value).length) || (hasNumericLength(value) && !value.length)) {
      return ctx.failurePromise(defaultViolations.notEmpty(path, value), value);
    }
    return ctx.successPromise(value);
  }
}

function isObject(value: any) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNumericLength(value: any) {
  return (Array.isArray(value) || typeof value === 'string') && typeof value.length === 'number';
}

export class SizeValidator extends Validator {
  constructor(private readonly min: number, private readonly max: number) {
    super();
    if (max < min) {
      throw new Error('Size: max should be >= than min');
    }
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class NotBlankValidator extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class BooleanValidator extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (typeof value === 'boolean') {
      return ctx.successPromise(value);
    }
    return ctx.failurePromise(defaultViolations.boolean(value, path), value);
  }
}

export class BooleanNormalizer extends Validator {
  constructor(public readonly truePattern: RegExp, public readonly falsePattern: RegExp) {
    super();
    Object.freeze(this.truePattern);
    Object.freeze(this.falsePattern);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export function isNumber(value: any) {
  return (typeof value === 'number' || value instanceof Number) && !Number.isNaN(value.valueOf());
}

export class NumberValidator extends Validator {
  constructor(public readonly format: NumberFormat) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value)) {
      return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
    }
    return this.validateFormat(value, path, ctx);
  }

  protected validateFormat(value: any, path: Path, ctx: ValidationContext) {
    switch (this.format) {
      case NumberFormat.integer:
        if (!Number.isInteger(value)) {
          return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
        }
        break;
    }
    return ctx.successPromise(value);
  }
}

export class NumberNormalizer extends NumberValidator {
  constructor(format: NumberFormat) {
    super(format);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (isNumber(value)) {
      return super.validateFormat(value, path, ctx);
    }
    if (isString(value)) {
      if (value.trim() === '') {
        return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
      }
      const nbr = Number(value);
      if (isNumber(nbr)) {
        return this.validateFormat(nbr, path, ctx);
      }
      return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
    }
    return ctx.failurePromise(defaultViolations.number(value, this.format, path), value);
  }
}

export class MinValidator extends Validator {
  constructor(public readonly min: number, public readonly inclusive: boolean) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class MaxValidator extends Validator {
  constructor(public readonly max: number, public readonly inclusive: boolean) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class EnumValidator extends Validator {
  constructor(public readonly enumType: object, public readonly name: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    const isValid = Object.values(this.enumType).includes(value);
    if (isValid) {
      return ctx.successPromise(value);
    }
    return ctx.failurePromise(defaultViolations.enum(this.name, value, path), value);
  }
}

export class AssertTrueValidator extends Validator {
  public fn: AssertTrue;

  constructor(fn: AssertTrue, public readonly type: string, public readonly path?: Path) {
    super();
    this.fn = fn;
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (!this.fn(value, path, ctx)) {
      return ctx.failurePromise(new Violation(this.path ? this.path.connectTo(path) : path, this.type), value);
    }
    return ctx.successPromise(value);
  }
}

export class HasValueValidator extends Validator {
  constructor(public readonly expectedValue: any) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (deepEqual(value, this.expectedValue)) {
      return ctx.successPromise(value);
    }
    return ctx.failurePromise(new HasValueViolation(path, this.expectedValue, value), value);
  }
}

export function maybeAllOfValidator(validatorOrArray: Validator | Validator[]): Validator {
  if (Array.isArray(validatorOrArray)) {
    if (validatorOrArray.length === 0) {
      return new AnyValidator();
    }
    if (validatorOrArray.length === 1) {
      return validatorOrArray[0];
    }
    return new AllOfValidator(validatorOrArray);
  }
  return validatorOrArray as Validator;
}

export class AllOfValidator extends Validator {
  public readonly validators: Validator[];

  constructor(validators: Validator[]) {
    super();
    this.validators = ([] as Validator[]).concat(validators);
    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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
          if (resultValue !== value) {
            if (convertedValue !== undefined && !deepEqual(resultValue, convertedValue)) {
              throw new Error('Conflicting conversions');
            }
            convertedValue = resultValue;
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

export class DateValidator extends Validator {
  constructor(public readonly dateType: string) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class PatternValidator extends Validator {
  public readonly regExp: RegExp;

  constructor(pattern: string | RegExp, flags?: string) {
    super();
    this.regExp = pattern instanceof RegExp ? pattern : new RegExp(pattern, flags);
    Object.freeze(this.regExp);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export class OptionalValidator extends Validator {
  private readonly validator: Validator;

  constructor(type: Validator, allOf: Validator[]) {
    super();
    if (allOf && allOf.length > 0) {
      this.validator = new NextValidator(type, maybeAllOfValidator(allOf));
    } else {
      this.validator = type;
    }
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.successPromise(value);
    }
    return this.validator.validatePath(value, path, ctx);
  }
}

export class RequiredValidator extends Validator {
  private readonly validator: Validator;

  constructor(type: Validator, allOf: Validator[]) {
    super();
    if (allOf && allOf.length > 0) {
      this.validator = new NextValidator(type, maybeAllOfValidator(allOf));
    } else {
      this.validator = type;
    }
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    return this.validator.validatePath(value, path, ctx);
  }
}

export class ValueMapper extends Validator {
  constructor(public readonly fn: MappingFn, public readonly error?: any) {
    super();
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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

export function isPromise(value: any) {
  return value && typeof value['then'] === 'function';
}

export class IgnoreValidator extends Validator {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return ctx.successPromise(undefined);
  }
}

const allowAllMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: new AnyValidator(),
});

const allowNoneMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: strictUnknownPropertyValidator,
});

export class JsonValidator extends Validator {
  private readonly validator: Validator;

  constructor(allOf: Validator[]) {
    super();
    this.validator = maybeAllOfValidator(allOf);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
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
