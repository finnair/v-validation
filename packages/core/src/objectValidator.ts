import { Path } from "@finnair/path";
import { 
  AnyValidator, 
  CompositionParameters, 
  defaultViolations, 
  FailureCallback, 
  HasValueValidator, 
  isNullOrUndefined, 
  isNumber, 
  isString, 
  maybeAllOfValidator, 
  maybeCompositionOf, 
  SuccessCallback, 
  ValidationContext, 
  Validator, 
  ValidatorFnWrapperV2, 
  Violation,
  violationsOf, 
} from "./validators";

export type PropertyModel = { [s: string]: string | number | Validator };

export type ParentModel = ObjectValidator | ObjectValidator<any>[];

export type Properties = { [s: string]: Validator };

export interface MapEntryModel<K = unknown, V = unknown> {
  readonly keys: Validator<K>;
  readonly values: Validator<V>;
}

export interface PropertyFilter {
  (key: string): boolean;
}

export type VInheritableType<V extends ObjectValidator<any, any>> = V extends ObjectValidator<any, infer Out> ? Out : unknown;

export interface ObjectModel<LocalType = unknown, InheritableType = unknown> {
  /**
   * Inherit all non-local rules from parent validators. 
   */
  readonly extends?: ParentModel;
  /**
   * Inheritable property rules. 
   */
  readonly properties?: PropertyModel;
  /**
   * Local, non-inheritable property rules, e.g. discriminator property in a class hierarchy. 
   */
  readonly localProperties?: PropertyModel;
  /**
   * Validation rules for additional properties. True allows any additional property. 
   * With MapEntryModel valueValidator must match if keyValidator matches and at least one keyValidator must match.
   */
  readonly additionalProperties?: boolean | MapEntryModel | MapEntryModel[];
  /**
   * Next validator to be executed after all properties are validated successfully. 
   * Use this to define additional rules or conversions for the ObjectValidator. 
   * Using the `next` function returns a `NextValidator` that cannot be further extended. 
   */
  readonly next?: Validator | Validator[];
  /**
   * Local, non-inheritable rules. 
   */
  readonly localNext?: Validator | Validator[];
}

export class ObjectValidator<LocalType = unknown, InheritableType = LocalType, In = unknown> extends Validator<LocalType, In> {
  public readonly properties: Properties;

  public readonly localProperties: Properties;

  public readonly additionalProperties: MapEntryValidator[];

  public readonly parentValidators: ObjectValidator[];

  public readonly nextValidator?: Validator;

  public readonly localNextValidator?: Validator;

  constructor(public readonly model: ObjectModel<LocalType, InheritableType>) {
    super();
    let properties: Properties = {};
    let additionalProperties: MapEntryValidator[] = [];
    let parentNextValidators: Validator[] = [];
    let nextValidators: Validator[] = [];

    this.parentValidators = model.extends ? ([] as ObjectValidator[]).concat(model.extends) : [];
    for (let i = 0; i < this.parentValidators.length; i++) {
      const parent = this.parentValidators[i];
      additionalProperties = additionalProperties.concat(parent.additionalProperties);
      properties = mergeProperties(parent.properties, properties);
      if (parent.nextValidator) {
        parentNextValidators.push(parent.nextValidator);
      }
    }
    if (parentNextValidators.length > 0) {
      nextValidators.push(maybeAllOfValidator(parentNextValidators as [Validator, ...Validator[]]));
    }
    if (model.next) {
      nextValidators = nextValidators.concat(model.next);
    }
    this.additionalProperties = additionalProperties.concat(getMapEntryValidators(model.additionalProperties));
    this.properties = mergeProperties(getPropertyValidators(model.properties), properties);
    this.localProperties = getPropertyValidators(model.localProperties);
    const next = nextValidators.length > 0 ? maybeCompositionOf(...(nextValidators as CompositionParameters)) : undefined;
    if (next) {
      this.nextValidator = next;
    }
    if (model.localNext) {
      if (!Array.isArray(model.localNext)) {
        this.localNextValidator = model.localNext;
      } else if (model.localNext.length > 0) {
        this.localNextValidator = maybeCompositionOf(...(model.localNext as CompositionParameters));
      }
    }

    Object.freeze(this.properties);
    Object.freeze(this.localProperties);
    Object.freeze(this.additionalProperties);
    Object.freeze(this.parentValidators);
    Object.freeze(this);
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<LocalType>, failure: FailureCallback): void {
    this.validateFilteredPath(value, path, ctx, success, failure, _ => true);
  }

