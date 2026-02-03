import { Path } from "@finnair/path";
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
  Validator, 
  ValidatorFnWrapper, 
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

  validatePath(value: In, path: Path, ctx: ValidationContext): PromiseLike<LocalType> {
    return this.validateFilteredPath(value, path, ctx, _ => true);
  }

  validateFilteredPath(value: In, path: Path, ctx: ValidationContext, filter: PropertyFilter): PromiseLike<LocalType> {
    if (value === null || value === undefined) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return Promise.reject(defaultViolations.object(path));
    }
    const anyValue = value as any;
    const context: ObjectValidationContext = {
      path,
      ctx,
      filter,
      convertedObject: {} as LocalType,
      violations: [],
    };
    const propertyResults: PromiseLike<any>[] = [];

    for (const key in this.properties) {
      propertyResults.push(validateProperty(key, anyValue[key], this.properties[key], context));
    }
    for (const key in this.localProperties) {
      propertyResults.push(validateProperty(key, anyValue[key], this.localProperties[key], context));
    }
    for (const key in value) {
      if (!this.properties[key] && !this.localProperties[key]) {
        propertyResults.push(validateAdditionalProperty(key, anyValue[key], this.additionalProperties, context));
      }
    }

    let validationChain = Promise.allSettled(propertyResults).then(_ => {
      if (context.violations.length === 0) {
        return Promise.resolve(context.convertedObject);
      }
      return Promise.reject(context.violations);
    });
    if (this.nextValidator) {
      const validator = this.nextValidator;
      validationChain = validationChain.then(
        result => {
          return validator.validatePath(result, path, ctx);
        }
      );
    }
    if (this.localNextValidator) {
      const validator = this.localNextValidator;
      validationChain = validationChain.then(
        result => {
          return validator.validatePath(result, path, ctx);
        }
      );
    }
    return validationChain;
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

interface ObjectValidationContext {
  readonly path: Path;
  readonly ctx: ValidationContext;
  readonly filter: PropertyFilter;
  readonly convertedObject: any;
  violations: Violation[];
}

function validateProperty(key: string, currentValue: any, validator: Validator, context: ObjectValidationContext) {
  if (!context.filter(key)) {
    return Promise.resolve();
  }
  // Assign for property order
  context.convertedObject[key] = undefined;
  const propertyPath = context.path.property(key);
  return validator.validatePath(currentValue, propertyPath, context.ctx).then(
    (result) => {
      if (result !== undefined) {
        context.convertedObject[key] = result;
      } else {
        delete context.convertedObject[key];
      }
      return result;
    },
    (error) => {
      delete context.convertedObject[key];
      context.violations = context.violations.concat(violationsOf(error, propertyPath));
      return Promise.reject(context.violations);
    }
  );
}

async function validateAdditionalProperty(
  key: string,
  originalValue: any,
  additionalProperties: MapEntryValidator[],
  context: ObjectValidationContext,
): Promise<any> {
  if (!context.filter(key)) {
    return Promise.resolve();
  }
  const path = context.path.property(key);
  let currentValue = originalValue;
  let validKey = false;
  let keyViolations: undefined | Violation[];
  for (let i = 0; i < additionalProperties.length; i++) {
    const entryValidator = additionalProperties[i];
    try {
      await entryValidator.keyValidator.validatePath(key, path, context.ctx);
      validKey = true;
      try {
        currentValue = await validateProperty(key, currentValue, entryValidator.valueValidator, context);
      } catch (error) {
        return Promise.reject(violationsOf(error, path));
      }
    } catch (error) {
      keyViolations = violationsOf(error, path);
    }
  }
  if (!validKey) {
    if (additionalProperties.length == 1 && keyViolations) {
      // Only one kind of key accepted -> give out violations related to that
      context.violations = context.violations.concat(keyViolations);
    } else {
      return validateProperty(key, originalValue, lenientUnknownPropertyValidator, context);
    }
  }
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

export const lenientUnknownPropertyValidator = new ValidatorFnWrapper((value: any, path: Path, ctx: ValidationContext) =>
  ctx.failure(defaultViolations.unknownProperty(path), value));

export const strictUnknownPropertyValidator = new ValidatorFnWrapper((value: any, path: Path, ctx: ValidationContext) => 
  Promise.reject(defaultViolations.unknownPropertyDenied(path)));

const allowAllMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: new AnyValidator(),
});

const allowNoneMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: strictUnknownPropertyValidator,
});
