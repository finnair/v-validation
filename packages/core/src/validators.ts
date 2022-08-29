import deepEqual from 'deep-equal';
import { Path } from '@finnair/path';

const ROOT = Path.ROOT;

export interface ValidatorFn {
  (value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult>;
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
  constructor(public readonly options: ValidatorOptions) {}

  private readonly objects = new Map<any, any>();

  failure(violation: Violation | Violation[], value: any) {
    let violations: Violation[] = [];
    violations = violations.concat(violation);
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

export abstract class Validator {
  validateGroup(value: any, group: Group): Promise<ValidationResult> {
    return this.validate(value, { group });
  }

  validate(value: any, options?: ValidatorOptions): Promise<ValidationResult> {
    return this.validatePath(value, ROOT, new ValidationContext(options || {}));
  }

  abstract validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult>;

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
    includes.forEach(includedGroup => {
      if (isString(includedGroup)) {
        this.allIncluded[includedGroup as string] = true;
      } else {
        Object.keys((includedGroup as Group).allIncluded).forEach(includedName => (this.allIncluded[includedName] = true));
      }
    });
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
    this.groups[name] = new Group(
      name,
      includes.map(groupOrName => {
        if (isString(groupOrName)) {
          return this.get(groupOrName as string);
        }
        return groupOrName as Group;
      }),
    );
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
  let parentValidators: any = [];
  if (parents) {
    parentValidators = parentValidators.concat(parents);
  }
  return parentValidators.map((modelOrValidator: any) => {
    if (modelOrValidator instanceof ObjectValidator) {
      return modelOrValidator as ObjectValidator;
    }
    return new ObjectValidator(modelOrValidator as ObjectModel);
  });
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
  const validators: MapEntryModel[] = [];
  return validators.concat(additionalProperties as MapEntryModel | MapEntryModel[]).map(entryModel => new MapEntryValidator(entryModel));
}

export class ValidatorFnWrapper extends Validator {
  private readonly fn: ValidatorFn;

  constructor(fn: ValidatorFn, public readonly type?: string) {
    super();
    this.fn = fn;
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return this.fn(value, path, ctx);
  }
}

const lenientUnknownPropertyValidator = new ValidatorFnWrapper(async (value: any, path: Path, ctx: ValidationContext) =>
  ctx.failure(defaultViolations.unknownProperty(path), value),
);

const strictUnknownPropertyValidator = new ValidatorFnWrapper(async (value: any, path: Path, ctx: ValidationContext) =>
  ctx.failure(defaultViolations.unknownPropertyDenied(path), value),
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
  private readonly properties: Properties;

  private readonly localProperties: Properties;

  private readonly additionalProperties: MapEntryValidator[];

  public readonly parentValidators: ObjectValidator[];

  public readonly nextValidator: undefined | Validator;

  private readonly localNextValidator: undefined | Validator;

  constructor(public readonly model: ObjectModel) {
    super();
    let properties: Properties = {};
    let additionalProperties: MapEntryValidator[] = [];
    let inheritedThenValidators: Validator[] = [];

    this.parentValidators = getParentValidators(model.extends);
    this.parentValidators.forEach((parent: ObjectValidator) => {
      additionalProperties = additionalProperties.concat(parent.additionalProperties);
      properties = mergeProperties(parent.properties, properties);
      if (parent.nextValidator) {
        inheritedThenValidators = inheritedThenValidators.concat(parent.nextValidator);
      }
    });
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
  }

  withProperty(name: string, ...validator: Validator[]) {
    if (this.properties[name]) {
      throw new Error(`${name} is already defined`);
    }
    this.properties[name] = maybeAllOfValidator(validator);
    return this;
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return this.validateFilteredPath(value, path, ctx, _ => true);
  }

  async validateFilteredPath(value: any, path: Path, ctx: ValidationContext, filter: PropertyFilter): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (typeof value !== 'object') {
      return ctx.failure(defaultViolations.object(path), value);
    }
    const convertedObject: any = {};
    const cycleResult = ctx.registerObject(value, path, convertedObject);
    if (cycleResult) {
      return cycleResult;
    }

    let violations: Violation[] = [];
    const propertyResults: Promise<ValidationResult>[] = [];

    for (const key in this.properties) {
      propertyResults.push(validateProperty(key, value[key], this.properties[key]));
    }
    for (const key in this.localProperties) {
      propertyResults.push(validateProperty(key, value[key], this.localProperties[key]));
    }
    for (const key in value) {
      if (!this.properties[key] && !this.localProperties[key]) {
        propertyResults.push(validateAdditionalProperty(key, value[key], this.additionalProperties));
      }
    }

    let validationChain = Promise.all(propertyResults).then(_ => {
      if (violations.length === 0) {
        return ctx.success(convertedObject);
      }
      return ctx.failure(violations, convertedObject);
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

    function validateProperty(key: string, currentValue: any, validator: Validator) {
      if (!filter(key)) {
        return Promise.resolve(ctx.success(undefined));
      }
      // Assign for property order
      convertedObject[key] = undefined;
      return validator.validatePath(currentValue, path.property(key), ctx).then(result => {
        if (result.isSuccess()) {
          const newValue = result.getValue();
          if (newValue !== undefined) {
            convertedObject[key] = newValue;
          } else {
            delete convertedObject[key];
          }
        } else {
          delete convertedObject[key];
          violations = violations.concat(result.getViolations());
        }
        return result;
      });
    }

    async function validateAdditionalProperty(key: string, originalValue: any, additionalProperties: MapEntryValidator[]): Promise<any> {
      const keyPath = path.property(key);
      let currentValue = originalValue;
      let validKey = false;
      let result: undefined | ValidationResult;
      for (const entryValidator of additionalProperties) {
        result = await entryValidator.keyValidator.validatePath(key, keyPath, ctx);
        if (result.isSuccess()) {
          validKey = true;
          result = await validateProperty(key, currentValue, entryValidator.valueValidator);
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
          violations = violations.concat(result!.getViolations());
        } else {
          return validateProperty(key, originalValue, lenientUnknownPropertyValidator);
        }
      }
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
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (value === undefined) {
      return ctx.success(undefined);
    }
    if (typeof value !== 'object' || value === null) {
      const object: any = {};
      object[this.property] = value;
      return ctx.success(object);
    }
    return ctx.success(value);
  }
}

export class MapEntryValidator {
  public readonly keyValidator: Validator;

  public readonly valueValidator: Validator;

  constructor(entryModel: MapEntryModel) {
    this.keyValidator = maybeAllOfValidator(entryModel.keys);
    this.valueValidator = maybeAllOfValidator(entryModel.values);
  }
}

export class ArrayValidator extends Validator {
  constructor(public readonly items: Validator) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (!Array.isArray(value)) {
      return ctx.failure(new TypeMismatch(path, 'array', value), value);
    }
    const convertedArray: Array<any> = [];
    const cycleResult = ctx.registerObject(value, path, convertedArray);
    if (cycleResult) {
      return cycleResult;
    }

    const array = value as Array<any>;
    let violations: Violation[] = [];
    const promises = array.map((value: any, i: number) =>
      this.items.validatePath(value, path.index(i), ctx).then(result => {
        if (result.isSuccess()) {
          convertedArray[i] = result.getValue();
        } else {
          violations = violations.concat(result.getViolations());
        }
        return result;
      }),
    );

    return Promise.all(promises).then(_ => {
      if (violations.length == 0) {
        return ctx.success(convertedArray);
      }
      return ctx.failure(violations, value);
    });
  }
}

export class ArrayNormalizer extends ArrayValidator {
  constructor(items: Validator) {
    super(items);
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
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
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return this.firstValidator.validatePath(value, path, ctx).then(firstResult => {
      if (firstResult.isSuccess()) {
        return this.nextValidator.validatePath(firstResult.getValue(), path, ctx).then(nextResult => {
          if (nextResult.isSuccess()) {
            return nextResult;
          }
          return nextResult;
        });
      }
      return firstResult;
    });
  }
}

export class CheckValidator extends Validator {
  constructor(public readonly validator: Validator) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return this.validator.validatePath(value, path, ctx).then(result => {
      if (result.isSuccess()) {
        return ctx.success(value);
      }
      return result;
    });
  }
}

export class CompositionValidator extends Validator {
  public readonly validators: Validator[];

  constructor(validators: Validator[]) {
    super();
    this.validators = [];
    this.validators = this.validators.concat(validators);
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    const validators = this.validators;
    return validateNext(value, 0);

    async function validateNext(currentValue: any, i: number): Promise<ValidationResult> {
      if (i < validators.length) {
        return validators[i].validatePath(currentValue, path, ctx).then(result => {
          if (result.isSuccess()) {
            return validateNext(result.getValue(), i + 1);
          }
          return result;
        });
      }
      return ctx.success(currentValue);
    }
  }
}

export class OneOfValidator extends Validator {
  constructor(public readonly validators: Validator[]) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    let matches = 0;
    let newValue: any = null;
    return Promise.all(validateAll(this.validators)).then(_ => {
      if (matches === 1) {
        return ctx.success(newValue);
      }
      return ctx.failure(defaultViolations.oneOf(matches, path), value);
    });

    function validateAll(validators: Validator[]) {
      return validators.map(validator => {
        return validator.validatePath(value, path, ctx).then(result => {
          if (result.isSuccess()) {
            matches++;
            newValue = result.getValue();
          }
          return result;
        });
      });
    }
  }
}

export class AnyOfValidator extends Validator {
  constructor(public readonly validators: Validator[]) {
    super();
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    const passes: ValidationResult[] = [];
    const failures: Violation[] = [];

    const validateAll = async (validators: Validator[]): Promise<void> => {
      for (const validator of validators) {
        const result = await validator.validatePath(value, path, ctx);
        result.isSuccess() ? passes.push(result.getValue()) : failures.push(...result.getViolations());
      }
    };

    await validateAll(this.validators);
    return passes.length > 0 ? ctx.success(passes.pop()) : ctx.failure(failures, value);
  }
}

export class IfValidator extends Validator {
  constructor(public readonly conditionals: Conditional[], public readonly elseValidator?: Validator) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    for (let i = 0; i < this.conditionals.length; i++) {
      const conditional = this.conditionals[i];
      if (conditional.fn(value, path, ctx)) {
        return conditional.validator.validatePath(value, path, ctx);
      }
    }
    if (this.elseValidator) {
      return this.elseValidator.validatePath(value, path, ctx);
    }
    return ctx.success(value);
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
  }
}

export class WhenGroupValidator extends Validator {
  constructor(public readonly whenGroups: WhenGroup[], public readonly otherwiseValidator?: Validator) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
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
    return ctx.success(value);
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
  }
}

