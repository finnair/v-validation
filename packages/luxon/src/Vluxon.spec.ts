import { describe, beforeAll, afterAll, test, expect } from 'vitest'
import { Validator, ValidatorOptions, ValidationResult, V, Violation, defaultViolations, TypeMismatch, ValidationContext, violationsOf } from '@finnair/v-validation';
import { LuxonValidator, Vluxon } from './Vluxon.js';
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
import { DateTime, Duration, FixedOffsetZone, IANAZone, Settings } from 'luxon';
import { Path } from '@finnair/path';
import { fail } from 'assert';

async function expectViolations<In>(value: In, validator: Validator<any, In>, ...violations: Violation[]) {
  await validator.validatePath(value, Path.ROOT, new ValidationContext({})).then(
    success => {
      fail(`expected violations, got ${success}`)
    },
    fail => {
      expect(violationsOf(fail)).toEqual(violations);
    }
  )
}

async function expectValid<Out, In>(value: In, validator: Validator<Out, In>, convertedValue?: Out, ctx?: ValidatorOptions) {
  const result = await validator.validate(value, ctx);
  verifyValid(result, value, convertedValue);
}

function verifyValid(result: ValidationResult, value: any, convertedValue?: any) {
  expect(result.getViolations()).toEqual([]);
  if (convertedValue !== undefined) {
    expect(result.getValue()).toEqual(convertedValue);
  } else {
    expect(result.getValue()).toEqual(value);
  }
  return result;
}

const originalNow = Settings.now;

