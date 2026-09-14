import { Path } from '@finnair/path';
import { FailureCallback, SuccessCallback, ValidationContext, Validator } from './validators.js';

export interface ProxyValidatorFactory<Out = unknown, In = unknown> {
  (): Validator<Out, In>;
}

/**
 * Defers validator construction to a factory so that a validator can reference itself - e.g. a
 * recursive tree type, where the validator must be passed to its own definition. The factory is
 * called at most once, on first use, and the resulting validator is reused for later validations.
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

  constructor(factory: ProxyValidatorFactory<Out, In>) {
    super();
    this._factory = factory;
  }

  validatePathV2(value: In, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    return this.getValidator().validatePathV2(value, path, ctx, success, failure);
  }

  private getValidator(): Validator<Out, In> {
    if (this._validator === undefined) {
      this._validator = this._factory();
      Object.freeze(this);
    }
    return this._validator;
  }
}
