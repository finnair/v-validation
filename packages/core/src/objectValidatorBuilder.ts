import { V } from "./V.js";
import { Validator } from "./validators.js";
import { MapEntryModel, ObjectValidator, PropertyModel, strictUnknownPropertyValidator } from "./objectValidator.js";
import { UndefinedAsOptionalProperties } from "./typing.js";

export class ObjectValidatorBuilder<Props, Next, LocalProps, LocalNext> {
  private _extends: ObjectValidator[] = [];
  private _properties: PropertyModel = {};
  private _localProperties: PropertyModel = {};
  private _additionalProperties: MapEntryModel[] = [];
  private _next?: Validator[] = [];
  private _localNext?: Validator[] = [];
  private _propertyOrder: undefined | string[];
  constructor() {}
  extends<X>(parent: ObjectValidator<any, X>) {
    this._extends.push(parent);
    if (this._propertyOrder === undefined) {
      this._propertyOrder = parent.propertyOrder;
    } else if (parent.propertyOrder !== undefined) {
      this._propertyOrder = [...this._propertyOrder, ...parent.propertyOrder];
    }
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
    return this as ObjectValidatorBuilder<Props & { [key in K]?: V }, Next, LocalProps, LocalNext>;
  }
  next<NextOut extends {}>(validator: Validator<NextOut, Next extends {} ? Next : Props>) {
    this._next?.push(validator);
    return this as unknown as ObjectValidatorBuilder<Props, NextOut, LocalProps, LocalNext>;
  }
  localNext<NextOut extends {}>(validator: Validator<NextOut, LocalNext extends {} ? LocalNext : Next extends {} ? Next : Props & LocalProps>) {
    this._localNext?.push(validator);
    return this as unknown as ObjectValidatorBuilder<Props, Next, LocalProps, NextOut>;
  }
  propertyOrder(propertyOrder: undefined | string[]) {
    this._propertyOrder = propertyOrder;
    return this;
  }
  additionalPropertyOrder(propertyOrder: string[]) {
    if (this._propertyOrder === undefined) {
      this._propertyOrder = propertyOrder;
    } else {
      this._propertyOrder = [...this._propertyOrder, ...propertyOrder];
    }
    return this;
  }
  build() {
    return new ObjectValidator<
        (Next extends {} ? Next : Props) & (LocalNext extends {} ? LocalNext : LocalProps), 
        (Next extends {} ? Next : Props)
      >({
      extends: this._extends,
      properties: this._properties,
      additionalProperties: this._additionalProperties,
      next: this._next,
      localProperties: this._localProperties,
      localNext: this._localNext,
      propertyOrder: this._propertyOrder,
    });
  }
};
