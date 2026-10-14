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
 * This works because T is unknown so it stays deferred and deferred conditionals have a strict 
 * comparison rule, ensuring accurate type equality checks.
 */
export type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// If you can assign both 0 and 1 to the type, it can only be any because no other type can accept an intersection of two literals
type IsAny<T> = 0 extends 1 & T ? true : false;

// Enum members become their literal values and intersections are flattened; ?, readonly and tuples are kept.
type Normalize<T> =
  IsAny<T> extends true ? T
  : T extends string ? `${T}`
  : T extends number ? (`${T}` extends `${infer N extends number}` ? N : T)
  : T extends Function ? T
  : T extends object ? { [K in keyof T]: Normalize<T[K]> }
  : T;

// Comparing tuples prevent two side effects of a plain A extends B:
// 1. No distribution over unions. In A extends B ? … : …, when A is a naked type parameter, the 
//    conditional is applied to each union member separately. string | number extends string would 
//    evaluate as true | false, i.e. boolean. Wrapping A in [A] stops this, so the union is compared 
//    as one type.
// 2. never behaves as a type. A plain never extends X distributes over zero members and yields 
//    never, which is not a clean boolean. With the tuple, [never] extends [X] is true, since never
//    is assignable to everything.
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Identity, not assignability: a union may repeat structurally identical members, e.g. `[X, ...X[]][number]`
type IsUnion<T, U = T> = T extends unknown ? (Equals<U, T> extends true ? false : true) : never;
type IsTuple<T extends readonly unknown[]> = number extends T['length'] ? false : true;
type IsReadonlyArray<T extends readonly unknown[]> = T extends unknown[] ? false : true;
type AllTrue<T> = [T] extends [true] ? true : false;

// A members without a structurally equal member in B
type Unmatched<A, B> = A extends unknown ? (true extends (B extends unknown ? StructurallyEquals<A, B> : never) ? never : A) : never;

type Primitive = string | number | bigint | boolean | symbol | null | undefined;

// Primitive members are normalized in one linear pass; only object members are matched pairwise
type UnionEquals<A, B> =
  Equals<Normalize<Extract<A, Primitive>>, Normalize<Extract<B, Primitive>>> extends true
    ? [Unmatched<Exclude<A, Primitive>, Exclude<B, Primitive>> | Unmatched<Exclude<B, Primitive>, Exclude<A, Primitive>>] extends [never]
      ? true
      : false
    : false;

// Homomorphic mapping keeps ? and readonly
type Modifiers<T> = { [K in keyof T]: 0 };

// A mapped type over `string` has keyof `string`, a declared string index signature `string | number`
type Keys<T> = string extends keyof T ? keyof T | number : keyof T;

type ObjectEquals<A, B> =
  StructurallyEquals<Keys<A>, Keys<B>> extends true
    ? Equals<Modifiers<A>, Modifiers<B>> extends true
      ? AllTrue<{ [K in keyof A]-?: StructurallyEquals<A[K], B[K & keyof B]> }[keyof A]>
      : false
    : false;

// Fixed-length tuples are compared element by element, like objects; -? as optional elements are covered by length
type TupleEquals<A extends readonly unknown[], B extends readonly unknown[]> =
  Equals<A['length'], B['length']> extends true
    ? AllTrue<{ [K in keyof A]-?: StructurallyEquals<A[K], B[K & keyof B]> }[number]>
    : false;

type ArrayEquals<A extends readonly unknown[], B extends readonly unknown[]> =
  Equals<IsReadonlyArray<A>, IsReadonlyArray<B>> extends true
    ? [IsTuple<A>, IsTuple<B>] extends [false, false]
      ? StructurallyEquals<A[number], B[number]>
      : [IsTuple<A>, IsTuple<B>] extends [true, true]
        ? TupleEquals<A, B>
        : false
    : false;

/**
 * Walk both types in parallel so that every level is first checked with `Equals`. Normalizing whole
 * types up front would expand recursive aliases (e.g. two distinct `JsonValue` declarations) forever.
 */
type StructuralCompare<A, B> =
  true extends IsUnion<A> | IsUnion<B>
    ? UnionEquals<A, B>
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

// A numeric key reads a string index signature, see Keys
type At<T, K extends PropertyKey, Absent> = K extends keyof T
  ? T[K]
  : K extends number
    ? string extends keyof T ? T[string & keyof T] : Absent
    : Absent;
declare const absentMarker: unique symbol;

