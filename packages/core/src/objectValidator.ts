import { default as deepEqual } from 'fast-deep-equal';
import { Path, getProperty, setOwnProperty } from "@finnair/path";
import {
  AnyValidator,
  CompositionParameters,
  configurationErrorOf,
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
  ValidatorVisitor,
  ValidatorVisitorContext,
  ValidatorType,
  Violation,
  violationsOf,
} from "./validators.js";

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
   * Preprocessing of the whole input object before its properties are validated, e.g. to migrate old
   * data by renaming properties. Inherited: parents' `pre` validators run first, in inheritance order,
   * and each one only once even when inherited through several parents.
   *
   * NOTE: A `pre` validator must not modify its input; return a new object instead. Violations of the
   * properties validated after it refer to the preprocessed object, e.g. to a renamed property.
   */
  readonly pre?: Validator | Validator[];
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

  /** Own and inherited `pre` validators in execution order, without duplicates. */
  public readonly preValidators: readonly Validator[];

  public readonly propertyOrder?: string[];

  private readonly validator: Validator<LocalType, In>;

  /** A frozen snapshot of the model this validator was constructed of, see {@link snapshotModel}. */
  public readonly model: ObjectModel<LocalType, InheritableType>;

  constructor(model: ObjectModel<LocalType, InheritableType>) {
    super();
    model = snapshotModel(model);
    this.model = model;
    let properties: Properties = {};
    let additionalProperties: MapEntryValidator[] = [];
    let parentNextValidators: Validator[] = [];
    let nextValidators: Validator[] = [];
    const preValidators: Validator[] = [];
    const addPreValidator = (validator: Validator) => {
      if (!preValidators.includes(validator)) {
        preValidators.push(validator);
      }
    };

    this.parentValidators = model.extends ? ([] as ObjectValidator[]).concat(model.extends) : [];
    for (let i = 0; i < this.parentValidators.length; i++) {
      const parent = this.parentValidators[i];
      additionalProperties = additionalProperties.concat(parent.additionalProperties);
      properties = mergeProperties(parent.properties, properties);
      parent.preValidators.forEach(addPreValidator);
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

    if (model.pre) {
      ([] as Validator[]).concat(model.pre).forEach(addPreValidator);
    }
    this.preValidators = preValidators;

    const propertiesValidator = new PropertiesValidator<LocalType, In>(this.properties, this.localProperties, this.additionalProperties, this.propertyOrder);
    let validator: Validator;
    if (preValidators.length > 0) {
      validator = maybeCompositionOf(...preValidators as CompositionParameters).next(propertiesValidator);
    } else {
      validator = propertiesValidator;
    }
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
    Object.freeze(this.preValidators);
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this.validator.supportsFreeze();
  }

  dependsOnFreezeContext(): boolean {
    return true;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack: Validator<any, any>[] = []) {
    if (visitor.accept(this, path, context)) {
      if (stack.includes(this)) {
        return;
      }
      stack.push(this);
      this.validator.visit(visitor, path, context, stack);
      stack.pop();
    }
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<LocalType>, failure: FailureCallback): void {
    const successFn = ctx.freeze
      ? (result: LocalType) => {
          Object.freeze(result);
          success(result);
        }
      : success;
    if (this.preValidators.length > 0 && value !== null && typeof value === 'object') {
      // A pre validator may return a new object whose properties still reference the original input,
      // so cycle detection must register the original: PropertiesValidator only sees the new object.
      if (ctx.enterValidation(value, path)) {
        return failure([defaultViolations.cycle(path)]);
      }
      return this.validator.validatePathV2(value, path, ctx,
        (result) => {
          ctx.leaveValidation(value, path);
          successFn(result);
        },
        (violations) => {
          ctx.leaveValidation(value, path);
          failure(violations);
        });
    }
    this.validator.validatePathV2(value, path, ctx, successFn, failure);
  }

  /**
   * A copy of this validator with `validators` appended to its own `pre` validators, see {@link ObjectModel.pre}.
   */
  pre(...validators: Validator[]): ObjectValidator<LocalType, InheritableType, In> {
    const pre = this.model.pre === undefined ? [] : ([] as Validator[]).concat(this.model.pre);
    return new ObjectValidator<LocalType, InheritableType, In>({ ...this.model, pre: [...pre, ...validators] });
  }

  omit<T, K extends keyof (any & (InheritableType | LocalType))>(...keys: K[]) {
    return new ObjectValidator<Omit<LocalType, K extends keyof LocalType ? K : never>, Omit<InheritableType, K extends keyof InheritableType ? K : never>>({
      pre: [...this.preValidators],
      properties: pick(this.properties, key => !keys.includes(key as any)),
      localProperties: pick(this.localProperties, key => !keys.includes(key as any)),
      propertyOrder: this.propertyOrder?.filter(key => !keys.includes(key as any)),
    });
  }

  pick<T, K extends keyof (any & (InheritableType | LocalType))>(...keys: K[]) {
    return new ObjectValidator<Pick<LocalType, K extends keyof LocalType ? K : never>, Pick<InheritableType, K extends keyof InheritableType ? K : never>>({
      pre: [...this.preValidators],
      properties: pick(this.properties, key => keys.includes(key as any)),
      localProperties: pick(this.localProperties, key => keys.includes(key as any)),
      propertyOrder: this.propertyOrder?.filter(key => keys.includes(key as any)),
    });
  }
}

