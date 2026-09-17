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
  MapValidator,
  MapNormalizer,
  ArrayValidator,
  SizeValidator,
  AllOfValidator,
  AnyOfValidator,
  OneOfValidator,
  EnumValidator,
  FreezeValidator,
  HasValueValidator,
  JsonValidator,
  RequiredValidator,
  SetValidator,
  UuidValidator,
  VType,
  maybeCompositionOf,
  CompositionParameters,
  OptionalUndefinedValidator,
  NullableValidator,
  JsonBigIntValidator,
  UnknownValidator,
} from './validators.js';
import {ObjectModel, ObjectValidator, ObjectNormalizer } from './objectValidator.js';
import { ObjectValidatorBuilder } from './objectValidatorBuilder.js';
import { MemoizeValidator, MemoizeValidatorOptions } from './memoizeValidator.js';
import { ProxyValidator, ProxyValidatorFactory } from './proxyValidator.js';

interface AllOfParameters {
  <In, Out1, Out2>(v1: Validator<Out1, In>, v2: Validator<Out2, In>): Validator<Out1 & Out2, In>;
  <In, Out1, Out2, Out3>(v1: Validator<Out1, In>, v2: Validator<Out2, In>, v3: Validator<Out3, In>): Validator<Out1 & Out2 & Out3, In>;
  <In, Out1, Out2, Out3, Out4>(v1: Validator<Out1, In>, v2: Validator<Out2, In>, v3: Validator<Out3, In>, v4: Validator<Out4, In>): Validator<Out1 & Out2 & Out3 & Out4, In>;
  <In, Out1, Out2, Out3, Out4, Out5>(v1: Validator<Out1, In>, v2: Validator<Out2, In>, v3: Validator<Out3, In>, v4: Validator<Out4, In>, v5: Validator<Out5, In>): Validator<Out1 & Out2 & Out3 & Out4 & Out5, In>;
}

const AllOfConstructor: AllOfParameters = (...validators: [Validator<any, any>, ...Validator<any, any>[]]) => new AllOfValidator<any, any>(validators);

const ignoreValidator = new IgnoreValidator(),
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
  jsonBigIntValidator = new JsonBigIntValidator(),
  toIntegerValidator = new NumberNormalizer(NumberFormat.integer),
  dateValidator = new DateValidator(ValidatorType.Date);