export class MapValidator extends Validator {
  constructor(public readonly keys: Validator, public readonly values: Validator, public readonly jsonSafeMap: boolean) {
    super();
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (!(value instanceof Map)) {
      return ctx.failure(new TypeMismatch(path, 'Map'), value);
    }
    const map: Map<any, any> = value as Map<any, any>;
    const convertedMap: Map<any, any> = this.jsonSafeMap ? new JsonMap() : new Map<any, any>();
    const promises: Promise<void>[] = [];
    let violations: Violation[] = [];
    let i = 0;
    map.forEach((value: any, key: any) => {
      const entryPath = path.index(i++);
      // TODO: Refactor key path as index(0)
      const keyPromise = this.keys.validatePath(key, entryPath.property('key'), ctx);
      // TODO: Refactor value path as index(1)
      const valuePromise = this.values.validatePath(value, entryPath.property('value'), ctx);
      promises.push(
        Promise.all([keyPromise, valuePromise]).then(results => {
          const keyResult = results[0] as ValidationResult;
          const valueResult = results[1] as ValidationResult;
          const keySuccess = handleResult(keyResult);
          const valueSuccess = handleResult(valueResult);
          if (keySuccess && valueSuccess) {
            convertedMap.set(keyResult.getValue(), valueResult.getValue());
          }
        }),
      );
    });

    return Promise.all(promises).then(_ => {
      if (violations.length > 0) {
        return ctx.failure(violations, value);
      }
      return ctx.success(convertedMap);
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
  constructor(public readonly keys: Validator, public readonly values: Validator) {
    super(keys, values, true);
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
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
        return ctx.failure(violations, value);
      }
      return super.validatePath(map, path, ctx);
    }
    return ctx.failure(new TypeMismatch(path, 'Map OR array of [key, value] arrays'), value);
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

export class AnyValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return ctx.success(value);
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
  constructor() {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (isString(value)) {
      return ctx.success(value);
    }
    return ctx.failure(defaultViolations.string(value, path), value);
  }
}

export class StringNormalizer extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (isString(value)) {
      return ctx.success(value);
    }
    if (isSimplePrimitive(value)) {
      return ctx.success(String(value));
    }
    return ctx.failure(new TypeMismatch(path, 'primitive value', value), value);
  }
}

