import {DateTime} from 'luxon';

export type LuxonDateTimeInput = DateTime | LuxonDateTime

export abstract class LuxonDateTime {

  public readonly dateTime: DateTime

  constructor(input: LuxonDateTimeInput) {
    if (input instanceof LuxonDateTime) {
      this.dateTime = this.normalize(input.dateTime)
    } else {
      if (!input.isValid) {
        throw new Error('Invalid DateTime: ' + input.invalidExplanation)
      }
      this.dateTime = this.normalize(input)
    }
  }

  protected normalize(dateTime: DateTime) {
    return dateTime
  }

  apply<R>(fn: (dateTime: DateTime) => R): R {
    return fn(this.dateTime)
  }

  valueOf(): number {
    return this.dateTime.valueOf()
  }

  equals(other: any) {
    if (this.constructor === other.constructor) {
      return this.dateTime.equals(other.dateTime);
    }
    return false;
  }

  abstract wrap(fn: (dateTime: DateTime) => DateTime): LuxonDateTime;

  abstract toJSON(): string
}

export class DateLuxon extends LuxonDateTime {

  public static readonly format = 'yyyy-MM-dd'
  
  constructor(input: LuxonDateTimeInput) {
    super(input)
  }

  public static fromISO(value: string) {
    return new DateLuxon(DateTime.fromISO(value))
  }

  protected normalize(dateTime: DateTime): DateTime {
    return dateTime.startOf('day')
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateLuxon {
    return new DateLuxon(fn(this.dateTime))
  }

  toJSON() {
    return this.dateTime.toFormat(DateLuxon.format)
  }
}

export class DateUtcLuxon extends LuxonDateTime {

  constructor(input: LuxonDateTimeInput) {
    super(input)
  }

  public static fromISO(value: string) {
    return new DateUtcLuxon(DateTime.fromISO(value))
  }

  protected normalize(dateTime: DateTime): DateTime {
    return DateTime.utc(dateTime.year, dateTime.month, dateTime.day, 0, 0, 0)
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateUtcLuxon {
    return new DateUtcLuxon(fn(this.dateTime))
  }

  toJSON() {
    return this.dateTime.toFormat(DateLuxon.format)
  }
}

export class DateTimeLuxon extends LuxonDateTime {

  public static readonly format = "yyyy-MM-dd'T'HH:mm:ss"
  
  public static readonly formatTz = `${this.format}ZZ`
  
  constructor(input: LuxonDateTimeInput) {
    super(input)
  }

  public static fromISO(value: string) {
    return new DateTimeLuxon(DateTime.fromISO(value))
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateTimeLuxon {
    return new DateTimeLuxon(fn(this.dateTime))
  }

  toJSON() {
    if (this.dateTime.offset === 0) {
      return this.dateTime.toFormat(DateTimeLuxon.format) + 'Z'
    }
    return this.dateTime.toFormat(DateTimeLuxon.formatTz)
  }
}

export class DateTimeUtcLuxon extends LuxonDateTime {

  constructor(input: LuxonDateTimeInput) {
    super(input)
  }

  public static fromISO(value: string) {
    return new DateTimeUtcLuxon(DateTime.fromISO(value))
  }

  protected normalize(dateTime: DateTime): DateTime {
      return dateTime.toUTC()
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateTimeUtcLuxon {
    return new DateTimeUtcLuxon(fn(this.dateTime))
  }

  toJSON() {
    return this.dateTime.toFormat(DateTimeLuxon.format) + 'Z'
  }
}

export class DateTimeMillisLuxon extends LuxonDateTime {

  public static readonly format = "yyyy-MM-dd'T'HH:mm:ss.SSS"
  
  public static readonly formatTz = `${this.format}ZZ`
  
  constructor(input: LuxonDateTimeInput) {
    super(input)
  }

  public static fromISO(value: string) {
    return new DateTimeMillisLuxon(DateTime.fromISO(value))
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateTimeMillisLuxon {
    return new DateTimeMillisLuxon(fn(this.dateTime))
  }

  toJSON() {
    if (this.dateTime.offset === 0) {
      return this.dateTime.toFormat(DateTimeMillisLuxon.format) + 'Z'
    }
    return this.dateTime.toFormat(DateTimeMillisLuxon.formatTz)
  }
}

export class DateTimeMillisUtcLuxon extends LuxonDateTime {

  constructor(input: LuxonDateTimeInput) {
    super(input)
  }

  public static fromISO(value: string) {
    return new DateTimeMillisUtcLuxon(DateTime.fromISO(value))
  }

  protected normalize(dateTime: DateTime): DateTime {
      return dateTime.toUTC()
  }

  wrap(fn: (dateTime: DateTime) => DateTime): DateTimeMillisUtcLuxon {
    return new DateTimeMillisUtcLuxon(fn(this.dateTime))
  }

  toJSON() {
    return this.dateTime.toFormat(DateTimeMillisLuxon.format) + 'Z'
  }
}

export class TimeLuxon extends LuxonDateTime {

  public static readonly format = 'HH:mm:ss'
  
  constructor(input: LuxonDateTimeInput) {
    super(input)
  }

  public static fromISO(value: string) {
    return new TimeLuxon(DateTime.fromISO(value))
  }

  wrap(fn: (dateTime: DateTime) => DateTime): TimeLuxon {
    return new TimeLuxon(fn(this.dateTime))
  }

  toJSON() {
    return this.dateTime.toFormat(TimeLuxon.format)
  }
}
