import { Validator } from "./validators.js";

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
 * Tie a type-level assertion to a statement so the compiler checks it (a bare `type _ = ...` would
 * otherwise be flagged as unused). Pass the expected value of the computed type, typically `true`.
 *
 * Usage:
 * ```ts
 * assertType<Equals<VType<typeof validator>, MyInterface>>(true);
 * ```
 *
 * For validators, prefer the dedicated {@link assertValidatorType}.
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

type IsAny<T> = 0 extends 1 & T ? true : false;

// Enum members become their literal values and intersections are flattened; ?, readonly and tuples are kept.
type Normalize<T> =
  IsAny<T> extends true ? T
  : T extends string ? `${T}`
  : T extends number ? (`${T}` extends `${infer N extends number}` ? N : T)
  : T extends Function ? T
  : T extends object ? { [K in keyof T]: Normalize<T[K]> }
  : T;

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type IsTuple<T extends readonly unknown[]> = number extends T['length'] ? false : true;
type IsReadonlyArray<T extends readonly unknown[]> = T extends unknown[] ? false : true;
type AllTrue<T> = [T] extends [true] ? true : false;

// A members without a structurally equal member in B
type Unmatched<A, B> = A extends unknown ? (true extends (B extends unknown ? StructurallyEquals<A, B> : never) ? never : A) : never;

// Homomorphic mapping keeps ? and readonly
type Modifiers<T> = { [K in keyof T]: 0 };

type ObjectEquals<A, B> =
  Equals<keyof A, keyof B> extends true
    ? Equals<Modifiers<A>, Modifiers<B>> extends true
      ? AllTrue<{ [K in keyof A]-?: StructurallyEquals<A[K], B[K & keyof B]> }[keyof A]>
      : false
    : false;

type ArrayEquals<A extends readonly unknown[], B extends readonly unknown[]> =
  [IsTuple<A>, IsTuple<B>] extends [false, false]
    ? Equals<IsReadonlyArray<A>, IsReadonlyArray<B>> extends true ? StructurallyEquals<A[number], B[number]> : false
    : Equals<Normalize<A>, Normalize<B>>;

/**
 * Walk both types in parallel so that every level is first checked with `Equals`. Normalizing whole
 * types up front would expand recursive aliases (e.g. two distinct `JsonValue` declarations) forever.
 */
type StructuralCompare<A, B> =
  true extends IsUnion<A> | IsUnion<B>
    ? [Unmatched<A, B> | Unmatched<B, A>] extends [never] ? true : false
    : A extends readonly unknown[]
      ? B extends readonly unknown[] ? ArrayEquals<A, B> : false
      : [A, B] extends [Function, unknown] | [unknown, Function]
        ? false
        : [A, B] extends [object, object]
          ? ObjectEquals<A, B>
          : Equals<Normalize<A>, Normalize<B>>;

/**
 * Like {@link Equals}, but treats an enum and the union of its members, and an intersection and its
 * flattened object, as equal. Mutual assignability keeps classes with private members and distinct enums
 * nominal - and, as in plain TS, a string enum is not equal to the union of its literal values.
 */
export type StructurallyEquals<A, B> =
  Equals<A, B> extends true
    ? true
    : true extends IsAny<A> | IsAny<B>
      ? false
      : MutuallyAssignable<A, B> extends true
        ? StructuralCompare<A, B>
        : false;

type AtActual<A, K extends PropertyKey> = K extends keyof A ? A[K] : 'MISSING: property is absent';
type AtExpected<B, K extends PropertyKey> = K extends keyof B ? B[K] : 'UNEXPECTED: property not allowed';

/**
 * A structural, per-property diff of `Actual` against `Expected`. Resolves to `never` when they are
 * strictly equal (so it can gate an assertion), otherwise to an object that keeps only the mismatching
 * keys - recursively - with `{ expected; actual }` at each offending leaf. Surfaced in a type error, it
 * points at the exact property path (e.g. `{ address: { zip: { expected: string; actual: number } } }`).
 */
export type OutputTypeMismatch<Actual, Expected> = StructurallyEquals<Actual, Expected> extends true
  ? never
  : [Actual, Expected] extends [object, object]
    ? {
        [K in keyof Actual | keyof Expected as StructurallyEquals<AtActual<Actual, K>, AtExpected<Expected, K>> extends true
          ? never
          : K]: OutputTypeMismatch<AtActual<Actual, K>, AtExpected<Expected, K>>;
      }
    : { expected: Expected; actual: Actual };

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
 * On a mismatch TypeScript reports the parameter type, whose second tuple element is an {@link OutputTypeMismatch}
 * diff naming the offending property path and its expected/actual types.
 */
export const assertValidatorType =
  <Expected>() =>
  <V extends Validator<any>>(
    _validator: OutputTypeMismatch<VType<V>, Expected> extends never
      ? V
      : ['Validator output type does not match the asserted type:', OutputTypeMismatch<VType<V>, Expected>],
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
