import { SchemaValidator, SchemaModel } from './schema.js';
import { Path } from '@finnair/path';
import {
  IgnoreValidator,
  ArrayNormalizer,
  AnyValidator,
  StringValidator,
  StringNormalizer,
  NotNullOrUndefinedValidator,
  IsNullOrUndefinedValidator,
  NotEmptyValidator,
  NotBlankValidator,
  ValueMapper,
  isNullOrUndefined,
  BooleanValidator,
  NumberValidator,
  NumberFormat,
  NumberNormalizer,
  DateValidator,
  ValidatorType,
  ValidatorFn,
  ValidatorFnWrapper,
  MappingFn,
  Validator,
  CheckValidator,
  OptionalValidator,
  AssertTrue,
  IfValidator,
  Conditional,
  GroupOrName,
  WhenGroupValidator,
  WhenGroup,
  AssertTrueValidator,
  PatternValidator,
  PatternNormalizer,
  BooleanNormalizer,
  MinValidator,
  MaxValidator,
  ObjectModel,
  ObjectValidator,
  ObjectNormalizer,
  MapValidator,
  MapNormalizer,
  ArrayValidator,
  SizeValidator,
  AllOfValidator,
  AnyOfValidator,
  OneOfValidator,
  CompositionValidator,
  EnumValidator,
  HasValueValidator,
  JsonValidator,
  RequiredValidator,
  SetValidator,
  UuidValidator,
} from './validators.js';

const ignoreValidator = new IgnoreValidator(),
  anyValidator = new AnyValidator(),
  stringValidator = new StringValidator(),
  toStringValidator = new StringNormalizer(),
  nullOrUndefinedValidator = new IsNullOrUndefinedValidator(),
  notEmptyValidator = new NotEmptyValidator(),
  notBlankValidator = new NotBlankValidator(),
  emptyToNullValidator = new ValueMapper((value: any) => (isNullOrUndefined(value) || value === '' ? null : value)),
  emptyToUndefinedValidator = new ValueMapper((value: any) => (isNullOrUndefined(value) || value === '' ? undefined : value)),
  undefinedToNullValidator = new ValueMapper((value: any) => (value === undefined ? null : value)),
  booleanValidator = new BooleanValidator(),
  numberValidator = new NumberValidator(NumberFormat.number),
  toNumberValidator = new NumberNormalizer(NumberFormat.number),
  integerValidator = new NumberValidator(NumberFormat.integer),
  toIntegerValidator = new NumberNormalizer(NumberFormat.integer),
  dateValidator = new DateValidator(ValidatorType.Date);

