import { ValidationContext, isNullOrUndefined, defaultViolations, isString, V, Validator, ValidationResult, TypeMismatch } from '@finnair/v-validation';
import { Path } from '@finnair/path';
import { DateTime, DateTimeOptions, Duration, FixedOffsetZone } from 'luxon';
import { LocalDateLuxon, DateTimeLuxon, DateTimeMillisLuxon, DateTimeMillisUtcLuxon, DateTimeUtcLuxon, LuxonDateTime, LocalTimeLuxon } from './luxon';

export type LuxonInput = string | DateTime | LuxonDateTime

export interface ValidateLuxonParams {
  value: any;
  path: Path;
  ctx: ValidationContext;
  type: string;
  proto: any;
  pattern: RegExp;
  options: DateTimeOptions;
}

export function validateLuxon({value, path, ctx, type, proto, pattern, options}: ValidateLuxonParams) {
  if (isNullOrUndefined(value)) {
    return ctx.failure(defaultViolations.notNull(path), value);
  }
  if (value instanceof proto) {
    return ctx.success(value);
  }
  else if (DateTime.isDateTime(value)) {
    if (value.isValid) {
      return ctx.success(new proto(value));
    }
  }
  else if (isString(value)) {
    if (pattern.test(value)) {
      const dateTime = DateTime.fromISO(value, options);
      if (dateTime.isValid) {
        return ctx.success(new proto(dateTime));
      }
    }
  }
  return ctx.failure(defaultViolations.date(value, path, type), value);
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/

async function localDateValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'Date', 
    proto: LocalDateLuxon, 
    pattern: datePattern,
    options: { zone: FixedOffsetZone.utcInstance },
  });
}

const timePattern = /^\d{2}:\d{2}:\d{2}$/

async function localTimeValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'Time', 
    proto: LocalTimeLuxon, 
    pattern: timePattern,
    options: { zone: FixedOffsetZone.utcInstance },
  });
}

const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}(?::?\d{2})?)$/

async function dateTimeValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'DateTime', 
    proto: DateTimeLuxon, 
    pattern: dateTimePattern,
    options: { setZone: true },
  });
}

async function dateTimeUtcValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'DateTime', 
    proto: DateTimeUtcLuxon, 
    pattern: dateTimePattern,
    options: { zone: FixedOffsetZone.utcInstance },
  });
}

const dateTimeMillisPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}(?::?\d{2})?)$/

async function dateTimeMillisValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'DateTimeMillis', 
    proto: DateTimeMillisLuxon, 
    pattern: dateTimeMillisPattern,
    options: { setZone: true },
  });
}

async function dateTimeMillisUtcValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'DateTimeMillis', 
    proto: DateTimeMillisUtcLuxon, 
    pattern: dateTimeMillisPattern,
    options: { zone: FixedOffsetZone.utcInstance },
  });
}

const durationPattern = /^P(?!$)(\d+(?:\.\d+)?Y)?(\d+(?:\.\d+)?M)?(\d+(?:\.\d+)?W)?(\d+(?:\.\d+)?D)?(T(?=\d)(\d+(?:\.\d+)?H)?(\d+(?:\.\d+)?M)?(\d+(?:\.\d+)?S)?)?$/;

export class DurationValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    else if (Duration.isDuration(value)) {
      return ctx.success(value);
    }
    else if (isString(value) && durationPattern.test(value)) {
      const duration = Duration.fromISO(value)
      if (duration.isValid) {
        return ctx.success(duration);
      }
    }
    return ctx.failure(new TypeMismatch(path, 'Duration', value), value);
  }
}
export const Vluxon = {
  localDate: () => V.fn(localDateValidator),
  localTime: () => V.fn(localTimeValidator),
  dateTime: () => V.fn(dateTimeValidator),
  dateTimeUtc: () => V.fn(dateTimeUtcValidator),
  dateTimeMillis: () => V.fn(dateTimeMillisValidator),
  dateTimeMillisUtc: () => V.fn(dateTimeMillisUtcValidator),
  duration: () => new DurationValidator(),
};
