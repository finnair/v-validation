import { Path } from '@finnair/path';
import {
  AnyValidator,
  CompositionParameters,
  defaultViolations,
  HasValueValidator,
  isNullOrUndefined,
  isNumber,
  isString,
  maybeAllOfValidator,
  maybeCompositionOf,
  ValidationContext,
  SyncPromise,
  Validator,
  ValidatorFnWrapper,
  Violation,
  violationsOf,
} from './validators.js';

export type PropertyModel = { [s: string]: string | number | Validator };

export type ParentModel = ObjectValidator | ObjectValidator<any>[];

export type Properties = { [s: string]: Validator };

export interface MapEntryModel<K = unknown, V = unknown> {
  readonly keys: Validator<K>;
  readonly values: Validator<V>;
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
  /**
   * Output property ordering:
   *
   * Default is `undefined` (for backwards compatibility), which means that properties will be ordered in
   * 1) inherited properties first in inheritance order,
   * 2) properties
   * 3) localProperties
   * 4) additionalProperties in input order.
   *
   * If `propertyOrder` is defined, output properties will be ordered in
   * 1) propertyOrder
   * 2) inherited mandatory properties in inheritance order
   * 3) mandatory properties
   * 4) mandatory localProperties
   * 5) optional and additionalProperties in input order.
   *
   * For optimal performance it is recommended to define at least an empty array for `propertyOrder`.
   * That way missing optional properties are skipped entirely.
   *
   * NOTE: `propertyOrder` is **not** inherited via `ObjectModel.extends`. This is to allow full control
   * of the property ordering in the child model. Please use `V.objectType()` which by default inherits
   * the `propertyOrder` from the parent model, but also allows overriding it in the child model. `V.objectType()`
   * also allows finer control over the order in which inherited vs own properties are ordered.
   */
  readonly propertyOrder?: string[];
}

export class ObjectValidator<LocalType = unknown, InheritableType = LocalType, In = unknown> extends Validator<LocalType, In> {
  public readonly properties: Properties;

  public readonly localProperties: Properties;

  public readonly additionalProperties: MapEntryValidator[];

  public readonly parentValidators: ObjectValidator[];

  public readonly nextValidator?: Validator;

  public readonly propertyOrder?: string[];

  private readonly validator: Validator<LocalType, In>;

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
    this.propertyOrder = model.propertyOrder ? [...model.propertyOrder] : undefined;

    let validator: Validator = new PropertiesValidator<LocalType, In>(this.properties, this.localProperties, this.additionalProperties, this.propertyOrder);
    const next = nextValidators.length > 0 ? maybeCompositionOf(...(nextValidators as CompositionParameters)) : undefined;
    if (next) {
      this.nextValidator = next;
      validator = validator.next(next);
    }
    if (model.localNext) {
      let localNextValidator: Validator | undefined = undefined;
      if (!Array.isArray(model.localNext)) {
        localNextValidator = model.localNext;
      } else if (model.localNext.length > 0) {
        localNextValidator = maybeCompositionOf(...(model.localNext as CompositionParameters));
      }
      if (localNextValidator) {
        validator = validator.next(localNextValidator);
      }
    }
    this.validator = validator as Validator<LocalType, In>;
    Object.freeze(this.propertyOrder);
    Object.freeze(this.parentValidators);
    Object.freeze(this);
  }

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<LocalType> {
    return new SyncPromise((success: (value: LocalType) => void, failure: (error: any) => void) => {
      this.validator.validatePath(value, path, ctx).then(success, failure);
    });
  }

  omit<T, K extends keyof (any & (InheritableType | LocalType))>(...keys: K[]) {
    return new ObjectValidator<Omit<LocalType, K extends keyof LocalType ? K : never>, Omit<InheritableType, K extends keyof InheritableType ? K : never>>({
      properties: pick(this.properties, key => !keys.includes(key as any)),
      localProperties: pick(this.localProperties, key => !keys.includes(key as any)),
      propertyOrder: this.propertyOrder?.filter(key => !keys.includes(key as any)),
    });
  }

  pick<T, K extends keyof (any & (InheritableType | LocalType))>(...keys: K[]) {
    return new ObjectValidator<Pick<LocalType, K extends keyof LocalType ? K : never>, Pick<InheritableType, K extends keyof InheritableType ? K : never>>({
      properties: pick(this.properties, key => keys.includes(key as any)),
      localProperties: pick(this.localProperties, key => keys.includes(key as any)),
      propertyOrder: this.propertyOrder?.filter(key => keys.includes(key as any)),
    });
  }
}

