import { ValidationContext, isNullOrUndefined, defaultViolations, isString, V, Validator, TypeMismatch, SyncPromise } from '@finnair/v-validation';
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
  proto: new (...args: any[]) => Out;
}

export class DateTimeValidator extends Validator<DateTime> {
  constructor(public readonly params: DateTimeParams) {
    super();
    Object.freeze(params);
    Object.freeze(this);
  }
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<DateTime> {
    return new SyncPromise((success: (value: DateTime) => void, failure: (error: any) => void) => {
      const params = this.params;
      if (isNullOrUndefined(value)) {
        failure(defaultViolations.notNull(path));
        return;
      }
      if (DateTime.isDateTime(value)) {
        if (value.isValid) {
          success(value as DateTime);
          return;
        }
      } else if (isString(value)) {
        const match = params.pattern.exec(value);
        if (match) {
          const dateTime = params.parser(value, match);
          if (dateTime.isValid) {
            success(dateTime);
            return;
          }
        }
      }
      failure(defaultViolations.date(value, path, params.type));
    });
  }
}

export class LuxonValidator<Out extends LuxonDateTime> extends Validator<Out> {
  private readonly dateTimeValidator: DateTimeValidator;
  constructor(public readonly params: ValidateLuxonParams<Out>) {
    super();
    this.dateTimeValidator = new DateTimeValidator(params);
    Object.freeze(this);
  }

  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<Out> {
    return new SyncPromise((success: (value: Out) => void, failure: (error: any) => void) => {
      if (value instanceof this.params.proto) {
        success(value);
      } else if (DateTime.isDateTime(value?.dateTime)) {
        success(new this.params.proto(value.dateTime));
      } else {
        this.dateTimeValidator.validatePath(value, path, ctx).then((result: DateTime) => success(new this.params.proto(result)), failure);
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

export async function validateLuxonNumber({ value, path, ctx, type, parser }: ValidateLuxonNumberParams): Promise<DateTime> {
  if (isNullOrUndefined(value)) {
    return Promise.reject(defaultViolations.notNull(path));
  } else if (DateTime.isDateTime(value)) {
    if (value.isValid) {
      return Promise.resolve(value);
    }
  } else if (typeof value === 'number' && !Number.isNaN(value)) {
    const dateTime = parser(value);
    if (dateTime.isValid) {
      return Promise.resolve(dateTime);
    }
  }
  return Promise.reject(defaultViolations.date(value, path, type));
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

export class DurationValidator extends Validator<Duration> {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<Duration> {
    return new SyncPromise((success: (value: Duration) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        return failure(defaultViolations.notNull(path));
      } else if (Duration.isDuration(value)) {
        return success(value);
      } else if (isString(value) && durationPattern.test(value)) {
        const duration = Duration.fromISO(value);
        if (duration.isValid) {
          return success(duration);
        }
      }
      return failure(new TypeMismatch(path, 'Duration', value));
    });
  }
}

export class TimeDurationValidator extends Validator<Duration> {
  validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<Duration> {
    return new SyncPromise((success: (value: Duration) => void, failure: (error: any) => void) => {
      if (isNullOrUndefined(value)) {
        return failure(defaultViolations.notNull(path));
      } else if (Duration.isDuration(value)) {
        return success(value);
      } else if (isString(value)) {
        const duration = Duration.fromISOTime(value);
        if (duration.isValid) {
          return success(duration);
        }
      }
      return failure(new TypeMismatch(path, 'TimeDuration', value));
    });
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
