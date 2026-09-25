import { Path } from "@finnair/path";
import { ArrayValidator, FailureCallback, StringValidator, SuccessCallback, TypeMismatch, ValidationContext, Validator } from "./validators.js";
import { ObjectValidator } from "./objectValidator.js";

export type JsonPrimitive = string | boolean | number | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = {
    [key: string]: JsonValue;
};

export type JsonValueType = "string" | "boolean" | "number" | "null" | "array" | "object";

const ALL_JSON_VALUE_TYPES: readonly JsonValueType[] = ["string", "boolean", "number", "null", "array", "object"];

/** Deduplicated `allow` in canonical order. */
function normalizeTypes(allow: readonly JsonValueType[]): JsonValueType[] {
  for (const type of allow) {
    if (!ALL_JSON_VALUE_TYPES.includes(type)) {
      throw new Error(`JsonValueValidator: unknown type ${type}`);
    }
  }
  return ALL_JSON_VALUE_TYPES.filter(type => allow.includes(type));
}

/** At most one instance per combination of types, of which there are 63. */
const jsonValueValidators = new Map<string, JsonValueValidator>();

/**
 * A shared {@link JsonValueValidator} allowing `allow` at the root, or any JSON value when `allow`
 * is empty. The validator is fully defined by its types, so equal combinations return the same instance.
 */
export function jsonValue(...allow: JsonValueType[]): JsonValueValidator {
  const types = allow.length === 0 ? ALL_JSON_VALUE_TYPES : normalizeTypes(allow);
  const key = types.join(',');
  let validator = jsonValueValidators.get(key);
  if (validator === undefined) {
    validator = new JsonValueValidator(types);
    jsonValueValidators.set(key, validator);
  }
  return validator;
}

/**
 * Accepts a JSON value and returns a clone of it. `allow` restricts the type of the root value only;
 * nested values may be of any JSON type.
 */
export class JsonValueValidator extends Validator<JsonValue, unknown> {
  private readonly objectValidator: Validator<JsonObject, unknown>;
  private readonly arrayValidator: Validator<JsonValue[], unknown>;
  private readonly allowedTypes: ReadonlySet<JsonValueType>;
  private readonly allowedTypesDescription: string;
  constructor(allow: readonly JsonValueType[] = ALL_JSON_VALUE_TYPES) {
    super();
    this.allowedTypes = new Set(normalizeTypes(allow));
    if (this.allowedTypes.size === 0) {
      throw new Error('JsonValueValidator: allow must contain at least one type');
    }
    this.allowedTypesDescription = Array.from(this.allowedTypes).join(", ");
    const nested = this.allowedTypes.size === ALL_JSON_VALUE_TYPES.length ? this : jsonValue();
    this.objectValidator = new ObjectValidator<JsonObject, unknown>({
      additionalProperties: { keys: new StringValidator(), values: nested },
    });
    this.arrayValidator = new ArrayValidator<JsonValue>(nested);
    Object.freeze(this);
  }
  supportsFreeze(): boolean {
    return true;
  }
  dependsOnFreezeContext(): boolean {
    return this.allowedTypes.has("array") || this.allowedTypes.has("object");
  }
  validatePathV2(value: unknown, path: Path, ctx: ValidationContext, success: SuccessCallback<JsonValue>, failure: FailureCallback): void {
    switch(typeof value) {
      case "string":
        if (this.allowedTypes.has("string")) {
          return success(value);
        } else {
          return failure(this.typeMismatch(path, value));
        }
      case "boolean":
        if (this.allowedTypes.has('boolean')) {
          return success(value);
        } else {
          return failure(this.typeMismatch(path, value));
        }
      case "number":
        // NaN and Infinity have no JSON representation.
        if (Number.isFinite(value) && this.allowedTypes.has('number')) {
          return success(value);
        } else {
          return failure(this.typeMismatch(path, value));
        }
      case "object":
        // null
        if (value === null) {
          if (this.allowedTypes.has("null")) {
            return success(null);
          } else {
            return failure(this.typeMismatch(path, value));
          }
        } 
        // array
        else if (Array.isArray(value)) {
          if (this.allowedTypes.has("array")) {
            return this.arrayValidator.validatePathV2(value, path, ctx, success, failure);
          } else {
            return failure(this.typeMismatch(path, value));
          }
        }
        // object
        else if (isPlainObject(value)) {
          if (this.allowedTypes.has("object")) {
            return this.objectValidator.validatePathV2(value, path, ctx, success, failure);
          } else {
            return failure(this.typeMismatch(path, value));
          }
        }
    }
    return failure(this.typeMismatch(path, value));
  }
  private typeMismatch(path: Path, value: unknown): TypeMismatch {
    return new TypeMismatch(path, this.allowedTypesDescription, value);
  }
}

export function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}