  validateFilteredPath(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<LocalType>, failure: FailureCallback, filter: PropertyFilter) {
    if (value === null || value === undefined) {
      failure([defaultViolations.notNull(path)]);
      return;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      failure([defaultViolations.object(path)]);
      return;
    }
    const anyValue = value as any;
    const convertedObject: any = {} as LocalType;
    const keys = new Set<string>([...Object.keys(this.properties), ...Object.keys(this.localProperties), ...Object.keys(value)]);
    let expectedResponses = keys.size;
    let violations: Violation[] = [];

    const reportResult = () => {
      if (--expectedResponses === 0) {
        if (violations.length > 0) {
          failure(violations);
        } else if (this.nextValidator) {
          this.nextValidator.validatePathV2(convertedObject, path, ctx, 
            (result) => {
              if (this.localNextValidator) {
                this.localNextValidator.validatePathV2(result, path, ctx, (result) => success(result as LocalType), failure);
              } else {
                success(result as LocalType);
              }
            }, 
            failure);
        } else if (this.localNextValidator) {
          this.localNextValidator.validatePathV2(convertedObject, path, ctx, (result) => success(result as LocalType), failure);
        } else {
          success(convertedObject as LocalType);
        }
      }
    };

    const reportSuccess = (key: string, propertyValue: unknown) => {
      if (propertyValue !== undefined) {
        convertedObject[key] = propertyValue;
      } else {
        delete convertedObject[key];
      }
      reportResult();
    };
    
    const reportFailure = (key: string, error: any) => {
      delete convertedObject[key];
      violations = violations.concat(violationsOf(error, path.property(key)));
      reportResult();
    };
    
    const validateLocalProperty = (key: string, propertyValue: unknown, propertyPath: Path) => {
      this.localProperties[key].validatePathV2(propertyValue, propertyPath, ctx, 
        (result) => reportSuccess(key, result),
        (error) => reportFailure(key, error)
      )
    };

    const validateProperty = (key: string, propertyValue: unknown, propertyPath: Path) => {
      this.properties[key].validatePathV2(propertyValue, propertyPath, ctx, 
        (result) => {
          if (this.localProperties[key]) {
            validateLocalProperty(key, propertyValue, propertyPath);
          } else {
            reportSuccess(key, result);
          }
        },
        (error) => reportFailure(key, error)
      )
    };

    const validateAdditionalProperty = (key: string, propertyValue: unknown, propertyPath: Path, index: number, keySuccessCount: number, keyError?: Violation[]) => {
      if (index < this.additionalProperties.length) {
        const { keyValidator, valueValidator } = this.additionalProperties[index];
        keyValidator.validatePathV2(key, propertyPath, ctx, 
          () => {
            valueValidator.validatePathV2(propertyValue, propertyPath, ctx,
              (result) => validateAdditionalProperty(key, result, propertyPath, index + 1, keySuccessCount + 1),
              (error) => reportFailure(key, error)
            );
          },
          (keyError) => validateAdditionalProperty(key, propertyValue, propertyPath, index + 1, keySuccessCount, keyError)
        );
      } else if (keySuccessCount === 0) {
        ctx.failureV2(defaultViolations.unknownProperty(propertyPath), propertyValue,
          (result) => reportSuccess(key, result),
          (error) => {
            if (index === 1 && keyError) {
              reportFailure(key, keyError);
            } else {
              reportFailure(key, error);
            }
          }
        );
      } else {
        reportSuccess(key, propertyValue);
      }
    };

    for (const key of keys) {
      convertedObject[key] = undefined;
      if (!filter(key)) {
        reportSuccess(key, undefined);
        continue;
      }
      const valuePath = path.property(key);
      const propertyValue = anyValue[key];
      if (this.properties[key]) {
        validateProperty(key, propertyValue, valuePath);
      } else if (this.localProperties[key]) {
        validateLocalProperty(key, propertyValue, valuePath);
      } else {
        validateAdditionalProperty(key, propertyValue, valuePath, 0, 0);
      }
    }
  }

