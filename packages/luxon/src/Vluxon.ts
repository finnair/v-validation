import { ValidationContext, isNullOrUndefined, defaultViolations, isString, V, Validator, ValidationResult, TypeMismatch } from '@finnair/v-validation';
import { Path } from '@finnair/path';
import { DateTime, Duration } from 'luxon';
import { DateLuxon, DateTimeLuxon, DateTimeMillisLuxon, DateTimeMillisUtcLuxon, DateTimeUtcLuxon, DateUtcLuxon, LuxonDateTime, TimeLuxon } from './luxon';

export type LuxonInput = string | DateTime | LuxonDateTime

export interface ValidateLuxonParams {
  value: any;
  path: Path;
  ctx: ValidationContext;
  type: string;
  proto: any;
  pattern: RegExp
}

export function validateLuxon({value, path, ctx, type, proto, pattern}: ValidateLuxonParams) {
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
      const dateTime = DateTime.fromISO(value, {setZone: true});
      if (dateTime.isValid) {
        return ctx.success(new proto(dateTime));
      }
    }
  }
  return ctx.failure(defaultViolations.date(value, path, type), value);
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/

async function dateValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'Date', 
    proto: DateLuxon, 
    pattern: datePattern
  });
}

async function dateUtcValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'Date', 
    proto: DateUtcLuxon, 
    pattern: datePattern
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
    pattern: dateTimePattern
  });
}

async function dateTimeUtcValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'DateTime', 
    proto: DateTimeUtcLuxon, 
    pattern: dateTimePattern
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
    pattern: dateTimeMillisPattern
  });
}

async function dateTimeMillisUtcValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'DateTimeMillis', 
    proto: DateTimeMillisUtcLuxon, 
    pattern: dateTimeMillisPattern
  });
}

const timePattern = /^\d{2}:\d{2}:\d{2}$/

async function timeValidator(value: any, path: Path, ctx: ValidationContext) {
  return validateLuxon({
    value, 
    path, 
    ctx, 
    type: 'Time', 
    proto: TimeLuxon, 
    pattern: timePattern
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
  date: () => V.fn(dateValidator),
  dateUtc: () => V.fn(dateUtcValidator),
  dateTime: () => V.fn(dateTimeValidator),
  dateTimeUtc: () => V.fn(dateTimeUtcValidator),
  dateTimeMillis: () => V.fn(dateTimeMillisValidator),
  dateTimeMillisUtc: () => V.fn(dateTimeMillisUtcValidator),
  time: () => V.fn(timeValidator),
  duration: () => new DurationValidator(),
};