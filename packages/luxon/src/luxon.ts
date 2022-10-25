import { DateTime, DateTimeJSOptions, DateTimeOptions, FixedOffsetZone, Zone } from 'luxon';

export type LuxonDateTimeInput = DateTime | LuxonDateTime;

export abstract class LuxonDateTime {
  public readonly dateTime: DateTime;

  constructor(input: LuxonDateTimeInput) {
    if (input === null || input === undefined) {
      throw new Error('invalid input (null or undefined), expected DateTime or LuxonDateTime');
    } else if (input instanceof LuxonDateTime) {
      this.dateTime = this.normalize(input.dateTime);
    } else if (input instanceof DateTime) {
      if (!input.isValid) {
        throw new Error('Invalid DateTime: ' + input.invalidExplanation);
      }
      this.dateTime = this.normalize(input);
    } else {
      throw new Error('invalid input, expected DateTime or LuxonDateTime');
    }
    Object.freeze(this);
  }

  protected abstract normalize(dateTime: DateTime): DateTime;

  apply<R>(fn: (dateTime: DateTime) => R): R {
    return fn(this.dateTime);
  }

  valueOf(): number {
    return this.dateTime.valueOf();
  }

  as<T extends LuxonDateTime>(type: { new (...args: any[]): T }): T {
    if (this instanceof type) {
      return this;
    }
    return new type(this.dateTime);
  }

  equals(other: any) {
    if (this.constructor === other.constructor) {
      return this.dateTime.equals(other.dateTime);
    }
    return false;
  }

  toString() {
    return this.toJSON();
  }

  abstract wrap(fn: (dateTime: DateTime) => DateTime): LuxonDateTime;

  abstract toJSON(): string;
}

export class LocalDateLuxon extends LuxonDateTime {
  public static readonly format = 'yyyy-MM-dd';

  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  public static nowLocal(options?: DateTimeJSOptions) {
    return new LocalDateLuxon(DateTime.local(options));
  }