export class NotNullOrUndefinedValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return isNullOrUndefined(value) ? ctx.failure(defaultViolations.notNull(path), value) : ctx.success(value);
  }
}

export class IsNullOrUndefinedValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return isNullOrUndefined(value) ? ctx.success(value) : ctx.failure(new TypeMismatch(path, 'NullOrUndefined', value), value);
  }
}

export class NotEmptyValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return !isNullOrUndefined(value) && isNumber(value.length) && value.length > 0 ? ctx.success(value) : ctx.failure(defaultViolations.notEmpty(path), value);
  }
}

export class SizeValidator extends Validator {
  constructor(public readonly min: number, public readonly max: number) {
    super();
    if (max < min) {
      throw new Error('Size: max should be >= than min');
    }
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value.length)) {
      return ctx.failure(new TypeMismatch(path, 'value with numeric length field'), value);
    }
    if (value.length < this.min || value.length > this.max) {
      return ctx.failure(defaultViolations.size(this.min, this.max, path), value);
    }
    return ctx.success(value);
  }
}

export class NotBlankValidator extends Validator {
  constructor() {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notBlank(path), value);
    }
    if (!isString(value)) {
      return ctx.failure(defaultViolations.string(value, path), value);
    }
    const trimmed = (value as String).trim();
    if (trimmed === '') {
      return ctx.failure(defaultViolations.notBlank(path), value);
    }
    return ctx.success(value);
  }
}