export class PropertiesValidator<LocalType = unknown, In = unknown> extends Validator<LocalType, In> {
  private readonly validationOrder: string[];
  constructor(
    readonly properties: Properties,
    readonly localProperties: Properties,
    readonly additionalProperties: MapEntryValidator[],
    propertyOrder?: string[],
  ) {
    super();
    const validationOrder: Set<string> = new Set();
    if (propertyOrder === undefined) {
      Object.keys(properties).forEach(key => validationOrder.add(key));
      Object.keys(localProperties).forEach(key => validationOrder.add(key));
    } else {
      propertyOrder.forEach(key => {
        if (Object.hasOwn(properties, key) || Object.hasOwn(localProperties, key)) {
          validationOrder.add(key);
        } else {
          throw new Error(`Unknown property: '${key}'`);
        }
      });
      const registerMandatoryProperty = ([key, validator]: [string, Validator<unknown, unknown>]) => {
        if (!validator.skipUndefined()) {
          validationOrder.add(key);
        }
      };
      Object.entries(properties).forEach(registerMandatoryProperty);
      Object.entries(localProperties).forEach(registerMandatoryProperty);
    }
    this.validationOrder = Array.from(validationOrder);

    Object.freeze(this.properties);
    Object.freeze(this.localProperties);
    Object.freeze(this.additionalProperties);
    Object.freeze(this.validationOrder);
    Object.freeze(this);
  }
  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<LocalType> {
    return new SyncPromise((success: (value: LocalType) => void, failure: (error: any) => void) => {
      if (value === null || value === undefined) {
        return failure([defaultViolations.notNull(path)]);
      }
      if (typeof value !== 'object' || Array.isArray(value)) {
        return failure([defaultViolations.object(path)]);
      }
      const anyValue = value as any;
      const convertedObject: any = {} as LocalType;
      let violations: Violation[] = [];

      const keys = new Set<string>(this.validationOrder);
      // Add all, including inherited keys
      for (const key in anyValue) {
        keys.add(key);
      }
      let expectedResponses = keys.size;

      if (expectedResponses === 0) {
        return success(convertedObject as LocalType);
      }

      const reportResult = () => {
        if (--expectedResponses === 0) {
          if (violations.length > 0) {
            failure(violations);
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
        this.localProperties[key].validatePath(propertyValue, propertyPath, ctx).then(
          result => reportSuccess(key, result),
          error => reportFailure(key, error),
        );
      };

      const validateProperty = (key: string, propertyValue: unknown, propertyPath: Path) => {
        this.properties[key].validatePath(propertyValue, propertyPath, ctx).then(
          result => {
            if (Object.hasOwn(this.localProperties, key)) {
              validateLocalProperty(key, result, propertyPath);
            } else {
              reportSuccess(key, result);
            }
          },
          error => reportFailure(key, error),
        );
      };

      const validateAdditionalProperty = (
        key: string,
        propertyValue: unknown,
        propertyPath: Path,
        index: number,
        keySuccessCount: number,
        keyError?: Violation[],
      ) => {
        if (index < this.additionalProperties.length) {
          const { keyValidator, valueValidator } = this.additionalProperties[index];
          keyValidator.validatePath(key, propertyPath, ctx).then(
            () => {
              valueValidator.validatePath(propertyValue, propertyPath, ctx).then(
                result => validateAdditionalProperty(key, result, propertyPath, index + 1, keySuccessCount + 1),
                error => reportFailure(key, error),
              );
            },
            keyError => validateAdditionalProperty(key, propertyValue, propertyPath, index + 1, keySuccessCount, keyError),
          );
        } else if (keySuccessCount === 0) {
          ctx.failure(defaultViolations.unknownProperty(propertyPath), propertyValue).then(
            result => reportSuccess(key, result),
            error => {
              if (index === 1 && keyError) {
                reportFailure(key, keyError);
              } else {
                reportFailure(key, error);
              }
            },
          );
        } else {
          reportSuccess(key, propertyValue);
        }
      };

      for (const key of keys) {
        convertedObject[key] = undefined;
        const valuePath = path.property(key);
        const propertyValue = anyValue[key];
        try {
          if (Object.hasOwn(this.properties, key)) {
            validateProperty(key, propertyValue, valuePath);
          } else if (Object.hasOwn(this.localProperties, key)) {
            validateLocalProperty(key, propertyValue, valuePath);
          } else {
            validateAdditionalProperty(key, propertyValue, valuePath, 0, 0);
          }
        } catch (error) {
          reportFailure(key, error);
        }
      }
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
      if (Object.hasOwn(to, key)) {
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
  validatePath(value: InOut, path: Path, ctx: ValidationContext): PromiseLike<undefined | InOut | {}> {
    return new SyncPromise((success: (value: undefined | InOut | {}) => void, failure: (error: any) => void) => {
      if (value === undefined) {
        return success(undefined);
      }
      if (typeof value !== 'object' || value === null) {
        const object: any = {};
        object[this.property] = value;
        return success(object);
      }
      return success(value);
    });
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

export const lenientUnknownPropertyValidator = new ValidatorFnWrapper<any, any>((value: any, path: Path, ctx: ValidationContext) =>
  ctx.failure(defaultViolations.unknownProperty(path), value),
);

export const strictUnknownPropertyValidator = new ValidatorFnWrapper<any, any>((_value: any, path: Path) => {
  throw defaultViolations.unknownPropertyDenied(path);
});

const allowAllMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: new AnyValidator(),
});

const allowNoneMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: strictUnknownPropertyValidator,
});