export const V = {
  fn: <T>(fn: ValidatorFn<T>, type?: string) => new ValidatorFnWrapper<T>(fn, type),

  map: <T>(fn: MappingFn<T>, error?: any) => new ValueMapper<T>(fn, error),

  ignore: () => ignoreValidator,

  any: () => anyValidator,

  check: <T>(...validators: [...Validator<unknown>[], Validator<T>]) => {
    if (validators.length === 1) {
      return new CheckValidator<T>(validators[0] as Validator<T>);
    } else {
      return new CheckValidator<T>(new CompositionValidator<T>(validators))
    }
  },

  optional: <T>(...validators: [...Validator<unknown>[], Validator<T>]) => {
    if (validators.length === 1) {
      return new OptionalValidator<T>(validators[0] as Validator<T>);
    } else {
      return new OptionalValidator<T>(new CompositionValidator<T>(validators))
    }
  },

  required: <T>(...validators: [...Validator<unknown>[], Validator<T>]) => {
    if (validators.length === 1) {
      return new RequiredValidator<T>(validators[0] as Validator<T>);
    } else {
      return new RequiredValidator<T>(new CompositionValidator<T>(validators))
    }
  },

  if: <T>(fn: AssertTrue, validator: Validator<T>) => new IfValidator<T>([new Conditional<T>(fn, validator)]),

  whenGroup: <T>(group: GroupOrName, validator: Validator<T>) => new WhenGroupValidator([new WhenGroup(group, validator)]),

  string: () => stringValidator,

  toString: () => toStringValidator,

  notNull: <T>() => new NotNullOrUndefinedValidator<T>(),

  nullOrUndefined: () => nullOrUndefinedValidator,

  notEmpty: () => notEmptyValidator,

  notBlank: () => notBlankValidator,

  emptyToNull: () => emptyToNullValidator,

  emptyToUndefined: () => emptyToUndefinedValidator,

  undefinedToNull: () => undefinedToNullValidator,

  emptyTo: <T extends { length: number }>(defaultValue: T) => new ValueMapper<T>((value: T) => (isNullOrUndefined(value) || value.length === 0 ? defaultValue : value)),

  uuid: (version?: number) => new UuidValidator(version),

  pattern: (pattern: string | RegExp, flags?: string) => new PatternValidator(pattern, flags),

  toPattern: (pattern: string | RegExp, flags?: string) => new PatternNormalizer(pattern, flags),

  boolean: () => booleanValidator,

  toBoolean: (truePattern: RegExp = /^true$/, falsePattern: RegExp = /^false$/) => new BooleanNormalizer(truePattern, falsePattern),

  number: () => numberValidator,

  toNumber: () => toNumberValidator,

  integer: () => integerValidator,

  toInteger: () => toIntegerValidator,

  min: (min: number, inclusive = true) => new MinValidator(min, inclusive),

  max: (max: number, inclusive = true) => new MaxValidator(max, inclusive),

  object: <T>(model: ObjectModel) => new ObjectValidator<T>(model),

  toObject: (property: string) => new ObjectNormalizer(property),

  schema: <T>(fn: (schema: SchemaValidator<T>) => SchemaModel) => new SchemaValidator<T>(fn),

  /** WARN: Objects as Map keys use identity hash/equals, i.e. === */
  mapType: (keys: Validator, values: Validator, jsonSafeMap: boolean = true) => new MapValidator(keys, values, jsonSafeMap),

  /** WARN: Objects as Map keys use identity hash/equals, i.e. === */
  toMapType: (keys: Validator, values: Validator) => new MapNormalizer(keys, values),

  setType: (values: Validator, jsonSafeSet: boolean = true) => new SetValidator(values, jsonSafeSet),

  nullTo: (defaultValue: string | number | bigint | boolean | symbol) => new ValueMapper(value => (isNullOrUndefined(value) ? defaultValue : value)),

  nullToObject: () => new ValueMapper((value: any) => (isNullOrUndefined(value) ? {} : value)),

  nullToArray: () => new ValueMapper((value: any) => (isNullOrUndefined(value) ? [] : value)),

  array: <T>(items: Validator<T>) => new ArrayValidator<T>(items),

  toArray: <T>(items: Validator<T>) => new ArrayNormalizer<T>(items),

  size: <T extends { length: number }>(min: number, max: number) => new SizeValidator<T>(min, max),

  properties: (keys: Validator, values: Validator) => new ObjectValidator({ additionalProperties: { keys, values } }),

  allOf: (...validators: [Validator, ...Validator[]]) => new AllOfValidator(validators),

  anyOf: (...validators: [Validator, ...Validator[]]) => new AnyOfValidator(validators),

  oneOf: (...validators: [Validator, ...Validator[]]) => new OneOfValidator(validators),

  compositionOf: <T>(...validators: [...Validator<any>[], Validator<T>]) => new CompositionValidator<T>(validators),

  date: () => dateValidator,

  enum: <T extends {[key: number]: string | number}>(enumType: T, name: string) => new EnumValidator(enumType, name),

  assertTrue: <T>(fn: AssertTrue<T>, type: string = 'AssertTrue', path?: Path) => new AssertTrueValidator<T>(fn, type, path),

  hasValue: <T>(expectedValue: T) => new HasValueValidator(expectedValue),

  json: <T>(validator: Validator<T>) => new JsonValidator(validator),
};
Object.freeze(V);