export const V = {
  /**
   * @param supportsFreeze Assert that `fn` cannot return a value that `V.frozen` would fail to
   * freeze - it returns a primitive, or a value it has frozen itself. Defaults to `false`, which
   * makes `V.frozen` reject a schema containing this validator.
   */
  fn: <Out, In>(fn: ValidatorFn<Out, In>, supportsFreeze?: boolean) => new ValidatorFnWrapper<Out, In>(fn, supportsFreeze),

  /** @param supportsFreeze See {@link V.fn}. */
  map: <Out, In>(fn: MappingFn<Out, In>, error?: any, supportsFreeze?: boolean) => new ValueMapper<Out, In>(fn, error, supportsFreeze),

  ignore: () => ignoreValidator,

  any: <InOut = any>() => new AnyValidator<InOut>(),

  unknown: <InOut = unknown>() => new UnknownValidator<InOut>(),

  check: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new CheckValidator<In>(maybeCompositionOf(...validators)),

  /**
   * Allows only undefined, null or valid value. 
   */
  optional: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new OptionalValidator<Out, In>(maybeCompositionOf(...validators)),
    
  /**
   * Allows only undefined or valid value. 
   */
  optionalStrict: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new OptionalUndefinedValidator<Out, In>(maybeCompositionOf(...validators)),

  /**
   * Allows only null or valid value. 
   */
  nullable: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new NullableValidator<Out, In>(maybeCompositionOf(...validators)),

  required: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new RequiredValidator<Out, In>(maybeCompositionOf(...validators)),

  if: <Out, In, T1, T2, T3, T4, T5>(fn: AssertTrue, ...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new IfValidator<Out, In>([new Conditional<Out>(fn, maybeCompositionOf(...validators))]),

  whenGroup: <Out, In, T1, T2, T3, T4, T5>(group: GroupOrName, ...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new WhenGroupValidator([new WhenGroup(group, maybeCompositionOf(...validators))]),

  string: () => stringValidator,

  toString: () => toStringValidator,

  notNull: <T>() => new NotNullOrUndefinedValidator<T>(),

  nullOrUndefined: () => nullOrUndefinedValidator,

  notEmpty: <Out extends { length:  number }>() => new NotEmptyValidator<Out>(),

  notBlank: () => notBlankValidator,

  emptyToNull: () => emptyToNullValidator,

  emptyToUndefined: () => emptyToUndefinedValidator,

  undefinedToNull: () => undefinedToNullValidator,

  emptyTo: <In extends { length: number }, Default = In>(defaultValue: Default) => 
    new ValueMapper<In | Default, In | null | undefined>((value: In | null | undefined) => (isNullOrUndefined(value) || value.length === 0 ? defaultValue : value)),

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

  jsonBigInt: () => jsonBigIntValidator,

  /** Use `V.objectType()` instead for typed validators. */
  object: <T, I = T>(model: ObjectModel<T, I>) => new ObjectValidator<T, I>(model),

  objectType: () => new ObjectValidatorBuilder(),

  toObject: (property: string) => new ObjectNormalizer(property),

  schema: (fn: (schema: SchemaValidator) => SchemaModel) => new SchemaValidator(fn),

  /** WARN: Objects as Map keys use identity hash/equals, i.e. === */
  mapType: <K, V, E extends boolean>(keys: Validator<K>, values: Validator<V>, jsonSafeMap: E) => new MapValidator<K, V, E>(keys, values, jsonSafeMap),

  /** WARN: Objects as Map keys use identity hash/equals, i.e. === */
  toMapType: <K, V, E extends boolean>(keys: Validator<K>, values: Validator<V>, jsonSafeMap: E) => new MapNormalizer<K, V, E>(keys, values, jsonSafeMap),

  setType: <T, E extends boolean>(values: Validator<T>, jsonSafeSet: E) => new SetValidator<T, E>(values, jsonSafeSet),

  nullTo: <Out extends string | number | bigint | boolean | symbol, In = unknown>(defaultValue: Out) => 
    new ValueMapper<Out | In, In>((value: In) => (isNullOrUndefined(value) ? defaultValue : value)),

  nullToObject: <In>() => new ValueMapper<{} | In, In>(value => (isNullOrUndefined(value) ? {} : value)),

  nullToArray: <In>() => new ValueMapper<[] | In, In>(value => (isNullOrUndefined(value) ? [] : value)),

  array: <Out, In, T1, T2, T3, T4, T5>(...items: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new ArrayValidator<Out>(maybeCompositionOf(...items)),

  toArray: <Out, In, T1, T2, T3, T4, T5>(...items: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    new ArrayNormalizer<Out>(maybeCompositionOf(...items)),

  size: <T extends { length: number }>(min: number, max: number) => new SizeValidator<T>(min, max),

  properties: <Key extends keyof any, Value>(keys: Validator<Key>, values: Validator<Value>) => 
    new ObjectValidator<Record<Key, Value>>({ additionalProperties: { keys, values } }),

  optionalProperties: <Key extends keyof any, Value>(keys: Validator<Key>, values: Validator<Value>) => 
    new ObjectValidator<Partial<Record<Key, Value>>>({ additionalProperties: { keys, values } }),

  allOf: AllOfConstructor,

  anyOf: <V extends [Validator<any>, ...Validator<any>[]]>(...validators: V) => new AnyOfValidator<VType<V[any]>>(validators),

  oneOf: <V extends [Validator<any>, ...Validator<any>[]]>(...validators: V) => new OneOfValidator<VType<V[any]>>(validators),

  compositionOf: <Out, In, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, In, T1, T2, T3, T4, T5>) => 
    maybeCompositionOf(...validators),

  date: () => dateValidator,

  enum: <Out extends Record<string, string | number>>(enumType: Out, name: string) => new EnumValidator<Out>(enumType, name),

  /** @param supportsFreeze See {@link V.fn}; an assertion passes its input through unchanged. */
  assertTrue: <In>(fn: AssertTrue<In>, type: string = 'AssertTrue', path?: Path, supportsFreeze?: boolean) =>
    new AssertTrueValidator<In>(fn, type, path, supportsFreeze),

  /** @param supportsFreeze See {@link V.fn}; needed only when `expectedValue` is an object. */
  hasValue: <InOut>(expectedValue: InOut, supportsFreeze?: boolean) => new HasValueValidator<InOut>(expectedValue, supportsFreeze),

  json: <Out, T1, T2, T3, T4, T5>(...validators: CompositionParameters<Out, string, T1, T2, T3, T4, T5>) =>
    new JsonValidator(maybeCompositionOf(...validators)),

  /**
   * Defers validator construction to a factory, allowing a validator to reference itself - e.g. a
   * recursive tree type. The factory is called at most once, on first use, and its result is reused.
   *
   * NOTE: A proxy cannot report `skipUndefined` (see {@link ProxyValidator}), so wrap the proxy in
   * `V.optional`/`V.optionalStrict` rather than the other way around.
   *
   * @param factory A function that produces a `Validator` instance when called.
   * @returns A `ProxyValidator` that delegates to the validator produced by the factory.
   */
  proxy: <Out = unknown, In = unknown>(factory: ProxyValidatorFactory<Out, In>, supportsFreeze: boolean = false) => new ProxyValidator<Out, In>(factory, supportsFreeze),

  /**
   * Wraps a validator so that successful results are memoized by cache key in a bounded cache.
   * A repeated input returns the earlier result directly - e.g. the same ISO string parses to one
   * shared `DateTime` instance. See {@link MemoizeValidator}.
   */
  /**
   * A view of `validator` whose whole subtree produces frozen output. The schema itself is
   * unchanged, so the same validator can still be used mutably elsewhere.
   */
  frozen: <Out, In>(validator: Validator<Out, In>) => new FreezeValidator<Out, In>(validator),

  memoize: <Out, In, K = In>(validator: Validator<Out, In>, options?: MemoizeValidatorOptions<Out, In, K>) =>
    new MemoizeValidator<Out, In, K>(validator, options),
};
Object.freeze(V);