  public static nowUtc() {
    return new LocalDateLuxon(DateTime.utc());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new LocalDateLuxon(
      DateTime.fromISO(value, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromFormat(value: string, format: string, options?: DateTimeOptions) {
    return new LocalDateLuxon(
      DateTime.fromFormat(value, format, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromJSDate(date: Date, options?: { zone?: string | Zone }) {
    return new LocalDateLuxon(
      DateTime.fromJSDate(date, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromMillis(millis: number, options?: DateTimeJSOptions) {
    return new LocalDateLuxon(
      DateTime.fromMillis(millis, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  protected normalize(dateTime: DateTime): DateTime {
    return DateTime.utc(dateTime.year, dateTime.month, dateTime.day);
  }

  wrap(fn: (dateTime: DateTime) => DateTime): LocalDateLuxon {
    return new LocalDateLuxon(fn(this.dateTime));
  }

  toJSON() {
    return this.dateTime.toFormat(LocalDateLuxon.format);
  }
}

export class LocalTimeLuxon extends LuxonDateTime {
  public static readonly format = 'HH:mm:ss';

  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  public static nowLocal(options?: DateTimeJSOptions) {
    return new LocalTimeLuxon(DateTime.local(options));
  }

  public static nowUtc() {
    return new LocalTimeLuxon(DateTime.utc());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new LocalTimeLuxon(
      DateTime.fromISO(value, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromFormat(value: string, format: string, options?: DateTimeOptions) {
    return new LocalTimeLuxon(
      DateTime.fromFormat(value, format, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromJSDate(date: Date, options?: { zone?: string | Zone }) {
    return new LocalTimeLuxon(
      DateTime.fromJSDate(date, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromMillis(millis: number, options?: DateTimeJSOptions) {
    return new LocalTimeLuxon(
      DateTime.fromMillis(millis, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  protected normalize(dateTime: DateTime): DateTime {
    return DateTime.utc(1970, 1, 1, dateTime.hour, dateTime.minute, dateTime.second);
  }

  wrap(fn: (dateTime: DateTime) => DateTime): LocalTimeLuxon {
    return new LocalTimeLuxon(fn(this.dateTime));
  }

  toJSON() {
    return this.dateTime.toFormat(LocalTimeLuxon.format);
  }
}

export class LocalDateTimeLuxon extends LuxonDateTime {
  public static readonly format = "yyyy-MM-dd'T'HH:mm:ss";

  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  setZone(zone: Zone): DateTimeLuxon {
    return new DateTimeLuxon(this.dateTime.setZone(zone, { keepLocalTime: true }));
  }

  public static nowLocal(options?: DateTimeJSOptions) {
    return new LocalDateTimeLuxon(DateTime.local(options));
  }

  public static nowUtc() {
    return new LocalDateTimeLuxon(DateTime.utc());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new LocalDateTimeLuxon(
      DateTime.fromISO(value, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromFormat(value: string, format: string, options?: DateTimeOptions) {
    return new LocalDateTimeLuxon(
      DateTime.fromFormat(value, format, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromJSDate(date: Date, options?: { zone?: string | Zone }) {
    return new LocalDateTimeLuxon(
      DateTime.fromJSDate(date, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromMillis(millis: number, options?: DateTimeJSOptions) {
    return new LocalDateTimeLuxon(
      DateTime.fromMillis(millis, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  protected normalize(dateTime: DateTime): DateTime {
    return DateTime.utc(dateTime.year, dateTime.month, dateTime.day, dateTime.hour, dateTime.minute, dateTime.second);
  }

  wrap(fn: (dateTime: DateTime) => DateTime): LocalDateTimeLuxon {
    return new LocalDateTimeLuxon(fn(this.dateTime));
  }

  toJSON() {
    return this.dateTime.toFormat(LocalDateTimeLuxon.format);
  }
}

export class DateTimeLuxon extends LuxonDateTime {
  public static readonly format = "yyyy-MM-dd'T'HH:mm:ss";

  public static readonly formatTz = `${this.format}ZZ`;

  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  setZone(zone: Zone): DateTimeLuxon {
    return new DateTimeLuxon(this.dateTime.setZone(zone, { keepLocalTime: false }));
  }

  public static now(options?: DateTimeJSOptions) {
    return new DateTimeLuxon(DateTime.local(options));
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new DateTimeLuxon(
      DateTime.fromISO(value, {
        setZone: true,
        ...options,
      }),
    );
  }

  public static fromFormat(value: string, format: string, options?: DateTimeOptions) {
    return new DateTimeLuxon(
      DateTime.fromFormat(value, format, {
        setZone: true,
        ...options,
      }),
    );
  }

  public static fromJSDate(date: Date, options?: { zone?: string | Zone }) {
    return new DateTimeLuxon(DateTime.fromJSDate(date, options));
  }

  public static fromMillis(millis: number, options?: DateTimeJSOptions) {
    return new DateTimeLuxon(DateTime.fromMillis(millis, options));
  }

  protected normalize(dateTime: DateTime): DateTime {
    return dateTime.startOf('second');
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateTimeLuxon {
    return new DateTimeLuxon(fn(this.dateTime));
  }

  toJSON() {
    if (this.dateTime.offset === 0) {
      return this.dateTime.toFormat(DateTimeLuxon.format) + 'Z';
    }
    return this.dateTime.toFormat(DateTimeLuxon.formatTz);
  }
}

export class DateTimeUtcLuxon extends LuxonDateTime {
  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  setZone(zone: Zone): DateTimeLuxon {
    return new DateTimeLuxon(this.dateTime.setZone(zone, { keepLocalTime: false }));
  }

  public static now() {
    return new DateTimeUtcLuxon(DateTime.utc());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new DateTimeUtcLuxon(
      DateTime.fromISO(value, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromFormat(value: string, format: string, options?: DateTimeOptions) {
    return new DateTimeUtcLuxon(
      DateTime.fromFormat(value, format, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromJSDate(date: Date, options?: { zone?: string | Zone }) {
    return new DateTimeUtcLuxon(
      DateTime.fromJSDate(date, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromMillis(millis: number, options?: DateTimeJSOptions) {
    return new DateTimeUtcLuxon(
      DateTime.fromMillis(millis, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  protected normalize(dateTime: DateTime): DateTime {
    return dateTime.toUTC().startOf('second');
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateTimeUtcLuxon {
    return new DateTimeUtcLuxon(fn(this.dateTime));
  }

  toJSON() {
    return this.dateTime.toFormat(DateTimeLuxon.format) + 'Z';
  }
}

export class DateTimeMillisLuxon extends LuxonDateTime {
  public static readonly format = "yyyy-MM-dd'T'HH:mm:ss.SSS";

  public static readonly formatTz = `${this.format}ZZ`;

  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  setZone(zone: Zone): DateTimeMillisLuxon {
    return new DateTimeMillisLuxon(this.dateTime.setZone(zone, { keepLocalTime: false }));
  }

  public static now(options?: DateTimeJSOptions) {
    return new DateTimeMillisLuxon(DateTime.local(options));
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new DateTimeMillisLuxon(
      DateTime.fromISO(value, {
        setZone: true,
        ...options,
      }),
    );
  }

  public static fromFormat(value: string, format: string, options?: DateTimeOptions) {
    return new DateTimeMillisLuxon(
      DateTime.fromFormat(value, format, {
        setZone: true,
        ...options,
      }),
    );
  }

  public static fromJSDate(date: Date, options?: { zone?: string | Zone }) {
    return new DateTimeMillisLuxon(DateTime.fromJSDate(date, options));
  }

  public static fromMillis(millis: number, options?: DateTimeJSOptions) {
    return new DateTimeMillisLuxon(DateTime.fromMillis(millis, options));
  }

  protected normalize(dateTime: DateTime): DateTime {
    return dateTime;
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateTimeMillisLuxon {
    return new DateTimeMillisLuxon(fn(this.dateTime));
  }

  toJSON() {
    if (this.dateTime.offset === 0) {
      return this.dateTime.toFormat(DateTimeMillisLuxon.format) + 'Z';
    }
    return this.dateTime.toFormat(DateTimeMillisLuxon.formatTz);
  }
}

export class DateTimeMillisUtcLuxon extends LuxonDateTime {
  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  setZone(zone: Zone): DateTimeMillisLuxon {
    return new DateTimeMillisLuxon(this.dateTime.setZone(zone, { keepLocalTime: false }));
  }

  public static now() {
    return new DateTimeMillisUtcLuxon(DateTime.utc());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new DateTimeMillisUtcLuxon(
      DateTime.fromISO(value, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromFormat(value: string, format: string, options?: DateTimeOptions) {
    return new DateTimeMillisUtcLuxon(
      DateTime.fromFormat(value, format, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromJSDate(date: Date, options?: { zone?: string | Zone }) {
    return new DateTimeMillisUtcLuxon(
      DateTime.fromJSDate(date, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  public static fromMillis(millis: number, options?: DateTimeJSOptions) {
    return new DateTimeMillisUtcLuxon(
      DateTime.fromMillis(millis, {
        zone: FixedOffsetZone.utcInstance,
        ...options,
      }),
    );
  }

  protected normalize(dateTime: DateTime): DateTime {
    return dateTime.toUTC();
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateTimeMillisUtcLuxon {
    return new DateTimeMillisUtcLuxon(fn(this.dateTime));
  }

  toJSON() {
    return this.dateTime.toFormat(DateTimeMillisLuxon.format) + 'Z';
  }
}
