import { ValidationContext, isNullOrUndefined, defaultViolations, isString, V, Validator, ValidationResult, TypeMismatch } from '@finnair/v-validation';
import { Path } from '@finnair/path';
import { DateTime, DateTimeJSOptions, DateTimeOptions, Duration, FixedOffsetZone } from 'luxon';
import { LocalDateLuxon, DateTimeLuxon, DateTimeMillisLuxon, DateTimeMillisUtcLuxon, DateTimeUtcLuxon, LuxonDateTime, LocalTimeLuxon } from './luxon';

export type LuxonInput = string | DateTime | LuxonDateTime;

export interface ValidateLuxonParams {
  value: any;
  path: Path;
  ctx: ValidationContext;
  type: string;
  pattern: RegExp;
  proto?: any;
  parser: (value: string, match: RegExpExecArray) => DateTime;
}

export function validateLuxon({ value, path, ctx, type, proto, pattern, parser }: ValidateLuxonParams): PromiseLike<ValidationResult> {
  if (isNullOrUndefined(value)) {
    return ctx.failurePromise(defaultViolations.notNull(path), value);
  }
  if (proto && value instanceof proto) {
    return ctx.successPromise(value);
  } else if (DateTime.isDateTime(value)) {
    if (value.isValid) {
      return success(value);
    }
  } else if (isString(value)) {
    const match = pattern.exec(value);
    if (match) {
      const dateTime = parser(value, match);
      if (dateTime.isValid) {
        return success(dateTime);
      }
    }
  }
  return ctx.failurePromise(defaultViolations.date(value, path, type), value);

  function success(dateTime: DateTime) {
    return ctx.successPromise(proto ? new proto(dateTime) : dateTime);
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function localDate(options: DateTimeOptions = { setZone: true }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'Date',
      proto: LocalDateLuxon,
      pattern: datePattern,
      parser: (value: string) => DateTime.fromISO(value, { zone: FixedOffsetZone.utcInstance }),
    }),
  );
}

const timePattern = /^\d{2}:\d{2}:\d{2}$/;

function localTime(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'Time',
      proto: LocalTimeLuxon,
      pattern: timePattern,
      parser: (value: string) => DateTime.fromISO(value, options),
    }),
  );
}

const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function dateTime(options: DateTimeOptions = { setZone: true }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'DateTime',
      proto: DateTimeLuxon,
      pattern: dateTimePattern,
      parser: (value: string) => DateTime.fromISO(value, options),
    }),
  );
}

function dateTimeUtc(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'DateTime',
      proto: DateTimeUtcLuxon,
      pattern: dateTimePattern,
      parser: (value: string) => DateTime.fromISO(value, options),
    }),
  );
}

const dateTimeMillisPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function dateTimeMillis(options: DateTimeOptions = { setZone: true }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'DateTimeMillis',
      proto: DateTimeMillisLuxon,
      pattern: dateTimeMillisPattern,
      parser: (value: string) => DateTime.fromISO(value, options),
    }),
  );
}

function dateTimeMillisUtc(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'DateTimeMillis',
      proto: DateTimeMillisUtcLuxon,
      pattern: dateTimeMillisPattern,
      parser: (value: string) => DateTime.fromISO(value, options),
    }),
  );
}

function dateTimeFromISO(options: DateTimeOptions = { setZone: true }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'ISODateTime',
      pattern: /./,
      parser: (value: string) => DateTime.fromISO(value, options),
    }),
  );
}

function dateTimeFromRFC2822(options: DateTimeOptions = { setZone: true }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'RFC2822DateTime',
      pattern: /./,
      parser: (value: string) => DateTime.fromRFC2822(value, options),
    }),
  );
}

function dateTimeFromHTTP(options: DateTimeOptions = { setZone: true }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'HTTPDateTime',
      pattern: /./,
      parser: (value: string) => DateTime.fromHTTP(value, options),
    }),
  );
}

function dateTimeFromSQL(options: DateTimeOptions = { zone: FixedOffsetZone.utcInstance }) {
  return V.fn((value: any, path: Path, ctx: ValidationContext) =>
    validateLuxon({
      value,
      path,
      ctx,
      type: 'SQLDateTime',
      pattern: /./,
      parser: (value: string) => DateTime.fromSQL(value, options),
    }),
  );
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

export const Vluxon = {
  // DateTime wrapper validators
  localDate,
  localTime,
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
};
Object.freeze(Vluxon);
