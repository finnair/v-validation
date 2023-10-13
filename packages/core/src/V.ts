import { default as validateUuid } from 'uuid-validate';
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
  maybeAllOfValidator,
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
} from './validators.js';

const ignoreValidator = new IgnoreValidator(),
  anyValidator = new AnyValidator(),
  stringValidator = new StringValidator(),
  toStringValidator = new StringNormalizer(),
  notNullValidator = new NotNullOrUndefinedValidator(),
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
  fn: (fn: ValidatorFn, type?: string) => new ValidatorFnWrapper(fn, type),

  map: (fn: MappingFn, error?: any) => new ValueMapper(fn, error),

  ignore: () => ignoreValidator,

  any: () => anyValidator,

  check: (...allOf: Validator[]) => new CheckValidator(maybeAllOfValidator(allOf)),

  optional: (type: Validator, ...allOf: Validator[]) => new OptionalValidator(type, allOf),

  required: (type: Validator, ...allOf: Validator[]) => new RequiredValidator(type, allOf),

  if: (fn: AssertTrue, ...allOf: Validator[]) => new IfValidator([new Conditional(fn, allOf)]),

  whenGroup: (group: GroupOrName, ...allOf: Validator[]) => new WhenGroupValidator([new WhenGroup(group, allOf)]),

  string: () => stringValidator,

  toString: () => toStringValidator,

  notNull: () => notNullValidator,

  nullOrUndefined: () => nullOrUndefinedValidator,

  notEmpty: () => notEmptyValidator,

  notBlank: () => notBlankValidator,

  emptyToNull: () => emptyToNullValidator,

  emptyToUndefined: () => emptyToUndefinedValidator,

  undefinedToNull: () => undefinedToNullValidator,

  emptyTo: (defaultValue: any) => new ValueMapper((value: any) => (isNullOrUndefined(value) || value === '' ? defaultValue : value)),

  uuid: (version?: number) => new AssertTrueValidator((value: any) => !isNullOrUndefined(value) && validateUuid(value, version), 'UUID'),

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

  object: (model: ObjectModel) => new ObjectValidator(model),

  toObject: (property: string) => new ObjectNormalizer(property),

  schema: (fn: (schema: SchemaValidator) => SchemaModel) => new SchemaValidator(fn),

  /** WARN: Objects as Map keys use identity hash/equals, i.e. === */
  mapType: (keys: Validator, values: Validator, jsonSafeMap: boolean = true) => new MapValidator(keys, values, jsonSafeMap),

  /** WARN: Objects as Map keys use identity hash/equals, i.e. === */
  toMapType: (keys: Validator, values: Validator) => new MapNormalizer(keys, values),

  nullTo: (defaultValue: string | number | bigint | boolean | symbol) => new ValueMapper(value => (isNullOrUndefined(value) ? defaultValue : value)),

  nullToObject: () => new ValueMapper((value: any) => (isNullOrUndefined(value) ? {} : value)),

  nullToArray: () => new ValueMapper((value: any) => (isNullOrUndefined(value) ? [] : value)),

  array: (...items: Validator[]) => new ArrayValidator(maybeAllOfValidator(items)),

  toArray: (...items: Validator[]) => new ArrayNormalizer(maybeAllOfValidator(items)),

  size: (min: number, max: number) => new SizeValidator(min, max),

  properties: (keys: Validator | Validator[], values: Validator | Validator[]) => new ObjectValidator({ additionalProperties: { keys, values } }),

  allOf: (...validators: Validator[]) => new AllOfValidator(validators),

  anyOf: (...validators: Validator[]) => new AnyOfValidator(validators),

  oneOf: (...validators: Validator[]) => new OneOfValidator(validators),

  compositionOf: (...validators: Validator[]) => new CompositionValidator(validators),

  date: () => dateValidator,

  enum: (enumType: object, name: string) => new EnumValidator(enumType, name),

  assertTrue: (fn: AssertTrue, type: string = 'AssertTrue', path?: Path) => new AssertTrueValidator(fn, type, path),

  hasValue: (expectedValue: any) => new HasValueValidator(expectedValue),

  json: (...validators: Validator[]) => new JsonValidator(validators),
};
Object.freeze(V);