class PropertiesValidator<LocalType = unknown, In = unknown> extends Validator<LocalType, In> {
  private readonly _supportsFreeze: boolean;
  private readonly validationOrder: Set<string>;
  constructor(readonly properties: Properties, readonly localProperties: Properties, readonly additionalProperties: MapEntryValidator[], propertyOrder?: string[]) {
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
    this.validationOrder = validationOrder;
    this._supportsFreeze = 
      Object.values(this.properties).every(value => value.supportsFreeze())
      && Object.values(this.localProperties).every(value => value.supportsFreeze())
      && this.additionalProperties.every(value => value.keyValidator.supportsFreeze() && value.valueValidator.supportsFreeze());

    Object.freeze(this.properties);
    Object.freeze(this.localProperties);
    Object.freeze(this.additionalProperties);
    Object.freeze(this.validationOrder);
    Object.freeze(this);
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack: Validator<any, any>[] = []) {
    if (visitor.accept(this, path, context)) {
      Object.entries(this.properties).forEach(([key, validator]) => {
        validator.visit(visitor, path.property(key), new ValidatorVisitorContext('property'), stack);
      });
      Object.entries(this.localProperties).forEach(([key, validator]) => {
        validator.visit(visitor, path.property(key), new ValidatorVisitorContext('localProperty'), stack);
      });
      this.additionalProperties.forEach((entry) => {
        entry.keyValidator.visit(visitor, path.property('*'), new ValidatorVisitorContext('additionalProperties: key'), stack);
        entry.valueValidator.visit(visitor, path.property('*'), new ValidatorVisitorContext('additionalProperties: value'), stack);
      });
    }
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<LocalType>, failure: FailureCallback): void {
    if (value === null || value === undefined) {
      return failure([defaultViolations.notNull(path)]);
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return failure([defaultViolations.object(path)]);
    }
    const anyValue = value as any;
    const convertedObject: any = {} as LocalType;
    let violations: Violation[] = [];
    let expectedResponses = 1;

    // Cycle detection: a value that references itself through its properties would recurse forever.
    // Register this value at the current path before descending and clear it once we settle; re-entry
    // of the same value at a descendant path is a cycle. See ValidationContext.enterValidation.
    if (ctx.enterValidation(anyValue, path)) {
      return failure([defaultViolations.cycle(path)]);
    }

    const reportResult = () => {
      if (--expectedResponses === 0) {
        ctx.leaveValidation(anyValue, path);
        if (violations.length > 0) {
          failure(violations);
        } else {
          success(convertedObject as LocalType);
        }
      }
    };

    const reportSuccess = (key: string, propertyValue: unknown) => {
      if (propertyValue !== undefined) {
        setOwnProperty(convertedObject, key, propertyValue);
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
          if (Object.hasOwn(this.localProperties, key)) {
            validateLocalProperty(key, result, propertyPath);
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
          (keyError) => {
            if (configurationErrorOf(violationsOf(keyError, propertyPath))) {
              return reportFailure(key, keyError);
            }
            validateAdditionalProperty(key, propertyValue, propertyPath, index + 1, keySuccessCount, keyError);
          }
        );
      } else if (keySuccessCount === 0) {
        ctx.unknownProperty(propertyValue, propertyPath,
          (result) => reportSuccess(key, result),
          (error) => {
            const violations = violationsOf(error, propertyPath);
            // A plain rejection is better explained by why the key did not match; a handler's own violations are kept.
            if (index === 1 && keyError && violations.length === 1 && violations[0].type === ValidatorType.UnknownProperty) {
              reportFailure(key, keyError);
            } else {
              reportFailure(key, violations);
            }
          }
        );
      } else {
        reportSuccess(key, propertyValue);
      }
    };

    const validateKey = (key: string) => {
      setOwnProperty(convertedObject, key, undefined);
      const valuePath = path.property(key);
      const propertyValue = getProperty(anyValue, key);
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
    };
    for (const key of this.validationOrder) {
      expectedResponses++;
      validateKey(key);
    }
    for (const key in anyValue) {
      if (!this.validationOrder.has(key)) {
        expectedResponses++;
        validateKey(key);
      }
    }
    reportResult();
  }
}

