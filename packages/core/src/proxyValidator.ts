import { Path } from '@finnair/path';
import { FailureCallback, SuccessCallback, ValidationContext, Validator, ValidatorConfigurationError, ValidatorVisitor, ValidatorVisitorContext, violationsOf } from './validators.js';

export interface ProxyValidatorFactory<Out = unknown, In = unknown> {
  (): Validator<Out, In>;
}

/**
 * Defers validator construction to a factory so that a validator can reference itself - e.g. a
 * recursive tree type, where the validator must be passed to its own definition. The factory is
 * called at most once, on first use, and the resulting validator is reused for later validations.
 *
 * NOTE: `supportsFreeze` cannot be delegated either, for the same reason, so it is asserted by the
 * caller instead: pass `supportsFreeze` when the proxied validator's whole subtree can be frozen.
 * The assertion is verified against the proxied validator once the factory has run, so a wrong one
 * fails on first validation rather than silently leaking a mutable value out of `V.frozen`. It fails
 * with a {@link ValidatorConfigurationError}, which propagates out of validation rather than being
 * reported as a violation of the data.
 *
 * NOTE: `skipUndefined` is deliberately *not* delegated to the proxied validator. It is called from
 * the `ObjectValidator` constructor, at which point the proxied validator does not exist yet, so
 * delegating would force the factory early and throw for the self-reference this class exists to
 * support. The inherited `false` is the safe direction - an optional property behind a proxy is
 * validated even when `undefined`, which the proxied optional validator handles correctly - but it
 * costs a needless call, so prefer wrapping the proxy in `V.optional`/`V.optionalStrict` over
 * proxying an already-optional validator.
 */
export class ProxyValidator<Out = unknown, In = unknown> extends Validator<Out, In> {
  private readonly _factory: ProxyValidatorFactory<Out, In>;
  private _validator?: Validator<Out, In>;

  constructor(
    factory: ProxyValidatorFactory<Out, In>,
    private readonly _supportsFreeze: boolean = false,
  ) {
    super();
    this._factory = factory;
  }

  supportsFreeze(): boolean {
    return this._supportsFreeze;
  }

  /** Cannot be known without forcing the factory, so assumed - proxies usually defer an object schema. */
  dependsOnFreezeContext(): boolean {
    return true;
  }

  visit(visitor: ValidatorVisitor, path: Path = Path.ROOT, context?: ValidatorVisitorContext, stack?: Validator<any, any>[]): void {
    if (visitor.accept(this, path, context)) {
      // NOTE: We only visit the proxied validator if it has already been created.
      // This avoids forcing the factory early, which could break self-references.
      this._validator?.visit(visitor, path, new ValidatorVisitorContext('proxy'), stack);
    }
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    let validator: Validator<Out, In>;
    try {
      validator = this.getValidator();
    } catch (error) {
      return failure(violationsOf(error, path));
    }
    return validator.validatePathV2(value, path, ctx, success, failure);
  }

  private getValidator(): Validator<Out, In> {
    if (this._validator === undefined) {
      // Verify before caching: assigning first would make the check fire only once, after which
      // every later validation would silently return an unfrozen value.
      const validator = this._factory();
      if (this._supportsFreeze && !validator.supportsFreeze()) {
        throw new ValidatorConfigurationError('proxy asserted supportsFreeze but the proxied validator does not support it');
      }
      this._validator = validator;
      Object.freeze(this);
    }
    return this._validator;
  }
}