  omit<T, K extends keyof (any & (InheritableType | LocalType))>(...keys: K[]) {
    return new ObjectValidator<Omit<LocalType, K extends keyof LocalType ? K : never>, Omit<InheritableType, K extends keyof InheritableType ? K : never>>({
      properties: pick(this.properties, key => !keys.includes(key as any)),
      localProperties: pick(this.localProperties, key => !keys.includes(key as any)),
    });
  }

  pick<T, K extends keyof (any & (InheritableType | LocalType))>(...keys: K[]) {
    return new ObjectValidator<Pick<LocalType, K extends keyof LocalType ? K : never>, Pick<InheritableType, K extends keyof InheritableType ? K : never>>({
      properties: pick(this.properties, key => keys.includes(key as any)),
      localProperties: pick(this.localProperties, key => keys.includes(key as any)),
    });
  }
}

function pick(properties: Properties, fn: (key: keyof any) => boolean): Properties {
  return Object.entries(properties).reduce((current: Properties, [key, validator]) => {
    if (fn(key)) {
      current[key] = validator;
    }
    return current;
  }, {} as Properties);
}

export function mergeProperties(from: Properties, to: Properties): Properties {
  if (from) {
    for (const key in from) {
      if (to[key]) {
        to[key] = to[key].next(from[key]);
      } else {
        to[key] = from[key];
      }
    }
  }
  return to;
}

/**
 * Converts a primitive `value` into an object `{ property: value }`. This normalizer can be used
 * to e.g. preprocess the results of an XML parser and a schema having textual elements with optional attributes
 * where an element without attributes would be simple string and an element with attributes would be an object.
 */
export class ObjectNormalizer<InOut> extends Validator<undefined | InOut | {}> {
  constructor(public readonly property: string) {
    super();
    Object.freeze(this);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<undefined | {}> {
    if (value === undefined) {
      return Promise.resolve(undefined);
    }
    if (typeof value !== 'object' || value === null) {
      const object: any = {};
      object[this.property] = value;
      return Promise.resolve(object);
    }
    return Promise.resolve(value);
  }
}

export class MapEntryValidator {
  public readonly keyValidator: Validator;
  public readonly valueValidator: Validator;

  constructor(entryModel: MapEntryModel) {
    this.keyValidator = entryModel.keys;
    this.valueValidator = entryModel.values;
    Object.freeze(this);
  }
}

function getPropertyValidators(properties?: PropertyModel): Properties {
  const propertyValidators: Properties = {};
  if (properties) {
    for (const name in properties) {
      if (isString(properties[name]) || isNumber(properties[name])) {
        propertyValidators[name] = new HasValueValidator(properties[name]);
      } else {
        propertyValidators[name] = properties[name] as Validator;
      }
    }
  }
  return propertyValidators;
}

function getMapEntryValidators(additionalProperties?: boolean | MapEntryModel | MapEntryModel[]): MapEntryValidator[] {
  if (isNullOrUndefined(additionalProperties)) {
    return [];
  }
  if (typeof additionalProperties === 'boolean') {
    if (additionalProperties) {
      return [allowAllMapEntries];
    }
    return [allowNoneMapEntries];
  }
  const models: MapEntryModel[] = ([] as MapEntryModel[]).concat(additionalProperties as MapEntryModel | MapEntryModel[]);
  const validators: MapEntryValidator[] = [];
  for (let i = 0; i < models.length; i++) {
    validators[i] = new MapEntryValidator(models[i]);
  }
  return validators;
}

export const lenientUnknownPropertyValidator = new ValidatorFnWrapperV2((value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<any>, failure: FailureCallback) =>
  ctx.failureV2(defaultViolations.unknownProperty(path), value, success, failure));

export const strictUnknownPropertyValidator = new ValidatorFnWrapperV2((value: any, path: Path, ctx: ValidationContext, _success: SuccessCallback<any>, failure: FailureCallback) => 
  failure([defaultViolations.unknownPropertyDenied(path)]));

const allowAllMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: new AnyValidator(),
});

const allowNoneMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: strictUnknownPropertyValidator,
});