export class BooleanValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (typeof value === 'boolean') {
      return ctx.success(value);
    }
    return ctx.failure(defaultViolations.boolean(value, path), value);
  }
}

export class BooleanNormalizer extends Validator {
  constructor(public readonly truePattern: RegExp, public readonly falsePattern: RegExp) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (typeof value === 'boolean') {
      return ctx.success(value);
    }
    if (value instanceof Boolean) {
      return ctx.success(value.valueOf());
    }
    if (isString(value)) {
      if (this.truePattern.test(value)) {
        return ctx.success(true);
      }
      if (this.falsePattern.test(value)) {
        return ctx.success(false);
      }
      return ctx.failure(defaultViolations.boolean(value, path), value);
    } else if (isNumber(value)) {
      return ctx.success(!!value);
    }
    return ctx.failure(defaultViolations.boolean(value, path), value);
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
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value)) {
      return ctx.failure(defaultViolations.number(value, this.format, path), value);
    }
    return this.validateFormat(value, path, ctx);
  }
  protected async validateFormat(value: any, path: Path, ctx: ValidationContext) {
    switch (this.format) {
      case NumberFormat.integer:
        if (!Number.isInteger(value)) {
          return ctx.failure(defaultViolations.number(value, this.format, path), value);
        }
        break;
    }
    return ctx.success(value);
  }
}

export class NumberNormalizer extends NumberValidator {
  constructor(format: NumberFormat) {
    super(format);
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (isNumber(value)) {
      return super.validateFormat(value, path, ctx);
    }
    if (isString(value)) {
      if (value.trim() === '') {
        return ctx.failure(defaultViolations.number(value, this.format, path), value);
      }
      const nbr = Number(value);
      if (isNumber(nbr)) {
        return this.validateFormat(nbr, path, ctx);
      }
      return ctx.failure(defaultViolations.number(value, this.format, path), value);
    }
    return ctx.failure(defaultViolations.number(value, this.format, path), value);
  }
}

export class MinValidator extends Validator {
  constructor(public readonly min: number, public readonly inclusive: boolean) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value)) {
      return ctx.failure(defaultViolations.number(value, NumberFormat.number, path), value);
    }
    if (this.inclusive) {
      if (value < this.min) {
        return ctx.failure(defaultViolations.min(this.min, this.inclusive, value, path), value);
      }
    } else if (value <= this.min) {
      return ctx.failure(defaultViolations.min(this.min, this.inclusive, value, path), value);
    }
    return ctx.success(value);
  }
}

export class MaxValidator extends Validator {
  constructor(public readonly max: number, public readonly inclusive: boolean) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (!isNumber(value)) {
      return ctx.failure(defaultViolations.number(value, NumberFormat.number, path), value);
    }
    if (this.inclusive) {
      if (value > this.max) {
        return ctx.failure(defaultViolations.max(this.max, this.inclusive, value, path), value);
      }
    } else if (value >= this.max) {
      return ctx.failure(defaultViolations.max(this.max, this.inclusive, value, path), value);
    }
    return ctx.success(value);
  }
}

