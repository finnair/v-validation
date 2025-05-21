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
 */
export type ComparableType<T> = T extends object 
  ? ComparableRequired<RequiredProperties<T>> & ComparableOptional<OptionalProperties<T>>
  : T;

/**
 * Verify mutual extensibility. When using this with both types wrapped in`ComparableType`, you get 
 * proper errors about all differences in `Inferred` and `Custom` types. 
 */
export type EqualTypes<Inferred extends Custom, Custom extends T, T = Inferred> = true;

export const assertType = <Type>(_: Type): void => void 0;