describe('Vluxon', () => {
  beforeAll(() => {
    Settings.defaultZone = 'Europe/Helsinki';
  });

  afterAll(() => {
    Settings.defaultZone = 'system';
    Settings.now = originalNow;
  });

  const toJSON = V.map((value: any) => value.toJSON());
  const toLuxon = V.map((value: LuxonDateTime) => value.dateTime);

  test('valueOf', () => {
    const now = DateTime.fromMillis(1660563253123);
    expect(new DateTimeLuxon(now).valueOf()).toBe(1660563253000);
  });

  describe('equals', () => {
    test('is equal', () => {
      const now = DateTime.now();
      expect(new DateTimeLuxon(now).equals(new DateTimeLuxon(now))).toBe(true);
    });
    test('not equal (class)', () => {
      const now = DateTime.now();
      expect(new DateTimeLuxon(now).equals(new DateTimeUtcLuxon(now))).toBe(false);
    });
  });

  describe('constructor checks', () => {
    test.each([null, undefined, new Date(), '2022-09-27T12:36:19.598Z', Date.now()])('%s is invalid', (invalidValue: any) => {
      expect(() => new DateTimeLuxon(invalidValue as unknown as DateTime)).toThrowError('invalid input');
    });
  });

  describe.each`
    type
    ${LocalDateLuxon}
    ${LocalTimeLuxon}
    ${LocalDateTimeLuxon}
    ${DateTimeLuxon}
    ${DateTimeUtcLuxon}
    ${DateTimeMillisLuxon}
    ${DateTimeMillisUtcLuxon}
  `('constructors', ({ type }) => {
    test(`${type.name}.fromJSDate`, () => {
      const value = new Date();
      const wrapper = type.fromJSDate(value);
      expect(wrapper).toBeInstanceOf(type);
    });

    test(`${type.name}.fromISO`, () => {
      const value = '2019-03-07T00:00:00Z';
      const wrapper = type.fromISO(value);
      expect(wrapper).toBeInstanceOf(type);
    });

    test(`${type.name}.fromMillis`, () => {
      const value = 1660549128159;
      const wrapper = type.fromMillis(value);
      expect(wrapper).toBeInstanceOf(type);
    });

    test(`${type.name}.fromFormat`, () => {
      const wrapper = type.fromFormat('20220819095432+0', 'yyyyMMddHHmmssZ');
      expect(wrapper).toBeInstanceOf(type);
      const date = wrapper.dateTime.toFormat('yyyy-MM-dd');
      const time = wrapper.dateTime.toFormat('HH:mm:ss');
      expect(date === '2022-08-19' || time === '09:54:32').toBe(true);
    });

    test(`${type.name}.toString() equals toJSON()`, () => {
      const wrapper = new type(DateTime.now());
      expect(wrapper.toString()).toBe(wrapper.toJSON());
    });

    if (type.now) {
      test(`${type.name}.now()`, () => {
        expect(type.now()).toBeInstanceOf(type);
      });
    }
    if (type.nowLocal) {
      test(`${type.name}.nowLocal()`, () => {
        expect(type.nowLocal()).toBeInstanceOf(type);
      });
      test(`${type.name}.nowUtc()`, () => {
        expect(type.nowUtc()).toBeInstanceOf(type);
      });
    }
  });

  describe('comparisons', () => {
    const a = DateTimeUtcLuxon.now();
    const b: DateTimeUtcLuxon = a.wrap(dt => dt.plus({ days: 1 }));
    test('<', () => expect(a < b).toBe(true));
    test('<=', () => expect(a <= a).toBe(true));
    test('>', () => expect(b > a).toBe(true));
    test('>=', () => expect(b >= b).toBe(true));
  });

  describe('as', () => {
    test('convert DateTimeMillisUtcLuxon to DateTimeUtcLuxon', () => {
      const dateTimeMillis = DateTimeMillisUtcLuxon.fromMillis(1660563253490);
      const dateTime = DateTimeUtcLuxon.fromMillis(1660563253000);
      const converted = dateTimeMillis.as(DateTimeUtcLuxon);
      expect(converted).toBeInstanceOf(DateTimeUtcLuxon);
      expect(converted).toEqual(dateTime);
    });

    test("returns this in case it's of correct type", () => {
      const d = DateTimeMillisUtcLuxon.fromMillis(1660563253490);
      expect(d.as(DateTimeMillisUtcLuxon)).toBe(d);
    });
  });

  describe('localDate', () => {
    // NOTE: These tests rely on default zone Europe/Helsinki which is set in beforeAll

    test('valid date value', () => expectValid('2019-03-07', Vluxon.localDate().next(toLuxon), DateTime.fromISO('2019-03-07T00:00:00Z', { setZone: true })));

    test('valid date converted', () => expectValid('2019-03-07', Vluxon.localDate().next(toJSON), '2019-03-07'));

    test('direct constructor', () => expect(new LocalDateLuxon(DateTime.local(2019, 1, 1)).toJSON()).toEqual('2019-01-01'));

    test('local time of date', () =>
      expect(new LocalDateLuxon(DateTime.local(2019, 1, 1, 12, 13, 14)).dateTime).toEqual(DateTime.fromISO('2019-01-01T00:00:00Z', { setZone: true })));

    test('any LocalDateLuxon is valid', () => expectValid(new LocalDateLuxon(DateTime.now()), Vluxon.localDate()));

    test('nowLocal', () => {
      const weeHoursEast = DateTime.fromISO('2022-08-16T01:00:00+03');
      Settings.now = () => weeHoursEast.toMillis();
      expect(LocalDateLuxon.nowLocal().toJSON()).toEqual('2022-08-16');
    });

    test('nowUtc', () => {
      const weeHoursEast = DateTime.fromISO('2022-08-16T01:00:00+03');
      Settings.now = () => weeHoursEast.toMillis();
      expect(LocalDateLuxon.nowUtc().toJSON()).toEqual('2022-08-15');
    });

    describe('only local date counts when comparing', () => {
      test('different time', () => {
        const a = new LocalDateLuxon(DateTime.local(2022, 1, 1, 16));
        expect(+a == +new LocalDateLuxon(DateTime.local(2022, 1, 1, 12))).toBe(true);
      });

      test('same time, different timezone', () => {
        const east = DateTime.local(2022, 2, 15, 2, { zone: FixedOffsetZone.instance(180) });
        const utc = east.toUTC(); // Previous date, same millisecond
        expect(+east == +utc).toBe(true);
        const a = new LocalDateLuxon(east);
        const b = new LocalDateLuxon(utc);
        expect(a.toJSON()).toEqual('2022-02-15');
        expect(b.toJSON()).toEqual('2022-02-14');
        expect(a > b).toBe(true);
      });
    });

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.localDate(), new LocalDateLuxon(now));
    });

    test('instances are accepted across context boundaries', () => {
      const now = DateTime.now();
      expectValid({ dateTime: now}, Vluxon.localDate(), new LocalDateLuxon(now));
    });

    test('wrap', () => {
      const luxon = new LocalDateLuxon(DateTime.utc(2022, 1, 15, 1, 2, 3));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(LocalDateLuxon);
      expect(result).toEqual(new LocalDateLuxon(DateTime.utc(2022, 2, 15)));
    });

    describe('invalid values', () => {
      test.each([
        ['2019-05-21T12:00:00'], // Date with time
        ['2019-05'], // Valid ISO not allowed
        ['2019-05'], // Time zone not allowed
        ['2019-02-29'], // invalid leap date
        ['20160525'], // Valid ISO not allowed
        [Date.now()],
      ])('%s is invalid', (value: any) => expectViolations(value, Vluxon.localDate(), defaultViolations.date(value)));
    });

    describe('valid values', () => {
      test.each([
        ['2019-01-01'],
        ['2020-02-29'], // leap day
        ['1970-01-01'],
      ])('%s is valid', (value: string) => expectValid(value, Vluxon.localDate().next(toJSON), value));
    });
  });

  describe('localTime', () => {
    // NOTE: These tests rely on default zone Europe/Helsinki which is set in beforeAll

    test('valid time value', () => expectValid('12:00:00', Vluxon.localTime().next(toLuxon), DateTime.fromISO('1970-01-01T12:00:00Z', { setZone: true })));

    test('24:00:00 is normalized to 00:00:00', () =>
      expectValid('24:00:00', Vluxon.localTime().next(toLuxon), DateTime.fromISO('1970-01-01T00:00:00Z', { setZone: true })));

    test('valid time toJSON', () => expectValid('12:13:14', Vluxon.localTime().next(toJSON), '12:13:14'));

    test('direct constructor', () => expect(new LocalTimeLuxon(DateTime.local(2019, 1, 1, 1, 2, 3)).toJSON()).toEqual('01:02:03'));

    test('local date of time', () =>
      expect(new LocalTimeLuxon(DateTime.local(2019, 1, 1, 12, 13, 14)).dateTime).toEqual(DateTime.fromISO('1970-01-01T12:13:14Z', { setZone: true })));

    describe('only local time counts when comparing', () => {
      test('past year, later time', () => {
        const a = new LocalTimeLuxon(DateTime.local(2022, 1, 1, 12));
        expect(a < new LocalTimeLuxon(DateTime.local(2000, 1, 1, 16))).toBe(true);
      });

      test('same millis, different timezone', () => {
        const east = DateTime.local(2022, 2, 15, 2, { zone: FixedOffsetZone.instance(180) });
        const utc = east.toUTC(); // Previous date, same millisecond
        expect(+east == +utc).toBe(true);
        const a = new LocalTimeLuxon(east);
        const b = new LocalTimeLuxon(utc);
        expect(a.toJSON()).toEqual('02:00:00');
        expect(b.toJSON()).toEqual('23:00:00');
        expect(b > a).toBe(true);
      });
    });

    test('wrap', () => {
      const luxon = new LocalTimeLuxon(DateTime.utc(2022, 1, 15, 1, 2, 3));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ hour: 1 })));
      expect(result).toBeInstanceOf(LocalTimeLuxon);
      expect(result).toEqual(new LocalTimeLuxon(DateTime.utc(2022, 1, 15, 2, 2, 3)));
    });

    describe('invalid values', () => {
      test.each([
        ['2019-05-21T12:00:00'], // Date with time
        ['09:24'], // Valid ISO not allowed without seconds
        ['2019-05'], // Time zone not allowed
        ['09:24:15.123'], // Valid ISO not allowed with millis
        ['24:00:01'],
        ['12:60:00'],
        ['12:00:60'],
        [Date.now()],
      ])('%s is invalid', (value: any) => expectViolations(value, Vluxon.localTime(), defaultViolations.date(value, Path.ROOT, 'Time')));
    });

    describe('valid values', () => {
      test.each([['00:00:00'], ['12:13:15']])('%s is valid', (value: string) => expectValid(value, Vluxon.localTime().next(toJSON), value));
    });
  });

  describe('localDateTime', () => {
    test('null', () => expectViolations(null, Vluxon.localDateTime(), defaultViolations.notNull()));

    test('valid dateTime', () => expectValid('2019-03-07T12:13:14', Vluxon.localDateTime().next(toJSON), '2019-03-07T12:13:14'));

    test('direct constructor', () => expect(new LocalDateTimeLuxon(DateTime.local(2019, 1, 1, 1, 1, 1)).toJSON()).toEqual('2019-01-01T01:01:01'));

    test('UTC time zone is used internally', () => {
      const dt = new LocalDateTimeLuxon(DateTime.fromISO('2019-05-21T12:13:14.123+02', { setZone: true }));
      expect(new DateTimeUtcLuxon(dt).toJSON()).toEqual('2019-05-21T12:13:14Z');
    });

    test('setZone', () => {
      const local = LocalDateTimeLuxon.fromISO('2022-10-24T02:00:00');
      const zoned = local.setZone(FixedOffsetZone.utcInstance);
      expect(zoned).toBeInstanceOf(DateTimeLuxon);
      expect(zoned.toJSON()).toEqual('2022-10-24T02:00:00Z');
    });

    test('utcOffset of dateTime', () => {
      const dt = new LocalDateTimeLuxon(DateTime.fromISO('2019-05-21T12:13:14+03:00'));
      expect(dt.dateTime.offset).toEqual(0);
    });

    test('millis are discarded', () => {
      const dt = new LocalDateTimeLuxon(DateTime.fromISO('2019-05-21T12:13:14.123Z'));
      expect(dt.dateTime.millisecond).toEqual(0);
    });

    test('invalid LocalDateTimeLuxon throws', () => {
      expect(() => new LocalDateTimeLuxon(DateTime.fromISO('2021-02-29T12:00:00'))).toThrow();
    });

    test('any LocalDateTimeLuxon is valid', () => expectValid(new LocalDateTimeLuxon(DateTime.now()), Vluxon.localDateTime()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.localDateTime(), new LocalDateTimeLuxon(now));
    });

    test('wrap', () => {
      const luxon = new LocalDateTimeLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(LocalDateTimeLuxon);
      expect(result).toEqual(new LocalDateTimeLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0)));
    });

    describe('invalid values', () => {
      test.each([
        ['2019-05-21'], // Date without time
        ['2019-5-1T12:13:14'], // Date without zero padding
        ['2021-02-29T12:00:00Z'], // invalid leap date
        ['2019-05-21T12:13:14Z'], // zone not allowed
        ['2019-05-21T12:13:14+03'], // offset not allowed
        ['2019-05-21T12:13:14.123'], // milliseconds not allowed
        ['20190521T12:13:14'], // abreviated date form not supported
        ['2019-05-21T121314'], // abreviated time form not supported
        [Date.now()],
      ])('%s is invalid', (value: any) => expectViolations(value, Vluxon.localDateTime(), defaultViolations.date(value, Path.ROOT, 'DateTime')));
    });

    describe('valid values', () => {
      test.each([
        ['2020-02-29T12:00:00'],
        ['2020-02-29T00:00:00'], // leap day
      ])('%s is valid', (value: string) => expectValid(value, Vluxon.localDateTime().next(toJSON), value));
    });
  });

  describe('dateTime', () => {
    test('null', () => expectViolations(null, Vluxon.dateTime(), defaultViolations.notNull()));

    test('valid dateTime offset kept', () => expectValid('2019-03-07T12:13:14+02', Vluxon.dateTime().next(toJSON), '2019-03-07T12:13:14+02:00'));

    test('valid dateTime with +00:00 offset converted', () => expectValid('2019-03-07T12:13:14+00:00', Vluxon.dateTime().next(toJSON), '2019-03-07T12:13:14Z'));

    test('direct constructor', () =>
      expect(new DateTimeLuxon(DateTime.local(2019, 1, 1, 1, 1, 1, { zone: IANAZone.create('Europe/Helsinki') })).toJSON()).toEqual(
        '2019-01-01T01:01:01+02:00',
      ));

    test('convert dateTime to utc time', () => {
      const dt = new DateTimeLuxon(DateTime.fromISO('2019-05-21T12:13:14+03'));
      expect(new DateTimeUtcLuxon(dt).toJSON()).toEqual('2019-05-21T09:13:14Z');
    });

    test('utcOffset of dateTime', () => {
      const dt = new DateTimeLuxon(DateTime.fromISO('2019-05-21T12:13:14+03:00'));
      expect(dt.dateTime.offset).toEqual(180);
    });

    test('setZone', () => {
      const local = DateTimeLuxon.fromISO('2022-10-24T02:00:00+03');
      const zoned = local.setZone(FixedOffsetZone.utcInstance);
      expect(zoned).toBeInstanceOf(DateTimeLuxon);
      expect(zoned.toJSON()).toEqual('2022-10-23T23:00:00Z');
    });

    test('invalid DateTime throws', () => {
      expect(() => new DateTimeLuxon(DateTime.fromISO('2021-02-29T12:00:00'))).toThrow();
    });

    test('any DateTimeLuxon is valid', () => expectValid(new DateTimeLuxon(DateTime.now()), Vluxon.dateTime()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateTime(), new DateTimeLuxon(now));
    });

    test('wrap', () => {
      const luxon = new DateTimeLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(DateTimeLuxon);
      expect(result).toEqual(new DateTimeLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0)));
    });

    describe('invalid values', () => {
      test.each([
        ['2019-05-21'], // Date without time
        ['2019-5-1T12:13:14Z'], // Date without zero padding
        ['2021-02-29T12:00:00Z'], // invalid leap date
        ['2019-05-21T12:13:14'], // missing zone
        ['2019-05-21T12:13:14.123Z'], // milliseconds not allowed
        ['2019-05-21T12:13:14+3'], // invalid zone
        ['20190521T12:13:14Z'], // abreviated date form not supported
        ['2019-05-21T121314Z'], // abreviated time form not supported
        [Date.now()],
      ])('%s is invalid', (value: any) => expectViolations(value, Vluxon.dateTime(), defaultViolations.date(value, Path.ROOT, 'DateTime')));
    });

    describe('valid values', () => {
      test.each([
        ['2020-02-29T12:00:00Z', '2020-02-29T12:00:00Z'],
        ['2019-05-21T12:13:14Z', '2019-05-21T12:13:14Z'],
        ['2019-05-21T12:13:14+03', '2019-05-21T12:13:14+03:00'],
        ['2019-05-21T12:13:14-0300', '2019-05-21T12:13:14-03:00'],
        ['2019-05-21T12:13:14+03:15', '2019-05-21T12:13:14+03:15'],
      ])('%s is valid', (value: string, expected: string) => expectValid(value, Vluxon.dateTime().next(toJSON), expected));
    });
  });

  describe('dateTimeUtc', () => {
    test('null', () => expectViolations(null, Vluxon.dateTimeUtc(), defaultViolations.notNull()));

    test('valid utc dateTime converted', () => expectValid('2019-03-07T12:13:14Z', Vluxon.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('valid utc dateTime with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14+00:00', Vluxon.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('valid utc dateTime with +02:00 offset converted', () =>
      expectValid('2019-03-07T14:13:14+02:00', Vluxon.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('direct constructor', () => expect(new DateTimeUtcLuxon(DateTime.utc(2019, 1, 1, 1, 1, 1)).toJSON()).toEqual('2019-01-01T01:01:01Z'));

    test('convert dateTimeUtc to local time', () => {
      const dt = new DateTimeUtcLuxon(DateTime.fromISO('2019-05-21T12:13:14Z'));
      expect(new DateTimeLuxon(dt.dateTime.setZone(FixedOffsetZone.instance(3 * 60))).toJSON()).toEqual('2019-05-21T15:13:14+03:00');
    });

    test('setZone', () => {
      const utc = DateTimeUtcLuxon.fromISO('2022-10-23T23:00:00Z');
      const zoned = utc.setZone(FixedOffsetZone.instance(180));
      expect(zoned).toBeInstanceOf(DateTimeLuxon);
      expect(zoned.toJSON()).toEqual('2022-10-24T02:00:00+03:00');
    });

    test('utcOffset of dateTimeUtc', () => {
      const dt = new DateTimeUtcLuxon(DateTime.fromISO('2019-05-21T12:13:14+03:00'));
      expect(dt.dateTime.offset).toEqual(0);
    });

    test('invalid leap date throws', () => {
      expect(() => new DateTimeUtcLuxon(DateTime.fromISO('2021-02-29T12:00:00Z'))).toThrow();
    });

    test('any DateTimeUtcLuxon is valid', () => expectValid(new DateTimeUtcLuxon(DateTime.now()), Vluxon.dateTimeUtc()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateTimeUtc(), new DateTimeUtcLuxon(now));
    });

    test('apply', () => {
      const luxon = new DateTimeUtcLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0));
      expect(luxon.apply(dt => dt.year)).toEqual(2022);
    });

    test('wrap', () => {
      const luxon = new DateTimeUtcLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(DateTimeUtcLuxon);
      expect(result).toEqual(new DateTimeUtcLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0)));
    });

    describe('invalid values', () => {
      test.each([
        ['2019-05-21'], // Date without time
        ['2019-5-1T12:13:14Z'], // Date without zero padding
        ['2021-02-29T12:00:00Z'], // invalid leap date
        ['2019-05-21T12:13:14'], // missing zone
        ['2019-05-21T12:13:14.123Z'], // milliseconds not allowed
        ['2019-05-21T12:13:14+3'], // invalid zone
        ['20190521T12:13:14Z'], // abreviated date form not supported
        ['2019-05-21T121314Z'], // abreviated time form not supported
        [Date.now()],
      ])('%s is invalid', (value: any) => expectViolations(value, Vluxon.dateTimeUtc(), defaultViolations.date(value, Path.ROOT, 'DateTime')));
    });

    describe('valid values', () => {
      test.each([
        ['2020-02-29T12:00:00Z', '2020-02-29T12:00:00Z'],
        ['2019-05-21T12:13:14Z', '2019-05-21T12:13:14Z'],
        ['2019-05-21T12:13:14+03', '2019-05-21T09:13:14Z'],
        ['2019-05-21T12:13:14-0300', '2019-05-21T15:13:14Z'],
        ['2019-05-21T12:13:14+03:00', '2019-05-21T09:13:14Z'],
      ])('%s is valid', (value: string, expected: string) => expectValid(value, Vluxon.dateTimeUtc().next(toJSON), expected));
    });
  });

  describe('dateTimeMillis', () => {
    test('null', () => expectViolations(null, Vluxon.dateTimeMillis(), defaultViolations.notNull()));

    test('valid dateTimeMillis offset kept', () =>
      expectValid('2019-03-07T12:13:14.123+02', Vluxon.dateTimeMillis().next(toJSON), '2019-03-07T12:13:14.123+02:00'));

    test('valid dateTimeMillis with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14.123+00:00', Vluxon.dateTimeMillis().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('direct constructor', () =>
      expect(new DateTimeMillisLuxon(DateTime.local(2019, 1, 1, 1, 1, 1, 100, { zone: IANAZone.create('Europe/Helsinki') })).toJSON()).toEqual(
        '2019-01-01T01:01:01.100+02:00',
      ));

    test('convert dateTimeMillis to utc time', () => {
      const dt = new DateTimeMillisLuxon(DateTime.fromISO('2019-05-21T12:13:14+03'));
      expect(new DateTimeMillisUtcLuxon(dt).toJSON()).toEqual('2019-05-21T09:13:14.000Z');
    });

    test('utcOffset of dateTimeMillis', () => {
      const dt = new DateTimeMillisLuxon(DateTime.fromISO('2019-05-21T12:13:14+03:00'));
      expect(dt.dateTime.offset).toEqual(180);
    });

    test('setZone', () => {
      const local = DateTimeMillisLuxon.fromISO('2022-10-24T02:00:00.123+03');
      const zoned = local.setZone(FixedOffsetZone.utcInstance);
      expect(zoned).toBeInstanceOf(DateTimeMillisLuxon);
      expect(zoned.toJSON()).toEqual('2022-10-23T23:00:00.123Z');
    });

    test('invalid leap date throws', () => {
      expect(() => new DateTimeMillisLuxon(DateTime.fromISO('2021-02-29T12:00:00.000Z'))).toThrow();
    });

    test('any DateTimeMillisLuxon is valid', () => expectValid(new DateTimeMillisLuxon(DateTime.now()), Vluxon.dateTimeMillis()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateTimeMillis(), new DateTimeMillisLuxon(now));
    });

    test('instances are accepted across context boundaries', () => {
      const now = DateTime.now();
      expectValid({ dateTime: now}, Vluxon.dateTimeMillis(), new DateTimeMillisLuxon(now));
    });

    test('wrap', () => {
      const luxon = new DateTimeMillisLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0, 123));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(DateTimeMillisLuxon);
      expect(result).toEqual(new DateTimeMillisLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0, 123)));
    });

    describe('invalid values', () => {
      test.each([
        ['2019-05-21'], // Date without time
        ['2020-02-29T12:00:00.12Z'], // Three millis digits required
        ['2019-5-1T12:13:14.123Z'], // Date without zero padding
        ['2021-02-29T12:00:00.123Z'], // invalid leap date
        ['2019-05-21T12:13:14.123'], // missing zone
        ['2019-05-21T12:13:14Z'], // milliseconds required
        ['2019-05-21T12:13:14.123+3'], // invalid zone
        ['20190521T12:13:14.123Z'], // abreviated date form not supported
        ['2019-05-21T121314.123Z'], // abreviated time form not supported
        [Date.now()],
      ])('%s is invalid', (value: any) => expectViolations(value, Vluxon.dateTimeMillis(), defaultViolations.date(value, Path.ROOT, 'DateTimeMillis')));
    });

    describe('valid values', () => {
      test.each([
        ['2020-02-29T12:00:00.123Z', '2020-02-29T12:00:00.123Z'],
        ['2019-05-21T12:13:14.100Z', '2019-05-21T12:13:14.100Z'],
        ['2019-05-21T12:13:14.001+03', '2019-05-21T12:13:14.001+03:00'],
        ['2019-05-21T12:13:14.123-0300', '2019-05-21T12:13:14.123-03:00'],
        ['2019-05-21T12:13:14.123+03:15', '2019-05-21T12:13:14.123+03:15'],
      ])('%s is valid', (value: string, expected: string) => expectValid(value, Vluxon.dateTimeMillis().next(toJSON), expected));
    });
  });

  describe('dateTimeMillisUtc', () => {
    test('null', () => expectViolations(null, Vluxon.dateTimeMillisUtc(), defaultViolations.notNull()));

    test('valid utc dateTimeMillisUtc converted', () =>
      expectValid('2019-03-07T12:13:14.123Z', Vluxon.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('valid utc dateTime with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14.123+00:00', Vluxon.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('valid utc dateTime with +02:00 offset converted', () =>
      expectValid('2019-03-07T14:13:14.123+02:00', Vluxon.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('direct constructor', () => expect(new DateTimeMillisUtcLuxon(DateTime.utc(2019, 1, 1, 1, 1, 1, 100)).toJSON()).toEqual('2019-01-01T01:01:01.100Z'));

    test('convert dateTimeMillisUtc to local time', () => {
      const dt = new DateTimeMillisUtcLuxon(DateTime.fromISO('2019-05-21T12:13:14.001Z'));
      expect(new DateTimeMillisLuxon(dt.dateTime.setZone(FixedOffsetZone.instance(3 * 60))).toJSON()).toEqual('2019-05-21T15:13:14.001+03:00');
    });

    test('utcOffset of dateTimeMillisUtc', () => {
      const dt = new DateTimeMillisUtcLuxon(DateTime.fromISO('2019-05-21T12:13:14.123+03:00'));
      expect(dt.dateTime.offset).toEqual(0);
    });

    test('setZone', () => {
      const utc = DateTimeMillisUtcLuxon.fromISO('2022-10-23T23:00:00.123Z');
      const zoned = utc.setZone(FixedOffsetZone.instance(180));
      expect(zoned).toBeInstanceOf(DateTimeMillisLuxon);
      expect(zoned.toJSON()).toEqual('2022-10-24T02:00:00.123+03:00');
    });

    test('invalid leap date throws', () => {
      expect(() => new DateTimeMillisUtcLuxon(DateTime.fromISO('2021-02-29T12:00:00.123Z'))).toThrow();
    });

    test('any DateTimeMillisUtcLuxon is valid', () => expectValid(new DateTimeMillisUtcLuxon(DateTime.now()), Vluxon.dateTimeMillisUtc()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateTimeMillisUtc(), new DateTimeMillisUtcLuxon(now));
    });

    test('apply', () => {
      const luxon = new DateTimeMillisUtcLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0, 123));
      expect(luxon.apply(dt => dt.year)).toEqual(2022);
    });

    test('wrap', () => {
      const luxon = new DateTimeMillisUtcLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0, 123));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(DateTimeMillisUtcLuxon);
      expect(result).toEqual(new DateTimeMillisUtcLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0, 123)));
    });

    describe('invalid values', () => {
      test.each([
        ['2019-05-21'], // Date without time
        ['2020-02-29T12:00:00.12Z'], // Three millis digits required
        ['2019-5-1T12:13:14.123Z'], // Date without zero padding
        ['2021-02-29T12:00:00.123Z'], // invalid leap date
        ['2019-05-21T12:13:14.123'], // missing zone
        ['2019-05-21T12:13:14Z'], // milliseconds required
        ['2019-05-21T12:13:14.123+3'], // invalid zone
        ['20190521T12:13:14.123Z'], // abreviated date form not supported
        ['2019-05-21T121314.123Z'], // abreviated time form not supported
        [Date.now()],
      ])('%s is invalid', (value: any) => expectViolations(value, Vluxon.dateTimeMillisUtc(), defaultViolations.date(value, Path.ROOT, 'DateTimeMillis')));
    });

    describe('valid values', () => {
      test.each([
        ['2020-02-29T12:00:00.123Z', '2020-02-29T12:00:00.123Z'],
        ['2019-05-21T12:13:14.001Z', '2019-05-21T12:13:14.001Z'],
        ['2019-05-21T12:13:14.100+03', '2019-05-21T09:13:14.100Z'],
        ['2019-05-21T12:13:14.123-0300', '2019-05-21T15:13:14.123Z'],
        ['2019-05-21T12:13:14.123+03:00', '2019-05-21T09:13:14.123Z'],
        ['2019-05-21T24:00:00.000Z', '2019-05-22T00:00:00.000Z'],
      ])('%s is valid', (value: string, expected: string) => expectValid(value, Vluxon.dateTimeMillisUtc().next(toJSON), expected));
    });
  });

  describe('duration', () => {
    test('null is invalid', () => expectViolations(null, Vluxon.duration(), defaultViolations.notNull()));

    test('undefined is invalid', () => expectViolations(null, Vluxon.duration(), defaultViolations.notNull()));

    test('ABC is invalid', () => expectViolations('ABC', Vluxon.duration(), new TypeMismatch(Path.ROOT, 'Duration', 'ABC')));

    test('parse serialize roundtrip', () => expectValid('P23DT23H', Vluxon.duration().next(toJSON), 'P23DT23H'));

    test('any valid Duration is valid', () => expectValid(Duration.fromMillis(12345), Vluxon.duration()));

    test('plain number is invalid', () => expectViolations(123, Vluxon.duration(), new TypeMismatch(Path.ROOT, 'Duration', 123)));
  });

  describe('timeDuration', () => {
    test('null is invalid', () => expectViolations(null, Vluxon.timeDuration(), defaultViolations.notNull()));

    test('undefined is invalid', () => expectViolations(null, Vluxon.timeDuration(), defaultViolations.notNull()));

    test('ABC is invalid', () => expectViolations('ABC', Vluxon.timeDuration(), new TypeMismatch(Path.ROOT, 'TimeDuration', 'ABC')));

    test('parse serialize roundtrip', () => expectValid('000900', Vluxon.timeDuration().next(toJSON), 'PT9M'));

    test('any valid Duration is valid', () => expectValid(Duration.fromMillis(12345), Vluxon.timeDuration()));

    test('plain number is invalid', () => expectViolations(123, Vluxon.timeDuration(), new TypeMismatch(Path.ROOT, 'TimeDuration', 123)));
  });

  describe('custom format', () => {
    const validator = new LuxonValidator({
      type: 'Date',
      proto: DateTimeUtcLuxon,
      pattern: /^\d{4}-\d{2}-\d{2}(?<zone>[+-]\d{2})?$/,
      parser: (value: string, match: RegExpExecArray) => {
        if (match.groups?.zone) {
          return DateTime.fromFormat(value, 'yyyy-MM-ddZZ');
        }
        return DateTime.fromISO(value, { zone: FixedOffsetZone.utcInstance });
      },
    });

    test('date with timezone', () => expectValid('2022-08-19+03', validator.next(toJSON), '2022-08-18T21:00:00Z'));

    test('date without timezone', () => expectValid('2022-08-19', validator.next(toJSON), '2022-08-19T00:00:00Z'));
  });

  describe('Plain Luxon DateTime Validators', () => {
    describe('dateTimeFromISO', () => {
      test('valid string input', async () =>
        expectValid('2022-08-26', Vluxon.dateTimeFromISO({ zone: FixedOffsetZone.utcInstance }), DateTime.utc(2022, 8, 26)));
      test('invalid string input', async () =>
        expectViolations('22 08 26', Vluxon.dateTimeFromISO(), defaultViolations.date('22 08 26', Path.ROOT, 'ISODateTime')));
    });
    describe('dateTimeFromRFC2822', () => {
      test('valid string input', async () =>
        expectValid(
          'Tue, 01 Nov 2016 13:23:12 +0630',
          Vluxon.dateTimeFromRFC2822({ zone: FixedOffsetZone.utcInstance }),
          DateTime.fromRFC2822('Tue, 01 Nov 2016 13:23:12 +0630', { zone: FixedOffsetZone.utcInstance }),
        ));
      test('invalid string input', async () =>
        expectViolations(
          'Foo, 01 Nov 2016 13:23:12 +0630',
          Vluxon.dateTimeFromRFC2822(),
          defaultViolations.date('Foo, 01 Nov 2016 13:23:12 +0630', Path.ROOT, 'RFC2822DateTime'),
        ));
    });
    describe('dateTimeFromHTTP', () => {
      test('valid input', async () =>
        expectValid('Sunday, 06-Nov-94 08:49:37 GMT', Vluxon.dateTimeFromHTTP(), DateTime.fromHTTP('Sunday, 06-Nov-94 08:49:37 GMT', { setZone: true })));
      test('invalid input', async () => expectViolations('foo', Vluxon.dateTimeFromHTTP(), new TypeMismatch(Path.ROOT, 'HTTPDateTime', 'foo')));
    });
    describe('dateTimeFromSQL', () => {
      test('valid input', async () =>
        expectValid('2017-05-15 09:24:15', Vluxon.dateTimeFromSQL(), DateTime.fromSQL('2017-05-15 09:24:15', { zone: FixedOffsetZone.utcInstance })));
      test('invalid input', async () => expectViolations('foo', Vluxon.dateTimeFromSQL(), new TypeMismatch(Path.ROOT, 'SQLDateTime', 'foo')));
    });
    describe('dateTimeFromMillis', () => {
      test('null', async () => expectViolations(null, Vluxon.dateTimeFromMillis(), defaultViolations.notNull(Path.ROOT)));
      test('valid DateTime', async () => expectValid(DateTime.now(), Vluxon.dateTimeFromMillis()));
      test('invalid DateTime', async () => {
        const dt = DateTime.utc(2021, 2, 29);
        await expectViolations(dt, Vluxon.dateTimeFromMillis(), defaultViolations.date(dt, Path.ROOT, 'MillisDateTime'));
      });
      test('valid input', async () =>
        expectValid(
          1661509616811,
          Vluxon.dateTimeFromMillis({ zone: FixedOffsetZone.instance(180) }),
          DateTime.fromMillis(1661509616811, { zone: FixedOffsetZone.instance(180) }),
        ));
      test('invalid input', async () => expectViolations('foo', Vluxon.dateTimeFromMillis(), new TypeMismatch(Path.ROOT, 'MillisDateTime', 'foo')));
    });
    describe('dateTimeFromSeconds', () => {
      test('valid input', async () =>
        expectValid(
          1661509616,
          Vluxon.dateTimeFromSeconds({ zone: FixedOffsetZone.instance(180) }),
          DateTime.fromSeconds(1661509616, { zone: FixedOffsetZone.instance(180) }),
        ));
      test('invalid input', async () => expectViolations('foo', Vluxon.dateTimeFromSeconds(), new TypeMismatch(Path.ROOT, 'SecondsDateTime', 'foo')));
    });
  });
});
