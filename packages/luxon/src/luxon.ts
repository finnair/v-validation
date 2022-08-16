import { DateTime, DateTimeOptions } from 'luxon';

export type LuxonDateTimeInput = DateTime | LuxonDateTime;

export abstract class LuxonDateTime {
  public readonly dateTime: DateTime;

  constructor(input: LuxonDateTimeInput) {
    if (input instanceof LuxonDateTime) {
      this.dateTime = this.normalize(input.dateTime);
    } else {
      if (!input.isValid) {
        throw new Error('Invalid DateTime: ' + input.invalidExplanation);
      }
      this.dateTime = this.normalize(input);
    }
  }

  protected abstract normalize(dateTime: DateTime): DateTime;

  apply<R>(fn: (dateTime: DateTime) => R): R {
    return fn(this.dateTime);
  }

  valueOf(): number {
    return this.dateTime.valueOf();
  }

  as<T extends LuxonDateTime>(type: { new(...args: any[]): T }): T {
    return new type(this.dateTime);
  }

  equals(other: any) {
    if (this.constructor === other.constructor) {
      return this.dateTime.equals(other.dateTime);
    }
    return false;
  }

  abstract wrap(fn: (dateTime: DateTime) => DateTime): LuxonDateTime;

  abstract toJSON(): string;
}

export class LocalDateLuxon extends LuxonDateTime {
  public static readonly format = 'yyyy-MM-dd';

  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  public static now() {
    return new LocalDateLuxon(DateTime.now());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new LocalDateLuxon(DateTime.fromISO(value, options));
  }

  public static fromJSDate(date: Date, options?: DateTimeOptions) {
    return new LocalDateLuxon(DateTime.fromJSDate(date, options));
  }

  public static fromMillis(milliseconds: number, options?: DateTimeOptions) {
    return new LocalDateLuxon(DateTime.fromMillis(milliseconds, options));
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

  public static now() {
    return new LocalTimeLuxon(DateTime.now());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new LocalTimeLuxon(DateTime.fromISO(value, options));
  }

  public static fromJSDate(date: Date, options?: DateTimeOptions) {
    return new LocalTimeLuxon(DateTime.fromJSDate(date, options));
  }

  public static fromMillis(milliseconds: number, options?: DateTimeOptions) {
    return new LocalTimeLuxon(DateTime.fromMillis(milliseconds, options));
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

export class DateTimeLuxon extends LuxonDateTime {
  public static readonly format = "yyyy-MM-dd'T'HH:mm:ss";

  public static readonly formatTz = `${this.format}ZZ`;

  constructor(input: LuxonDateTimeInput) {
    super(input);
  }

  public static now() {
    return new DateTimeLuxon(DateTime.now());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new DateTimeLuxon(DateTime.fromISO(value, options));
  }

  public static fromJSDate(date: Date, options?: DateTimeOptions) {
    return new DateTimeLuxon(DateTime.fromJSDate(date, options));
  }

  public static fromMillis(milliseconds: number, options?: DateTimeOptions) {
    return new DateTimeLuxon(DateTime.fromMillis(milliseconds, options));
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

  public static now() {
    return new DateTimeUtcLuxon(DateTime.now());
  }

  public static fromISO(value: string) {
    return new DateTimeUtcLuxon(DateTime.fromISO(value));
  }

  public static fromJSDate(date: Date, options?: DateTimeOptions) {
    return new DateTimeUtcLuxon(DateTime.fromJSDate(date, options));
  }

  public static fromMillis(milliseconds: number, options?: DateTimeOptions) {
    return new DateTimeUtcLuxon(DateTime.fromMillis(milliseconds, options));
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

  public static now() {
    return new DateTimeMillisLuxon(DateTime.now());
  }

  public static fromISO(value: string) {
    return new DateTimeMillisLuxon(DateTime.fromISO(value));
  }

  public static fromJSDate(date: Date, options?: DateTimeOptions) {
    return new DateTimeMillisLuxon(DateTime.fromJSDate(date, options));
  }

  public static fromMillis(milliseconds: number, options?: DateTimeOptions) {
    return new DateTimeMillisLuxon(DateTime.fromMillis(milliseconds, options));
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

  public static now() {
    return new DateTimeMillisUtcLuxon(DateTime.now());
  }

  public static fromISO(value: string, options?: DateTimeOptions) {
    return new DateTimeMillisUtcLuxon(DateTime.fromISO(value, options));
  }

  public static fromJSDate(date: Date, options?: DateTimeOptions) {
    return new DateTimeMillisUtcLuxon(DateTime.fromJSDate(date, options));
  }

  public static fromMillis(milliseconds: number, options?: DateTimeOptions) {
    return new DateTimeMillisUtcLuxon(DateTime.fromMillis(milliseconds, options));
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