/**
 * Stands in for a property that is missing from one side of a diff. Branded with a symbol that is not
 * exported, so no user type can equal it; `Label` only makes the error message readable.
 */
export interface AbsentProperty<Label extends string> {
  readonly [absentMarker]: Label;
}

type AtActual<A, K extends PropertyKey> = At<A, K, AbsentProperty<'MISSING: property is absent'>>;
type AtExpected<B, K extends PropertyKey> = At<B, K, AbsentProperty<'UNEXPECTED: property not allowed'>>;

/**
 * A structural, per-property diff of `Actual` against `Expected`. Resolves to `never` when they are
 * strictly equal (so it can gate an assertion), otherwise to an object that keeps only the mismatching
 * keys - recursively - with `{ EXPECTED; ACTUAL }` at each offending leaf, and a `REASON` where the
 * types alone do not show the difference (modifiers, tuple length, nominal types). Arrays are diffed by
 * index; functions are not compared structurally, only reported as a leaf. Surfaced in a type error, it
 * points at the exact property path (e.g. `{ address: { zip: { EXPECTED: string; ACTUAL: number } } }`).
 */
export type OutputTypeMismatch<Actual, Expected> = StructurallyEquals<Actual, Expected> extends true
  ? never
  : [Actual, Expected] extends [AbsentProperty<string>, unknown] | [unknown, AbsentProperty<string>]
    ? Leaf<Actual, Expected> // Before the object branch, which would walk into the marker's brand
    : [Actual, Expected] extends [infer A extends readonly unknown[], infer B extends readonly unknown[]]
    ? ArrayMismatch<A, B>
    : [Actual, Expected] extends [Function | readonly unknown[], unknown] | [unknown, Function | readonly unknown[]]
      ? Leaf<Actual, Expected>
      : [Actual, Expected] extends [object, object]
        ? NonEmptyDiff<
            {
              [K in keyof Actual | keyof Expected as StructurallyEquals<AtActual<Actual, K>, AtExpected<Expected, K>> extends true
                ? ModifierDiffers<Actual, Expected, K> extends true ? K : never
                : K]: StructurallyEquals<AtActual<Actual, K>, AtExpected<Expected, K>> extends true
                ? Leaf<Simplify<Pick<Actual, K & keyof Actual>>, Simplify<Pick<Expected, K & keyof Expected>>, 'optional or readonly modifier differs'>
                : OutputTypeMismatch<AtActual<Actual, K>, AtExpected<Expected, K>>;
            },
            Actual,
            Expected
          >
        : Leaf<Actual, Expected>;

type Leaf<Actual, Expected, Reason = never> = [Reason] extends [never]
  ? { EXPECTED: Expected; ACTUAL: Actual }
  : { EXPECTED: Expected; ACTUAL: Actual; REASON: Reason };

// A key whose values match, but whose ? or readonly modifier does not
type IsOptionalKey<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;
type IsReadonlyKey<T, K extends keyof T> = Equals<Pick<T, K>, Readonly<Pick<T, K>>>;
type ModifierDiffers<A, B, K> = K extends keyof A & keyof B
  ? Equals<[IsOptionalKey<A, K>, IsReadonlyKey<A, K>], [IsOptionalKey<B, K>, IsReadonlyKey<B, K>]> extends true
    ? false
    : true
  : false;

type ArrayMismatch<A extends readonly unknown[], B extends readonly unknown[]> =
  Equals<IsReadonlyArray<A>, IsReadonlyArray<B>> extends false
    ? Leaf<A, B, 'readonly array differs'>
    : [IsTuple<A>, IsTuple<B>] extends [false, false]
      ? { [index: number]: OutputTypeMismatch<A[number], B[number]> }
      : [IsTuple<A>, IsTuple<B>] extends [true, true]
        ? Equals<A['length'], B['length']> extends true
          ? {
              [K in Exclude<keyof A, keyof unknown[]> as StructurallyEquals<A[K], B[K & keyof B]> extends true ? never : K]: OutputTypeMismatch<
                A[K],
                B[K & keyof B]
              >;
            }
          : Equals<Required<A>['length'], Required<B>['length']> extends true
            ? Leaf<A, B, 'optional element differs'>
            : Leaf<A, B, 'tuple length differs'>
        : Leaf<A, B, 'tuple vs array'>;

// No single property differs
type NonEmptyDiff<Diff, Actual, Expected> = [keyof Diff] extends [never]
  ? Leaf<Actual, Expected, 'types differ nominally (e.g. private or protected members) or in their key types'>
  : Diff;

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
