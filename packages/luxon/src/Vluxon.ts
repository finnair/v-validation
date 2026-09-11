import { ValidationContext, isNullOrUndefined, defaultViolations, isString, V, Validator, TypeMismatch, SuccessCallback, FailureCallback } from '@finnair/v-validation';
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
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<DateTime>, failure: FailureCallback): void {
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
  }
}

export class LuxonValidator<Out extends LuxonDateTime> extends Validator<Out> {
  private readonly dateTimeValidator: DateTimeValidator;
  constructor(public readonly params: ValidateLuxonParams<Out>) {
    super();
    this.dateTimeValidator = new DateTimeValidator(params);
    Object.freeze(this);
  }

  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Out>, failure: FailureCallback): void {
    if (value instanceof this.params.proto) {
      success(value);
    } else if (DateTime.isDateTime(value?.dateTime)) {
      success(new this.params.proto(value.dateTime));
    } else {
      this.dateTimeValidator.validatePathV2(value, path, ctx,
        (result: DateTime) => success(new this.params.proto(result)),
        failure);
    }
  }
}

/**
 * Resolve an ISO offset into a cached `FixedOffsetZone` from its already-captured parts: the
 * `[+-]` `sign`, two-digit `hours` and optional two-digit `minutes` groups. `sign` is `undefined`
 * for a `Z` (UTC) offset, in which case `hours`/`minutes` are absent too. Reusing the pattern's
 * capturing groups avoids re-parsing the offset substring here. `FixedOffsetZone.instance` caches
 * instances (and returns the shared UTC instance for a zero offset), so this stays allocation free
 * for repeated offsets.
 */
function offsetZone(sign: string | undefined, hours: string | undefined, minutes: string | undefined): FixedOffsetZone {
  if (sign === undefined) {
    return FixedOffsetZone.utcInstance;
  }
  const offset = +hours! * 60 + (minutes ? +minutes : 0);
  return FixedOffsetZone.instance(sign === '-' ? -offset : offset);
}

// Capturing groups: year, month, day. The pattern only guarantees the shape, so out-of-range
// values (e.g. an invalid leap day) still yield an invalid DateTime that fails validation.
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function localDate() {
  return new LuxonValidator({
    type: 'Date',
    proto: LocalDateLuxon,
    pattern: datePattern,
    parser: (_value: string, match: RegExpExecArray) => DateTime.utc(+match[1], +match[2], +match[3]),
  });
}

// Capturing groups: hour, minute, second. LocalTimeLuxon discards the date, so any date works.
const timePattern = /^(\d{2}):(\d{2}):(\d{2})$/;

function localTime() {
  return new LuxonValidator({
    type: 'Time',
    proto: LocalTimeLuxon,
    pattern: timePattern,
    parser: (_value: string, match: RegExpExecArray) => DateTime.utc(1970, 1, 1, +match[1], +match[2], +match[3]),
  });
}

// Capturing groups: year, month, day, hour, minute, second.
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

function localDateTime() {
  return new LuxonValidator({
    type: 'DateTime',
    proto: LocalDateTimeLuxon,
    pattern: localDateTimePattern,
    parser: (_value: string, match: RegExpExecArray) =>
      DateTime.utc(+match[1], +match[2], +match[3], +match[4], +match[5], +match[6]),
  });
}

// Capturing groups: year, month, day, hour, minute, second, then the offset split into sign,
// hours and (optional) minutes; all three offset groups are absent for a `Z` (UTC) offset. The
// DateTime is built in the parsed fixed-offset zone; the *Utc wrappers convert to UTC during
// normalization.
const dateTimeTzPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:Z|([+-])(\d{2})(?::?(\d{2}))?)$/;

function parseDateTimeTz(match: RegExpExecArray): DateTime {
  return DateTime.fromObject(
    {
      year: +match[1],
      month: +match[2],
      day: +match[3],
      hour: +match[4],
      minute: +match[5],
      second: +match[6],
    },
    { zone: offsetZone(match[7], match[8], match[9]) },
  );
}

function dateTime() {
  return new LuxonValidator({
    type: 'DateTime',
    proto: DateTimeLuxon,
    pattern: dateTimeTzPattern,
    parser: (_value: string, match: RegExpExecArray) => parseDateTimeTz(match),
  });
}

function dateTimeUtc() {
  return new LuxonValidator({
    type: 'DateTime',
    proto: DateTimeUtcLuxon,
    pattern: dateTimeTzPattern,
    parser: (_value: string, match: RegExpExecArray) => parseDateTimeTz(match),
  });
}

// Capturing groups: year, month, day, hour, minute, second, millisecond, then the offset split
// into sign, hours and (optional) minutes; all three offset groups are absent for a `Z` offset.
const dateTimeMillisPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})(?:Z|([+-])(\d{2})(?::?(\d{2}))?)$/;

function parseDateTimeMillisTz(match: RegExpExecArray): DateTime {
  return DateTime.fromObject(
    {
      year: +match[1],
      month: +match[2],
      day: +match[3],
      hour: +match[4],
      minute: +match[5],
      second: +match[6],
      millisecond: +match[7],
    },
    { zone: offsetZone(match[8], match[9], match[10]) },
  );
}

function dateTimeMillis() {
  return new LuxonValidator<DateTimeMillisLuxon>({
    type: 'DateTimeMillis',
    proto: DateTimeMillisLuxon,
    pattern: dateTimeMillisPattern,
    parser: (_value: string, match: RegExpExecArray) => parseDateTimeMillisTz(match),
  });
}

function dateTimeMillisUtc() {
  return new LuxonValidator({
    type: 'DateTimeMillis',
    proto: DateTimeMillisUtcLuxon,
    pattern: dateTimeMillisPattern,
    parser: (_value: string, match: RegExpExecArray) => parseDateTimeMillisTz(match),
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
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Duration>, failure: FailureCallback): void {
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
  }
}

export class TimeDurationValidator extends Validator<Duration> {
  validatePathV2(value: any, path: Path, ctx: ValidationContext, success: SuccessCallback<Duration>, failure: FailureCallback): void {
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
