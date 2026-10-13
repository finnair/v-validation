import { Validator } from "./validators";

export type VType<V extends Validator<any>> = V extends Validator<infer Out> ? Out : unknown;

/**
 * Match both optional and "x | undefined" valued keys.
 */
export type OptionalKeys<T> =  Exclude<{
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T], undefined>;

type OptionalProperties<T> = Pick<T, OptionalKeys<T>>;
type RequiredProperties<T> = Omit<T, OptionalKeys<T>>;

type Optional<T> = { 'Optional<T>': T };

/**
 * Wrap optional/undefined properties with required Optional<T> as TS only requires 
 * that required properties match for types to be compatible.
 */
type ComparableOptional<T> = T extends object
  ? { [K in keyof T]-?:  Optional<ComparableType<T[K]>> }
  : T;

type ComparableRequired<T> = T extends object
  ? { [K in keyof T]:  ComparableType<T[K]> }
  : T;


export type UndefinedAsOptionalProperties<T> = RequiredProperties<T> & Partial<OptionalProperties<T>>;

/**
 * Wrap all optional/undefined properties with Optional<T> recursively for strict type check
 *
 * @deprecated Use {@link Equals} (and {@link assertValidatorType} for validators), which compare
 *   types strictly - including optionality - without this wrapping. Retained for backwards
 *   compatibility.
 */
export type ComparableType<T> = T extends object
  ? ComparableRequired<RequiredProperties<T>> & ComparableOptional<OptionalProperties<T>>
  : T;

/**
 * Verify mutual extensibility. When using this with both types wrapped in`ComparableType`, you get
 * proper errors about all differences in `Inferred` and `Custom` types.
 *
 * @deprecated Use {@link Equals} (and {@link assertValidatorType} for validators). Retained for
 *   backwards compatibility.
 */
export type EqualTypes<Inferred extends Custom, Custom extends T, T = Inferred> = true;

/**
 * Verify that two types are deeply equal including optionality. TypeScript itself only checks
 * required properties for compatibility.
 * 
 * Usage:
 * ```ts
 * assertType<EqualTypes<ComparableType<VType<typeof validator>>, ComparableType<RecursiveModel>>>(true);
 * ```
 * 
 * @param _ 
 * @returns 
 */
export const assertType = <Type>(_: Type): void => void 0;

/**
 * Strict, bidirectional type identity. Unlike plain assignability (which ignores optional and excess
 * properties), this distinguishes optional vs. required properties, missing properties and wrong
 * property types - so it needs no `ComparableType` wrapping. Resolves to `true` or `false`.
 */
export type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/**
 * Assert at compile time that a validator's inferred output type is *exactly* `Expected`.
 *
 * A readable one-liner alternative to the `EqualTypes`/`ComparableType` pattern:
 * ```ts
 * // before:
 * assertType<EqualTypes<ComparableType<VType<typeof validator>>, ComparableType<Expected>>>(true);
 * // after:
 * assertValidatorType<Expected>()(validator);
 * ```
 *
 * The call fails to compile unless `VType<typeof validator>` equals `Expected`, including optionality.
 */
export const assertValidatorType =
  <Expected>() =>
  <V extends Validator<any>>(
    _validator: Equals<VType<V>, Expected> extends true
      ? V
      : { 'validator output does not match expected type': Expected },
  ): void => void 0;

/**
 * Flatten intersections (and the `RequiredProperties<X> & Partial<OptionalProperties<X>>` pairs
 * produced by `UndefinedAsOptionalProperties`) into a single object literal for readable hovers.
 *
 * Primitives are passed through untouched: mapping over e.g. `string` would otherwise enumerate
 * all `String.prototype` members. This is purely cosmetic and preserves the original type.
 */
export type Simplify<T> = T extends object ? { [K in keyof T]: T[K] } : T;

/**
 * Combine an object validator's inheritable output with its local output.
 *
 * Two object parts are intersected (regular property merging), but a part that a `next`/`localNext`
 * transform has turned into a non-object (e.g. a `string`) *replaces* the other part instead of
 * producing a nonsensical `object & string`. The local (later) stage wins when it is a primitive.
 */
export type CombineOutput<Inheritable, Local> = unknown extends Local
  ? Inheritable // Local is the `unknown` placeholder (no local rules/transform) -> ignore it
  : [Local] extends [object]
    ? [Inheritable] extends [object]
      ? Inheritable & Local
      : Inheritable
    : Local;
