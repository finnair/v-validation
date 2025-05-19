
type KeysOfType<T, SelectedType> = {
  [key in keyof T]: T[key] extends SelectedType ? key : never;
}[keyof T];

type OptionalProperties<T> = Pick<T, KeysOfType<T, undefined>>;

type RequiredProperties<T> = Omit<T, KeysOfType<T, undefined>>;

export type UndefinedAsOptionalProperties<T> = RequiredProperties<T> & Partial<OptionalProperties<T>>;

export type ComparableType<T> = T extends object ? Required<{
    [K in keyof T]: ComparableType<Exclude<T[K], undefined>>;
}>: Exclude<T, undefined>;

/**
 * Verify mutual extensibility. When using this with both types wrapped in`ComparableType`, you get 
 * proper errors about all differences in `Inferred` and `Custom` types. 
 */
export type EqualTypes<Inferred extends Custom, Custom extends T, T = Inferred> = true;

export const assertType = <Type>(_: Type): void => void 0;