export class EnumValidator extends Validator {
  constructor(public readonly enumType: object, public readonly name: string) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    const isValid = Object.values(this.enumType).includes(value);
    if (isValid) {
      return ctx.success(value);
    }
    return ctx.failure(defaultViolations.enum(this.name, value, path), value);
  }
}

export class AssertTrueValidator extends Validator {
  private fn: AssertTrue;

  constructor(fn: AssertTrue, public readonly type: string, public readonly path?: Path) {
    super();
    this.fn = fn;
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (!this.fn(value, path, ctx)) {
      return ctx.failure(new Violation(this.path ? this.path.connectTo(path) : path, this.type), value);
    }
    return ctx.success(value);
  }
}

export class HasValueValidator extends Validator {
  constructor(public readonly expectedValue: any) {
    super();
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (deepEqual(value, this.expectedValue)) {
      return ctx.success(value);
    }
    return ctx.failure(new HasValueViolation(path, this.expectedValue, value), value);
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
    this.validators = [];
    this.validators = this.validators.concat(validators);
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    let violations: Violation[] = [];
    let convertedValue: any;
    return Promise.all(validateAll(this.validators)).then(_ => {
      if (violations.length == 0) {
        return ctx.success(convertedValue !== undefined ? convertedValue : value);
      }
      return ctx.failure(violations, value);
    });

    function validateAll(validators: Validator[]) {
      return validators.map(validator => {
        return validator.validatePath(value, path, ctx).then(result => {
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
      });
    }
  }
}

export class DateValidator extends Validator {
  constructor(public readonly dateType: string) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    let dateValue: any;
    if (isString(value) || isNumber(value)) {
      dateValue = new Date(value);
    } else {
      dateValue = value;
    }
    if (dateValue instanceof Date) {
      if (isNaN((dateValue as Date).getTime())) {
        return ctx.failure(defaultViolations.date(value, path), value);
      }
      return ctx.success(dateValue);
    }
    return ctx.failure(defaultViolations.date(value, path, this.dateType), value);
  }
}

export class PatternValidator extends Validator {
  private readonly regExp: RegExp;

  constructor(pattern: string | RegExp, flags?: string) {
    super();
    this.regExp = pattern instanceof RegExp ? pattern : new RegExp(pattern, flags);
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (!isString(value)) {
      return ctx.failure(defaultViolations.string(value, path), value);
    }
    if (this.regExp.test(value)) {
      return ctx.success(value);
    }
    return ctx.failure(defaultViolations.pattern(this.regExp, value, path), value);
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
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (isString(value)) {
      return super.validatePath(value, path, ctx);
    }
    if (isSimplePrimitive(value)) {
      return super.validatePath(String(value), path, ctx);
    }
    return ctx.failure(new TypeMismatch(path, 'primitive value', value), value);
  }
}

export class OptionalValidator extends Validator {
  public readonly validator: Validator;

  constructor(type: Validator, allOf: Validator[]) {
    super();
    if (allOf && allOf.length > 0) {
      this.validator = new NextValidator(type, maybeAllOfValidator(allOf));
    } else {
      this.validator = type;
    }
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.success(value);
    }
    return this.validator.validatePath(value, path, ctx);
  }
}

export class ValueMapper extends Validator {
  constructor(public readonly fn: MappingFn, public readonly error?: any) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    try {
      const maybePromise = this.fn(value, path, ctx);
      return isPromise(maybePromise)
        ? await (maybePromise as Promise<any>).then(result => this.handleResult(result, value, ctx))
        : this.handleResult(maybePromise, value, ctx);
    } catch (error) {
      if (error instanceof ValidationError) {
        return ctx.failure(error.violations, value);
      }
      return ctx.failure(new ErrorViolation(path, this.error || error), value);
    }
  }

  private handleResult(result: any, value: any, ctx: ValidationContext) {
    if (result instanceof Violation) {
      return ctx.failure(result as Violation, value);
    }
    return ctx.success(result);
  }
}

export function isPromise(value: any) {
  return value && typeof value['then'] === 'function';
}

export class IgnoreValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    return ctx.success(undefined);
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
  public readonly validator: Validator;

  constructor(allOf: Validator[]) {
    super();
    this.validator = maybeAllOfValidator(allOf);
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (!isString(value)) {
      return ctx.failure(defaultViolations.string(value, path), value);
    }
    try {
      const parsedValue = JSON.parse(value);
      return this.validator.validatePath(parsedValue, path, ctx);
    } catch (e) {
      return ctx.failure(new TypeMismatch(path, 'JSON', value), value);
    }
  }
}