function pick(properties: Properties, fn: (key: keyof any) => boolean): Properties {
  return Object.entries(properties).reduce((current: Properties, [key, validator]) => {
    if (fn(key)) {
      setOwnProperty(current, key, validator);
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
        setOwnProperty(to, key, from[key]);
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
  validatePathV2(value: InOut, path: Path, ctx: ValidationContext, success: SuccessCallback<undefined | InOut | {}>, failure: FailureCallback): void {
    if (value === undefined) {
      return success(undefined);
    }
    if (typeof value !== 'object' || value === null) {
      const object: any = {};
      setOwnProperty(object, this.property, value);
      return success(object);
    }
    return success(value);
  }
}

/**
 * Renames or drops properties of an object, e.g. in `ObjectModel.pre` to migrate deprecated keys of a
 * `Record<Enum, Value>`. A property whose key maps to `undefined` is dropped, and properties not in
 * `mapping` are kept. A renamed property keeps its position. Non-objects are passed on unchanged, as
 * is an object without any property to rename.
 *
 * Renaming into a property that exists, or several properties into the same one, merges them when their
 * values are deepEqual (e.g. old and new key written together during a migration), keeping the existing
 * property, or the first renamed one, and is otherwise a `PropertyConflict` violation at the renamed key.
 *
 * Renaming must be idempotent, as migrated data is validated again, e.g. after it has been written
 * back. So a key cannot be both renamed and renamed into: `a -> b, b -> a` would swap the properties on
 * every validation, and `a -> b, b -> c` move a value one step further.
 *
 * NOTE: Use it as `ObjectModel.pre`, which keeps cycle detection working on the original input. In e.g.
 * `V.compositionOf` before an object validator, cyclic input would be renamed into a new copy over and over.
 */
export class RenamePropertiesValidator extends Validator {
  public readonly mapping: Readonly<Record<string, string | number | undefined>>;
  private readonly sources: readonly string[];
  constructor(mapping: Record<string, string | number | undefined>) {
    super();
    this.mapping = Object.freeze({ ...mapping });
    this.sources = Object.freeze(Object.keys(this.mapping));
    for (const source of this.sources) {
      const target = this.mapping[source];
      if (target !== undefined && Object.hasOwn(this.mapping, String(target))) {
        throw new Error(`renameProperties: '${target}' is both renamed and renamed into, which is not idempotent`);
      }
    }
    Object.freeze(this);
  }

  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<unknown>, failure: FailureCallback): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return success(value);
    }
    const anyValue = value as any;
    // Typically the mapping has far fewer keys than the object
    if (!this.sources.some(source => source in anyValue)) {
      return success(value);
    }
    const keys: string[] = [];
    for (const key in anyValue) {
      keys.push(key);
    }
    const inputKeys = new Set(keys);
    const violations: Violation[] = [];
    const result: any = {};
    for (const key of keys) {
      if (!Object.hasOwn(this.mapping, key)) {
        setOwnProperty(result, key, getProperty(anyValue, key));
        continue;
      }
      const target = this.mapping[key];
      if (target === undefined) {
        continue;
      }
      const targetKey = String(target);
      const propertyValue = getProperty(anyValue, key);
      // A target is never renamed itself, so it is either kept from the input or set by an earlier rename
      if (inputKeys.has(targetKey) || Object.hasOwn(result, targetKey)) {
        const otherValue = inputKeys.has(targetKey) ? getProperty(anyValue, targetKey) : result[targetKey];
        if (!deepEqual(propertyValue, otherValue)) {
          violations.push(defaultViolations.propertyConflict(path.property(key)));
        }
        continue;
      }
      setOwnProperty(result, targetKey, propertyValue);
    }
    if (violations.length > 0) {
      return failure(violations);
    }
    success(result);
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

/**
 * A frozen copy of `model` and its containers, so that changing the original model or e.g. a builder
 * after constructing a validator does not change the validator's `model`, which `ObjectValidator.pre`
 * rebuilds from. A shallow copy is enough, as the contained validators are immutable. The original
 * objects are not frozen, as they are not the validator's own.
 */
function snapshotModel<LocalType, InheritableType>(model: ObjectModel<LocalType, InheritableType>): ObjectModel<LocalType, InheritableType> {
  const copyArray = <V>(value: V): V => (Array.isArray(value) ? (Object.freeze([...value]) as V) : value);
  const copyProperties = (properties?: PropertyModel) => {
    if (properties === undefined) {
      return undefined;
    }
    // for...in, like getPropertyValidators
    const copy: PropertyModel = {};
    for (const name in properties) {
      setOwnProperty(copy, name, properties[name]);
    }
    return Object.freeze(copy);
  };
  const copyMapEntry = (entry: MapEntryModel) => Object.freeze({ ...entry });
  const { additionalProperties } = model;
  return Object.freeze({
    ...model,
    extends: copyArray(model.extends),
    properties: copyProperties(model.properties),
    localProperties: copyProperties(model.localProperties),
    additionalProperties: Array.isArray(additionalProperties)
      ? Object.freeze(additionalProperties.map(copyMapEntry)) as MapEntryModel[]
      : typeof additionalProperties === 'object' ? copyMapEntry(additionalProperties) : additionalProperties,
    pre: copyArray(model.pre),
    next: copyArray(model.next),
    localNext: copyArray(model.localNext),
    propertyOrder: copyArray(model.propertyOrder),
  });
}

function getPropertyValidators(properties?: PropertyModel): Properties {
  const propertyValidators: Properties = {};
  if (properties) {
    for (const name in properties) {
      if (isString(properties[name]) || isNumber(properties[name])) {
        setOwnProperty(propertyValidators, name, new HasValueValidator(properties[name]));
      } else {
        setOwnProperty(propertyValidators, name, properties[name]);
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

/**
 * Value validator for additional properties. When `denied` it always rejects; otherwise it reports
 * an unknown property through `ctx.unknownProperty`, which applies `ignoreUnknownProperties`.
 */
class UnknownPropertyValidator extends Validator<any> {
  constructor(private readonly denied: boolean) {
    super();
    Object.freeze(this);
  }

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<any>, failure: FailureCallback): void {
    if (this.denied) {
      failure([defaultViolations.unknownPropertyDenied(path)]);
    } else {
      ctx.unknownProperty(value, path, success, failure);
    }
  }
}

export const lenientUnknownPropertyValidator = new UnknownPropertyValidator(false);

export const strictUnknownPropertyValidator = new UnknownPropertyValidator(true);

const allowAllMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: new AnyValidator(),
});

const allowNoneMapEntries: MapEntryValidator = new MapEntryValidator({
  keys: new AnyValidator(),
  values: strictUnknownPropertyValidator,
});
