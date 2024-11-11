import { V } from "./V.js";
import { Validator } from "./validators.js";
import { MapEntryModel, ObjectValidator, PropertyModel, strictUnknownPropertyValidator } from "./objectValidator.js";

type KeysOfType<T, SelectedType> = {
  [key in keyof T]: SelectedType extends T[key] ? key : never;
}[keyof T];

type OptionalProperties<T> = Partial<Pick<T, KeysOfType<T, undefined>>>;

type RequiredProperties<T> = Omit<T, KeysOfType<T, undefined>>;

type UndefinedAsOptionalProperties<T> =  RequiredProperties<T> & OptionalProperties<T>;

export class ObjectValidatorBuilder<Props, Next, LocalProps, LocalNext> {
  private _extends: ObjectValidator[] = [];
  private _properties: PropertyModel = {};
  private _localProperties: PropertyModel = {};
  private _additionalProperties: MapEntryModel[] = [];
  private _next?: Validator[] = [];
  private _localNext?: Validator[] = [];
  constructor() {}
  extends<X>(parent: ObjectValidator<any, X>) {
    this._extends.push(parent);
    return this as ObjectValidatorBuilder<Props & X, Next, LocalProps, LocalNext>;
  }
  properties<X>(properties: { [K in keyof X]: Validator<X[K]> }) {
    for (const key in properties) {
      this._properties[key] = properties[key];
    }
    return this as ObjectValidatorBuilder<Props & UndefinedAsOptionalProperties<X>, Next, LocalProps, LocalNext>;
  }
  localProperties<X>(localProperties: { [K in keyof X]: Validator<X[K]> }) {
    for (const key in localProperties) {
      this._localProperties[key] = localProperties[key];
    }
    return this as ObjectValidatorBuilder<Props, Next, LocalProps & UndefinedAsOptionalProperties<X>, LocalNext>;
  }
  allowAdditionalProperties(allow: boolean) {
    if (allow) {
      return this.additionalProperties(V.any<keyof any>(), V.any());
    } else {
      return this.additionalProperties(V.any<keyof any>(), strictUnknownPropertyValidator);
    }
  }
  additionalProperties<K extends keyof any, V>(keys: Validator<K>, values: Validator<V>) {
    this._additionalProperties.push({ keys, values });
    return this as ObjectValidatorBuilder<Props & Record<K, V>, Next, LocalProps, LocalNext>;
  }
  next<NextOut>(validator: Validator<NextOut, Next extends {} ? Next : Props>) {
    this._next?.push(validator);
    return this as unknown as ObjectValidatorBuilder<Props, NextOut, LocalProps, LocalNext>;
  }
  localNext<NextOut>(validator: Validator<NextOut, LocalNext extends {} ? LocalNext : Next extends {} ? Next : Props & LocalProps>) {
    this._localNext?.push(validator);
    return this as unknown as ObjectValidatorBuilder<Props, Next, LocalProps, NextOut>;
  }
  build() {
    return new ObjectValidator<LocalNext extends {} ? LocalNext : Next extends {} ? Next : Props & LocalProps, Next extends {} ? Next : Props>({
      extends: this._extends,
      properties: this._properties,
      additionalProperties: this._additionalProperties,
      next: this._next,
      localProperties: this._localProperties,
      localNext: this._localNext,
    });
  }
};
