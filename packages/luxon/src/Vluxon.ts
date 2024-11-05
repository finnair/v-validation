import { ValidationContext, isNullOrUndefined, defaultViolations, isString, V, Validator, ValidationResult, TypeMismatch } from '@finnair/v-validation';
import { Path } from '@finnair/path';
import { DateTime, DateTimeJSOptions, DateTimeOptions, Duration, FixedOffsetZone } from 'luxon';
import {
  LocalDateLuxon,
  DateTimeLuxon,
  DateTimeMillisLuxon,
  DateTimeMillisUtcLuxon,
  DateTimeUtcLuxon,
  LuxonDateTime,
  LocalTimeLuxon,
  LocalDateTimeLuxon,
} from './luxon.js';

export type LuxonInput = string | DateTime | LuxonDateTime;

export interface DateTimeParams {
  type: string;
  pattern: RegExp;
  parser: (value: string, match: RegExpExecArray) => DateTime;
}

export interface ValidateLuxonParams<Out extends LuxonDateTime> extends DateTimeParams {
  proto: new (...args:any[]) => Out;
}

export class DateTimeValidator extends Validator<DateTime> {
  constructor(public readonly params: DateTimeParams) {
    super();
    Object.freeze(params);
    Object.freeze(this);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<DateTime>> {
    const params = this.params;
    if (isNullOrUndefined(value)) {
      return ctx.failurePromise(defaultViolations.notNull(path), value);
    }
    if (DateTime.isDateTime(value)) {
      if (value.isValid) {
        return ctx.successPromise(value as DateTime);
      }
    } else if (isString(value)) {
      const match = params.pattern.exec(value);
      if (match) {
        const dateTime = params.parser(value, match);
        if (dateTime.isValid) {
          return ctx.successPromise(dateTime);
        }
      }
    }
    return ctx.failurePromise(defaultViolations.date(value, path, params.type), value);
  }
}

export class LuxonValidator<Out extends LuxonDateTime> extends Validator<Out> {
  private readonly dateTimeValidator: DateTimeValidator;
  constructor(public readonly params: ValidateLuxonParams<Out>) {
    super();
    this.dateTimeValidator = new DateTimeValidator(params);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult<Out>> {
    if (value instanceof this.params.proto) {
      return ctx.successPromise(value);
    }
    return this.dateTimeValidator.validatePath(value, path, ctx).then((result: ValidationResult<DateTime>) => {
      if (result.isSuccess()) {
        return ctx.successPromise(new this.params.proto(result.getValue()));
      } else {
        return ctx.failurePromise(result.getViolations(), value);
      }
    });
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function localDate(options: DateTimeOptions = { setZone: true }) {
  return new LuxonValidator({
    type: 'Date',
    proto: LocalDateLuxon,
    pattern: datePattern,
    parser: (value: string) => DateTime.fromISO(value, { zone: FixedOffsetZone.utcInstance }),
  });
}

const timePattern = /^\d{2}:\d{2}:\d{2}$/;

function localTime(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return new LuxonValidator({
    type: 'Time',
    proto: LocalTimeLuxon,
    pattern: timePattern,
    parser: (value: string) => DateTime.fromISO(value, options),
  });
}

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function localDateTime(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return new LuxonValidator({
    type: 'DateTime',
    proto: LocalDateTimeLuxon,
    pattern: localDateTimePattern,
    parser: (value: string) => DateTime.fromISO(value, options),
  });
}

const dateTimeTzPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function dateTime(options: DateTimeOptions = { setZone: true }) {
  return new LuxonValidator({
    type: 'DateTime',
    proto: DateTimeLuxon,
    pattern: dateTimeTzPattern,
    parser: (value: string) => DateTime.fromISO(value, options),
  });
}

function dateTimeUtc(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return new LuxonValidator({
    type: 'DateTime',
    proto: DateTimeUtcLuxon,
    pattern: dateTimeTzPattern,
    parser: (value: string) => DateTime.fromISO(value, options),
  });
}

const dateTimeMillisPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function dateTimeMillis(options: DateTimeOptions = { setZone: true }) {
  return new LuxonValidator<DateTimeMillisLuxon>({
    type: 'DateTimeMillis',
    proto: DateTimeMillisLuxon,
    pattern: dateTimeMillisPattern,
    parser: (value: string) => DateTime.fromISO(value, options),
  });
}

function dateTimeMillisUtc<DateTimeMillisUtcLuxon>(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return new LuxonValidator({
    type: 'DateTimeMillis',
    proto: DateTimeMillisUtcLuxon,
    pattern: dateTimeMillisPattern,
    parser: (value: string) => DateTime.fromISO(value, options),
  });
}

function dateTimeFromISO(options: DateTimeOptions = { setZone: true }) {
  return new DateTimeValidator({
    type: 'ISODateTime',
    pattern: /./,
    parser: (value: string) => DateTime.fromISO(value, options),
  });
}

function dateTimeFromRFC2822(options: DateTimeOptions = { setZone: true }) {
  return new DateTimeValidator({
    type: 'RFC2822DateTime',
    pattern: /./,
    parser: (value: string) => DateTime.fromRFC2822(value, options),
  });
}

function dateTimeFromHTTP(options: DateTimeOptions = { setZone: true }) {
  return new DateTimeValidator({
    type: 'HTTPDateTime',
    pattern: /./,
    parser: (value: string) => DateTime.fromHTTP(value, options),
  });
}

function dateTimeFromSQL(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return new DateTimeValidator({
    type: 'SQLDateTime',
    pattern: /./,
    parser: (value: string) => DateTime.fromSQL(value, options),
  });
}

export interface ValidateLuxonNumberParams {
  value: any;
  path: Path;
  ctx: ValidationContext;
  type: string;
  parser: (value: number) => DateTime;
}

export async function validateLuxonNumber({ value, path, ctx, type, parser }: ValidateLuxonNumberParams): Promise<ValidationResult> {
  if (isNullOrUndefined(value)) {
    return ctx.failure(defaultViolations.notNull(path), value);
  } else if (DateTime.isDateTime(value)) {
    if (value.isValid) {
      return ctx.success(value);
    }
  } else if (typeof value === 'number' && !Number.isNaN(value)) {
    const dateTime = parser(value);
    if (dateTime.isValid) {
      return ctx.success(dateTime);
    }
  }
  return ctx.failure(defaultViolations.date(value, path, type), value);
}

function dateTimeFromMillis(options: DateTimeJSOptions = { zone: FixedOffsetZone.utcInstance }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxonNumber({
      value,
      path,
      ctx,
      type: 'MillisDateTime',
      parser: value => DateTime.fromMillis(value, options),
    }),
  );
}

function dateTimeFromSeconds(options: DateTimeJSOptions = { zone: FixedOffsetZone.utcInstance }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxonNumber({
      value,
      path,
      ctx,
      type: 'SecondsDateTime',
      parser: value => DateTime.fromSeconds(value, options),
    }),
  );
}

const durationPattern =
  /^P(?!$)(\d+(?:\.\d+)?Y)?(\d+(?:\.\d+)?M)?(\d+(?:\.\d+)?W)?(\d+(?:\.\d+)?D)?(T(?=\d)(\d+(?:\.\d+)?H)?(\d+(?:\.\d+)?M)?(\d+(?:\.\d+)?S)?)?$/;

export class DurationValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    } else if (Duration.isDuration(value)) {
      return ctx.success(value);
    } else if (isString(value) && durationPattern.test(value)) {
      const duration = Duration.fromISO(value);
      if (duration.isValid) {
        return ctx.success(duration);
      }
    }
    return ctx.failure(new TypeMismatch(path, 'Duration', value), value);
  }
}

export class TimeDurationValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    } else if (Duration.isDuration(value)) {
      return ctx.success(value);
    } else if (isString(value)) {
      const duration = Duration.fromISOTime(value);
      if (duration.isValid) {
        return ctx.success(duration);
      }
    }
    return ctx.failure(new TypeMismatch(path, 'TimeDuration', value), value);
  }
}

export const Vluxon = {
  // DateTime wrapper validators
  localDate,
  localTime,
  localDateTime,
  dateTime,
  dateTimeUtc,
  dateTimeMillis,
  dateTimeMillisUtc,
  // Plain DateTime validators
  dateTimeFromISO,
  dateTimeFromRFC2822,
  dateTimeFromHTTP,
  dateTimeFromSQL,
  dateTimeFromSeconds,
  dateTimeFromMillis,
  duration: () => new DurationValidator(),
  timeDuration: () => new TimeDurationValidator(),
};
Object.freeze(Vluxon);
