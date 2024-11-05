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
  VType,
} from './validators.js';
import { ObjectValidatorBuilder } from './objectValidatorBuilder.js';

const ignoreValidator = new IgnoreValidator(),
  anyValidator = new AnyValidator(),
  stringValidator = new StringValidator(),
  toStringValidator = new StringNormalizer(),
  nullOrUndefinedValidator = new IsNullOrUndefinedValidator(),
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

type CompositionParameters<Out, In, T1, T2, T3, T4, T5> = 
  [Validator<Out, In>] | 
  [Validator<T1, In>, Validator<Out, T1>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<Out, T2>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<Out, T3>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<T4, T3>, Validator<Out, T4>] |
  [Validator<T1, In>, Validator<T2, T1>, Validator<T3, T2>, Validator<T4, T3>, Validator<T5, T4>, Validator<Out, T5>];


export const V = {
  fn: <Out>(fn: ValidatorFn<Out>, type?: string) => new ValidatorFnWrapper<Out>(fn, type),

  map: <Out, In>(fn: MappingFn<Out, In>, error?: any) => new ValueMapper<Out, In>(fn, error),

  ignore: () => ignoreValidator,

  any: () => anyValidator,

  check: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => {
    if (validators.length > 1) {
      return new CheckValidator<In>(new CompositionValidator<Out, In>(validators))
    } else {
      return new CheckValidator<In>(validators[0]);
    }
  },

  optional: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => {
    if (validators.length > 1) {
      return new OptionalValidator<Out, In>(new CompositionValidator<Out, In>(validators))
    } else {
      return new OptionalValidator<Out, In>(validators[0] as Validator<Out, In>);
    }
  },

  required: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => {
    if (validators.length > 1) {
      return new RequiredValidator<Out, In>(new CompositionValidator<Out, In>(validators))
    } else {
      return new RequiredValidator<Out, In>(validators[0] as Validator<Out, In>);
    }
  },

  if: <Out>(fn: AssertTrue, validator: Validator<Out>) => new IfValidator<Out>([new Conditional<Out>(fn, validator)]),

  whenGroup: <Out>(group: GroupOrName, validator: Validator<Out>) => new WhenGroupValidator([new WhenGroup(group, validator)]),

  string: () => stringValidator,

  toString: () => toStringValidator,

  notNull: <T>() => new NotNullOrUndefinedValidator<T>(),

  nullOrUndefined: () => nullOrUndefinedValidator,

  notEmpty: <Out extends { length:  number }>() => new NotEmptyValidator<Out>(),

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

  object: <T, I = T>(model: ObjectModel<T, I>) => new ObjectValidator<T, I>(model),

  objectType: () => new ObjectValidatorBuilder(),

  toObject: (property: string) => new ObjectNormalizer(property),

  schema: (fn: (schema: SchemaValidator) => SchemaModel) => new SchemaValidator(fn),

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

  anyOf: <A extends Validator<any>, B extends Array<Validator<any>>>(...validators: [A, ...B]) => new AnyOfValidator<VType<A> | VType<B[any]>>(validators),

  oneOf: <A extends Validator<any>, B extends Array<Validator<any>>>(...validators: [A, ...B]) => new OneOfValidator<VType<A> | VType<B[any]>>(validators),

  compositionOf: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => new CompositionValidator<Out, In>(validators),

  date: () => dateValidator,

  enum: <T extends {[key: number]: string | number}>(enumType: T, name: string) => new EnumValidator(enumType, name),

  assertTrue: <In>(fn: AssertTrue<In>, type: string = 'AssertTrue', path?: Path) => new AssertTrueValidator<In>(fn, type, path),

  hasValue: <T>(expectedValue: T) => new HasValueValidator<T>(expectedValue),

  json: <T>(validator: Validator<T>) => new JsonValidator(validator),
};
Object.freeze(V);
