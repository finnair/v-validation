import {
  Validator,
  ValidationContext,
  ValidationResult,
  isNullOrUndefined,
  defaultViolations,
  isString,
  Violation,
  TypeMismatch,
} from './validators.js';
import {
  ObjectValidator,
  PropertyModel,
  MapEntryModel,
  ObjectModel,
} from './objectValidator.js';
import { Path } from '@finnair/path';

export interface DiscriminatorFn {
  (value: any): string;
}

export type Discriminator = string | DiscriminatorFn;

export interface SchemaModel {
  readonly discriminator: Discriminator;
  readonly models: { [name: string]: Validator | ClassModel };
}

export type ClassParentModel = string | ObjectValidator | (string | ObjectValidator)[];

export interface ClassModel {
  readonly extends?: ClassParentModel;
  readonly localProperties?: PropertyModel;
  readonly properties?: PropertyModel;
  readonly additionalProperties?: boolean | MapEntryModel | MapEntryModel[];
  readonly next?: Validator;
  readonly localNext?: Validator;
}

export class ModelRef extends Validator {
  constructor(private schema: SchemaValidator, public readonly name: string) {
    super();
    Object.freeze(this);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return this.schema.validateClass(value, path, ctx, this.name);
  }
}

export class DiscriminatorViolation extends Violation {
  constructor(path: Path, value: any, public readonly expectedOneOf: string[]) {
    super(path, 'Discriminator', value);
  }
}

export class SchemaValidator extends Validator {
  public readonly discriminator: Discriminator;

  private readonly proxies = new Map<string, Validator>();

  private readonly validators: { [name: string]: Validator } = {};

  constructor(fn: (schema: SchemaValidator) => SchemaModel) {
    super();
    const schema = fn(this);
    for (const name of this.proxies.keys()) {
      if (!schema.models[name]) {
        throw new Error('Undefined named model: ' + name);
      }
    }
    this.discriminator = schema.discriminator;
    this.compileSchema(schema.models, new Set<string>());

    Object.freeze(this.validators);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> {
    return this.validateClass(value, path, ctx);
  }

  validateClass(value: any, path: Path, ctx: ValidationContext, expectedType?: string): PromiseLike<any> {
    if (isNullOrUndefined(value)) {
      return Promise.reject(defaultViolations.notNull(path));
    }
    // 1) Validate discriminator
    let type: string;
    let typePath: Path = path;
    if (isString(this.discriminator)) {
      type = value[this.discriminator as string];
      typePath = path.property(this.discriminator as string);
    } else {
      type = (this.discriminator as DiscriminatorFn)(value);
    }
    const validator = this.validators[type];
    if (!validator) {
      return Promise.reject(new DiscriminatorViolation(typePath, type, Object.keys(this.validators)));
    }

    // 2) Validate that the type is assignable to the expected type (polymorphism)
    if (expectedType) {
      const expectedParent = this.validators[expectedType];
      if (!this.isSubtypeOf(validator, expectedParent)) {
        return Promise.reject(new TypeMismatch(path, expectedType, type));
      }
    }

    // 3) Validate value
    return validator.validatePath(value, path, ctx);
  }

  of(name: string): Validator {
    if (!this.proxies.has(name)) {
      if (this.discriminator && !this.validators[name]) {
        throw new Error(`Unknown model: ${name}`);
      }
      this.proxies.set(name, new ModelRef(this, name));
    }
    return this.proxies.get(name)!;
  }

  raw(name: string): Validator {
    if (!this.validators[name]) {
      throw new Error(`Validator not found: ${name}`);
    }
    return this.validators[name]!;
  }

  private isSubtypeOf(validator: Validator, expectedParent: Validator): boolean {
    // Either validator is expectedParent itself...
    if (validator === expectedParent) {
      return true;
    }
    // ...or it extends the expectedParent
    if (validator instanceof ObjectValidator) {
      return validator.parentValidators.some(parent => this.isSubtypeOf(parent, expectedParent));
    }
    return false;
  }

  private compileSchema(models: { [name: string]: Validator | ClassModel }, seen: Set<string>) {
    for (const name in models) {
      this.compileClass(name, models, seen);
    }
  }

  private compileClass(name: string, models: { [name: string]: Validator | ClassModel }, seen: Set<string>): Validator {
    if (seen.has(name)) {
      if (this.validators[name]) {
        return this.validators[name];
      }
      throw new Error(`Cyclic dependency: ${name}`);
    }
    seen.add(name);

    let validator: Validator;
    if (models[name] instanceof Validator) {
      validator = models[name] as Validator;
    } else {
      const classModel = models[name] as ClassModel;
      const localProperties = classModel.localProperties || {};
      if (isString(this.discriminator)) {
        const discriminatorProperty: string = this.discriminator as string;
        if (!localProperties[discriminatorProperty]) {
          localProperties[discriminatorProperty] = name;
        }
      }
      const model: ObjectModel = {
        extends: this.getParentValidators(classModel.extends, models, seen),
        properties: classModel.properties,
        additionalProperties: classModel.additionalProperties,
        localProperties,
        next: classModel.next,
        localNext: classModel.localNext,
      };
      validator = new ObjectValidator(model);
    }
    this.validators[name] = validator;
    return validator;
  }

  getParentValidators(parents: undefined | ClassParentModel, models: { [name: string]: Validator | ClassModel }, seen: Set<string>): ObjectValidator[] {
    let parentValidators: any = [];
    if (parents) {
      parentValidators = parentValidators.concat(parents);
    }
    return parentValidators.map((nameOrValidator: any) => {
      let parent: Validator;
      if (isString(nameOrValidator)) {
        parent = this.compileClass(nameOrValidator as string, models, seen);
      } else {
        parent = nameOrValidator as Validator;
      }
      if (!(parent instanceof ObjectValidator)) {
        throw new Error(`Illegal inheritance: objects may only inherit from other objects (ObjectValidators)`);
      }
      return parent as ObjectValidator;
    });
  }
}
