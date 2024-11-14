
type KeysOfType<T, SelectedType> = {
  [key in keyof T]: SelectedType extends T[key] ? key : never;
}[keyof T];

type OptionalProperties<T> = Partial<Pick<T, KeysOfType<T, undefined>>>;

type RequiredProperties<T> = Omit<T, KeysOfType<T, undefined>>;

export type UndefinedAsOptionalProperties<T> = RequiredProperties<T> & OptionalProperties<T>;

type Optional<T> = { type: Exclude<T, undefined> };

type ComparableOptional<T> = T extends object
  ? { [K in keyof T]-?:  Optional<ComparableType<T[K]>> }
  : T;

type ComparableRequired<T> = T extends object
  ? { [K in keyof T]:  ComparableType<T[K]> }
  : T;

export type ComparableType<T> = T extends object 
  ? ComparableRequired<RequiredProperties<T>> & ComparableOptional<OptionalProperties<T>>
  : T;

/**
 * Verify mutual extensibility. When using this with both types wrapped in`ComparableType`, you get 
 * proper errors about all differences in `Inferred` and `Custom` types. 
 */
export type EqualTypes<Inferred extends Custom, Custom extends T, T = Inferred> = true;

export const assertType = <Type>(_: Type): void => void 0;
