import { Validator, ValidatorOptions, ValidationResult, V, Violation, defaultViolations, TypeMismatch } from '@finnair/v-validation';
import { Vluxon } from './Vluxon';
import { DateLuxon, DateTimeLuxon, DateTimeMillisLuxon, DateTimeMillisUtcLuxon, DateTimeUtcLuxon, DateUtcLuxon, LuxonDateTime, TimeLuxon } from './luxon';
import { DateTime, Duration, FixedOffsetZone, IANAZone, Settings } from 'luxon';
import { Path } from '@finnair/path';

async function expectViolations(value: any, validator: Validator, ...violations: Violation[]) {
  const result = await validator.validate(value);
  expect(result).toEqual(new ValidationResult(violations));
}

async function expectValid(value: any, validator: Validator, convertedValue?: any, ctx?: ValidatorOptions) {
  const result = await validator.validate(value, ctx);
  return verifyValid(result, value, convertedValue);
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

describe('Vluxon', () => {
  beforeAll(() => Settings.defaultZone = 'Europe/Helsinki')
  afterAll(() => Settings.defaultZone = 'system')

  const toJSON = V.map((value: any) => value.toJSON());
  const toLuxon = V.map((value: LuxonDateTime) => value.dateTime);

  test('valueOf', () => {
    const now = DateTime.now();
    expect(new DateTimeLuxon(now).valueOf()).toBe(now.valueOf())
  })

  describe('equals', () => {
    test('is equal', () => {
      const now = DateTime.now();
      expect(new DateTimeLuxon(now).equals(new DateTimeLuxon(now))).toBe(true)
    })
    test('not equal (class)', () => {
      const now = DateTime.now();
      expect(new DateTimeLuxon(now).equals(new DateTimeUtcLuxon(now))).toBe(false)
    })
  })

  describe('date', () => {
    // NOTE: These tests rely on default zone Europe/Helsinki which is set in beforeAll

    test('valid date value', () => expectValid('2019-03-07', Vluxon.date().next(toLuxon), DateTime.fromISO('2019-03-07T00:00:00')));

    test('valid date converted', () => expectValid('2019-03-07', Vluxon.date().next(toJSON), '2019-03-07'));

    test('direct constructor', () => expect(new DateLuxon(DateTime.local(2019, 1, 1)).toJSON()).toEqual('2019-01-01'));

    test('local time of date', () => expect(new DateLuxon(DateTime.local(2019, 1, 1, 12, 13, 14)).dateTime).toEqual(DateTime.fromISO('2019-01-01T00:00:00+02')));

    test('any DateLuxon is valid', () => expectValid(new DateLuxon(DateTime.now()), Vluxon.date()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.date(), new DateLuxon(now))
    });

    test('fromISO', () => {
      const value = '2019-03-07T00:00:00Z'
      const wrapper = DateLuxon.fromISO(value);
      expect(wrapper).toBeInstanceOf(DateLuxon)
      expect(wrapper).toEqual(new DateLuxon(DateTime.fromISO(value)))
    })

    test('wrap', () => {
      const luxon = new DateLuxon(DateTime.utc(2022, 1, 15, 1, 2, 3));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(DateLuxon);
      expect(result).toEqual(new DateLuxon(DateTime.utc(2022, 2, 15)));
    })

    describe('invalid values', () => {
      test.each(
        [
          ['2019-05-21T12:00:00'], // Date with time
          ['2019-05'], // Valid ISO not allowed
          ['2019-05'], // Time zone not allowed
          ['2019-02-29'], // invalid leap date
          ['20160525'], // Valid ISO not allowed
          [Date.now()],
        ])(
        '%s is invalid', 
        (value: any) => expectViolations(value, Vluxon.date(), defaultViolations.date(value)))
    })

    describe('valid values', () => {
      test.each(
        [
          ['2019-01-01'],
          ['2020-02-29'], // leap day
          ['1970-01-01'],
        ])(
        '%s is valid', 
        (value: string) => expectValid(value, Vluxon.date().next(toJSON), value))
    })
  });

  describe('dateUtc', () => {
    test('valid utc date value', () => expectValid('2019-03-07', Vluxon.dateUtc().next(toLuxon), DateTime.fromISO('2019-03-07T00:00:00Z', {setZone: true})));

    test('valid utc date converted', () => expectValid('2019-03-07', Vluxon.dateUtc().next(toJSON), '2019-03-07'));

    test('direct constructor', () => expect(new DateUtcLuxon(DateTime.utc(2019, 1, 1)).toJSON()).toEqual('2019-01-01'));    

    test('any DateUtcLuxon is valid', () => expectValid(new DateUtcLuxon(DateTime.now()), Vluxon.dateUtc()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateUtc(), new DateUtcLuxon(now))
    });

    test('fromISO', () => {
      const value = '2019-03-07T00:00:00Z'
      const wrapper = DateUtcLuxon.fromISO(value);
      expect(wrapper).toBeInstanceOf(DateUtcLuxon)
      expect(wrapper).toEqual(new DateUtcLuxon(DateTime.fromISO(value)))
    })

    test('wrap', () => {
      const luxon = new DateUtcLuxon(DateTime.utc(2022, 1, 15, 1, 2, 3));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(DateUtcLuxon);
      expect(result).toEqual(new DateUtcLuxon(DateTime.utc(2022, 2, 15)));
    })

    describe('invalid values', () => {
      test.each(
        [
          ['2019-05-21T12:00:00'], // Date with time
          ['2019-05'], // Valid ISO not allowed
          ['2019-02-29'], // invalid leap date
          ['20160525'], // Valid ISO not allowed
          [Date.now()],
        ])(
        '%s is invalid', 
        (value: any) => expectViolations(value, Vluxon.dateUtc(), defaultViolations.date(value)))
    })

    describe('valid values', () => {
      test.each(
        [
          ['2019-01-01'],
          ['2020-02-29'], // leap day
          ['1970-01-01'],
        ])(
        '%s is valid', 
        (value: string) => expectValid(value, Vluxon.dateUtc().next(toJSON), value))
    })
  });

  describe('dateTime', () => {
    test('null', () => expectViolations(null, Vluxon.dateTime(), defaultViolations.notNull()))

    test('valid dateTime offset kept', () => expectValid('2019-03-07T12:13:14+02', Vluxon.dateTime().next(toJSON), '2019-03-07T12:13:14+02:00'));

    test('valid dateTime with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14+00:00', Vluxon.dateTime().next(toJSON), '2019-03-07T12:13:14Z'));

    test('direct constructor', () => expect(new DateTimeLuxon(DateTime.local(2019, 1, 1, 1, 1, 1, { zone: IANAZone.create('Europe/Helsinki') })).toJSON()).toEqual('2019-01-01T01:01:01+02:00'));

    test('convert dateTime to utc time', () => {
      const dt = new DateTimeLuxon(DateTime.fromISO('2019-05-21T12:13:14+03'))
      expect(
        new DateTimeUtcLuxon(dt).toJSON()
      ).toEqual('2019-05-21T09:13:14Z');
    });

    test('utcOffset of dateTime', () => {
      const dt = new DateTimeLuxon(DateTime.fromISO('2019-05-21T12:13:14+03:00'))
      expect(dt.dateTime.offset).toEqual(180);
    });

    test('invalid DateTime throws', () => {
      expect(() => new DateTimeLuxon(DateTime.fromISO('2021-02-29T12:00:00'))).toThrow()
    })

    test('any DateTimeLuxon is valid', () => expectValid(new DateTimeLuxon(DateTime.now()), Vluxon.dateTime()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateTime(), new DateTimeLuxon(now))
    });

    test('fromISO', () => {
      const value = '2019-03-07T00:00:00Z'
      const wrapper = DateTimeLuxon.fromISO(value);
      expect(wrapper).toBeInstanceOf(DateTimeLuxon)
      expect(wrapper).toEqual(new DateTimeLuxon(DateTime.fromISO(value)))
    })

    test('wrap', () => {
      const luxon = new DateTimeLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })))
      expect(result).toBeInstanceOf(DateTimeLuxon);
      expect(result).toEqual(new DateTimeLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0)))
    })

    describe('invalid values', () => {
      test.each(
        [
          ['2019-05-21'], // Date without time
          ['2019-5-1T12:13:14Z'], // Date without zero padding
          ['2021-02-29T12:00:00Z'], // invalid leap date
          ['2019-05-21T12:13:14'], // missing zone
          ['2019-05-21T12:13:14.123Z'], // milliseconds not allowed
          ['2019-05-21T12:13:14+3'], // invalid zone
          ['20190521T12:13:14Z'], // abreviated date form not supported
          ['2019-05-21T121314Z'], // abreviated time form not supported
          [Date.now()],
        ])(
        '%s is invalid', 
        (value: any) => expectViolations(value, Vluxon.dateTime(), defaultViolations.date(value, Path.ROOT, 'DateTime')))
    })

    describe('valid values', () => {
      test.each(
        [
          ['2020-02-29T12:00:00Z', '2020-02-29T12:00:00Z'],
          ['2019-05-21T12:13:14Z', '2019-05-21T12:13:14Z'],
          ['2019-05-21T12:13:14+03', '2019-05-21T12:13:14+03:00'],
          ['2019-05-21T12:13:14-0300', '2019-05-21T12:13:14-03:00'],
          ['2019-05-21T12:13:14+03:15', '2019-05-21T12:13:14+03:15'],
        ])(
        '%s is valid', 
        (value: string, expected: string) => expectValid(value, Vluxon.dateTime().next(toJSON), expected))
    })

  });

  describe('dateTimeUtc', () => {
    test('null', () => expectViolations(null, Vluxon.dateTimeUtc(), defaultViolations.notNull()))

    test('valid utc dateTime converted', () => expectValid('2019-03-07T12:13:14Z', Vluxon.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('valid utc dateTime with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14+00:00', Vluxon.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('valid utc dateTime with +02:00 offset converted', () =>
      expectValid('2019-03-07T14:13:14+02:00', Vluxon.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('direct constructor', () => expect(new DateTimeUtcLuxon(DateTime.utc(2019, 1, 1, 1, 1, 1)).toJSON()).toEqual('2019-01-01T01:01:01Z'));

    test('convert dateTimeUtc to local time', () => {
      const dt = new DateTimeUtcLuxon(DateTime.fromISO('2019-05-21T12:13:14Z'))
      expect(
        new DateTimeLuxon(dt.dateTime.setZone(FixedOffsetZone.instance(3*60))).toJSON()
      ).toEqual('2019-05-21T15:13:14+03:00');
    });

    test('utcOffset of dateTimeUtc', () => {
      const dt = new DateTimeUtcLuxon(DateTime.fromISO('2019-05-21T12:13:14+03:00'))
      expect(dt.dateTime.offset).toEqual(0);
    });

    test('invalid leap date throws', () => {
      expect(() => new DateTimeUtcLuxon(DateTime.fromISO('2021-02-29T12:00:00Z'))).toThrow()
    })

    test('any DateTimeUtcLuxon is valid', () => expectValid(new DateTimeUtcLuxon(DateTime.now()), Vluxon.dateTimeUtc()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateTimeUtc(), new DateTimeUtcLuxon(now))
    });

    test('fromISO', () => {
      const value = '2019-03-07T00:00:00Z'
      const wrapper = DateTimeUtcLuxon.fromISO(value);
      expect(wrapper).toBeInstanceOf(DateTimeUtcLuxon)
      expect(wrapper).toEqual(new DateTimeUtcLuxon(DateTime.fromISO(value)))
    })

    test('apply', () => {
      const luxon = new DateTimeUtcLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0));
      expect(luxon.apply(dt => dt.year)).toEqual(2022)
    })

    test('wrap', () => {
      const luxon = new DateTimeUtcLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })))
      expect(result).toBeInstanceOf(DateTimeUtcLuxon);
      expect(result).toEqual(new DateTimeUtcLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0)))
    })

    describe('invalid values', () => {
      test.each(
        [
          ['2019-05-21'], // Date without time
          ['2019-5-1T12:13:14Z'], // Date without zero padding
          ['2021-02-29T12:00:00Z'], // invalid leap date
          ['2019-05-21T12:13:14'], // missing zone
          ['2019-05-21T12:13:14.123Z'], // milliseconds not allowed
          ['2019-05-21T12:13:14+3'], // invalid zone
          ['20190521T12:13:14Z'], // abreviated date form not supported
          ['2019-05-21T121314Z'], // abreviated time form not supported
          [Date.now()],
        ])(
        '%s is invalid', 
        (value: any) => expectViolations(value, Vluxon.dateTimeUtc(), defaultViolations.date(value, Path.ROOT, 'DateTime')))
    })

    describe('valid values', () => {
      test.each(
        [
          ['2020-02-29T12:00:00Z', '2020-02-29T12:00:00Z'],
          ['2019-05-21T12:13:14Z', '2019-05-21T12:13:14Z'],
          ['2019-05-21T12:13:14+03', '2019-05-21T09:13:14Z'],
          ['2019-05-21T12:13:14-0300', '2019-05-21T15:13:14Z'],
          ['2019-05-21T12:13:14+03:00', '2019-05-21T09:13:14Z'],
        ])(
        '%s is valid', 
        (value: string, expected: string) => expectValid(value, Vluxon.dateTimeUtc().next(toJSON), expected))
    })
  });

  describe('dateTimeMillis', () => {
    test('null', () => expectViolations(null, Vluxon.dateTimeMillis(), defaultViolations.notNull()))

    test('valid dateTimeMillis offset kept', () => expectValid('2019-03-07T12:13:14.123+02', Vluxon.dateTimeMillis().next(toJSON), '2019-03-07T12:13:14.123+02:00'));

    test('valid dateTimeMillis with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14.123+00:00', Vluxon.dateTimeMillis().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('direct constructor', () => 
      expect(new DateTimeMillisLuxon(DateTime.local(2019, 1, 1, 1, 1, 1, 100, { zone: IANAZone.create('Europe/Helsinki') })).toJSON())
        .toEqual('2019-01-01T01:01:01.100+02:00'));

    test('convert dateTimeMillis to utc time', () => {
      const dt = new DateTimeMillisLuxon(DateTime.fromISO('2019-05-21T12:13:14+03'))
      expect(
        new DateTimeMillisUtcLuxon(dt).toJSON()
      ).toEqual('2019-05-21T09:13:14.000Z');
    });

    test('utcOffset of dateTimeMillis', () => {
      const dt = new DateTimeMillisLuxon(DateTime.fromISO('2019-05-21T12:13:14+03:00'))
      expect(dt.dateTime.offset).toEqual(180);
    });

    test('invalid leap date throws', () => {
      expect(() => new DateTimeMillisLuxon(DateTime.fromISO('2021-02-29T12:00:00.000Z'))).toThrow()
    })

    test('any DateTimeMillisLuxon is valid', () => expectValid(new DateTimeMillisLuxon(DateTime.now()), Vluxon.dateTimeMillis()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateTimeMillis(), new DateTimeMillisLuxon(now))
    });

    test('fromISO', () => {
      const value = '2019-03-07T00:00:00Z'
      const wrapper = DateTimeMillisLuxon.fromISO(value);
      expect(wrapper).toBeInstanceOf(DateTimeMillisLuxon)
      expect(wrapper).toEqual(new DateTimeMillisLuxon(DateTime.fromISO(value)))
    })

    test('wrap', () => {
      const luxon = new DateTimeMillisLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0, 123));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(DateTimeMillisLuxon);
      expect(result).toEqual(new DateTimeMillisLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0, 123)));
    })

    describe('invalid values', () => {
      test.each(
        [
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
        ])(
        '%s is invalid', 
        (value: any) => expectViolations(value, Vluxon.dateTimeMillis(), defaultViolations.date(value, Path.ROOT, 'DateTimeMillis')))
    })

    describe('valid values', () => {
      test.each(
        [
          ['2020-02-29T12:00:00.123Z', '2020-02-29T12:00:00.123Z'],
          ['2019-05-21T12:13:14.100Z', '2019-05-21T12:13:14.100Z'],
          ['2019-05-21T12:13:14.001+03', '2019-05-21T12:13:14.001+03:00'],
          ['2019-05-21T12:13:14.123-0300', '2019-05-21T12:13:14.123-03:00'],
          ['2019-05-21T12:13:14.123+03:15', '2019-05-21T12:13:14.123+03:15'],
        ])(
        '%s is valid', 
        (value: string, expected: string) => expectValid(value, Vluxon.dateTimeMillis().next(toJSON), expected))
    })
  });

  describe('dateTimeMillisUtc', () => {
    test('null', () => expectViolations(null, Vluxon.dateTimeMillisUtc(), defaultViolations.notNull()))

    test('valid utc dateTimeMillisUtc converted', () => expectValid('2019-03-07T12:13:14.123Z', Vluxon.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('valid utc dateTime with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14.123+00:00', Vluxon.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('valid utc dateTime with +02:00 offset converted', () =>
      expectValid('2019-03-07T14:13:14.123+02:00', Vluxon.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('direct constructor', () => expect(new DateTimeMillisUtcLuxon(DateTime.utc(2019, 1, 1, 1, 1, 1, 100)).toJSON()).toEqual('2019-01-01T01:01:01.100Z'));

    test('convert dateTimeMillisUtc to local time', () => {
      const dt = new DateTimeMillisUtcLuxon(DateTime.fromISO('2019-05-21T12:13:14.001Z'))
      expect(
        new DateTimeMillisLuxon(dt.dateTime.setZone(FixedOffsetZone.instance(3*60))).toJSON()
      ).toEqual('2019-05-21T15:13:14.001+03:00');
    });

    test('utcOffset of dateTimeMillisUtc', () => {
      const dt = new DateTimeMillisUtcLuxon(DateTime.fromISO('2019-05-21T12:13:14.123+03:00'))
      expect(dt.dateTime.offset).toEqual(0);
    });

    test('invalid leap date throws', () => {
      expect(() => new DateTimeMillisUtcLuxon(DateTime.fromISO('2021-02-29T12:00:00.123Z'))).toThrow()
    })

    test('any DateTimeMillisUtcLuxon is valid', () => expectValid(new DateTimeMillisUtcLuxon(DateTime.now()), Vluxon.dateTimeMillisUtc()));

    test('any valid DateTime is valid and wrapped', () => {
      const now = DateTime.now();
      expectValid(now, Vluxon.dateTimeMillisUtc(), new DateTimeMillisUtcLuxon(now))
    });

    test('fromISO', () => {
      const value = '2019-03-07T00:00:00Z'
      const wrapper = DateTimeMillisUtcLuxon.fromISO(value);
      expect(wrapper).toBeInstanceOf(DateTimeMillisUtcLuxon)
      expect(wrapper).toEqual(new DateTimeMillisUtcLuxon(DateTime.fromISO(value)))
    })

    test('apply', () => {
      const luxon = new DateTimeMillisUtcLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0, 123));
      expect(luxon.apply(dt => dt.year)).toEqual(2022)
    })

    test('wrap', () => {
      const luxon = new DateTimeMillisUtcLuxon(DateTime.utc(2022, 1, 15, 12, 30, 0, 123));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ month: 1 })));
      expect(result).toBeInstanceOf(DateTimeMillisUtcLuxon);
      expect(result).toEqual(new DateTimeMillisUtcLuxon(DateTime.utc(2022, 2, 15, 12, 30, 0, 123)));
    })

    describe('invalid values', () => {
      test.each(
        [
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
        ])(
        '%s is invalid', 
        (value: any) => expectViolations(value, Vluxon.dateTimeMillisUtc(), defaultViolations.date(value, Path.ROOT, 'DateTimeMillis')))
    })

    describe('valid values', () => {
      test.each(
        [
          ['2020-02-29T12:00:00.123Z', '2020-02-29T12:00:00.123Z'],
          ['2019-05-21T12:13:14.001Z', '2019-05-21T12:13:14.001Z'],
          ['2019-05-21T12:13:14.100+03', '2019-05-21T09:13:14.100Z'],
          ['2019-05-21T12:13:14.123-0300', '2019-05-21T15:13:14.123Z'],
          ['2019-05-21T12:13:14.123+03:00', '2019-05-21T09:13:14.123Z'],
          ['2019-05-21T24:00:00.000Z', '2019-05-22T00:00:00.000Z'],
        ])(
        '%s is valid', 
        (value: string, expected: string) => expectValid(value, Vluxon.dateTimeMillisUtc().next(toJSON), expected))
    })
  });

  describe('time', () => {
    // NOTE: These tests rely on default zone Europe/Helsinki which is set in beforeAll

    test('valid time value', () => expectValid('12:00:00', Vluxon.time().next(toLuxon), DateTime.fromISO('12:00:00')));

    test('24:00:00 is normalized to 00:00:00 next day', () => expectValid('24:00:00', Vluxon.time().next(toLuxon), DateTime.fromISO('00:00:00').plus({day: 1})));

    test('valid time toJSON', () => expectValid('12:13:14', Vluxon.time().next(toJSON), '12:13:14'));

    test('direct constructor', () => expect(new TimeLuxon(DateTime.local(2019, 1, 1, 1, 2, 3)).toJSON()).toEqual('01:02:03'));

    test('local time of date', () => expect(new TimeLuxon(DateTime.local(2019, 1, 1, 12, 13, 14)).dateTime).toEqual(DateTime.fromISO('2019-01-01T12:13:14+02')));

    test('fromISO', () => {
      const value = '2019-03-07T00:00:00Z'
      const wrapper = TimeLuxon.fromISO(value);
      expect(wrapper).toBeInstanceOf(TimeLuxon)
      expect(wrapper).toEqual(new TimeLuxon(DateTime.fromISO(value)))
    })

    test('wrap', () => {
      const luxon = new TimeLuxon(DateTime.utc(2022, 1, 15, 1, 2, 3));
      const result = luxon.wrap(dt => dt.plus(Duration.fromObject({ hour: 1 })));
      expect(result).toBeInstanceOf(TimeLuxon);
      expect(result).toEqual(new TimeLuxon(DateTime.utc(2022, 1, 15, 2, 2, 3)));
    })

    describe('invalid values', () => {
      test.each(
        [
          ['2019-05-21T12:00:00'], // Date with time
          ['09:24'], // Valid ISO not allowed without seconds
          ['2019-05'], // Time zone not allowed
          ['09:24:15.123'], // Valid ISO not allowed with millis
          ['24:00:01'],
          ['12:60:00'],
          ['12:00:60'],
          [Date.now()],
        ])(
        '%s is invalid', 
        (value: any) => expectViolations(value, Vluxon.time(), defaultViolations.date(value, Path.ROOT, 'Time')))
    })

    describe('valid values', () => {
      test.each(
        [
          ['00:00:00'],
          ['12:13:15'],
        ])(
        '%s is valid', 
        (value: string) => expectValid(value, Vluxon.time().next(toJSON), value))
    })
  });

  describe('duration', () => {
    test('null is invalid', () => expectViolations(null, Vluxon.duration(), defaultViolations.notNull()));

    test('undefined is invalid', () => expectViolations(null, Vluxon.duration(), defaultViolations.notNull()));

    test('ABC is invalid', () => expectViolations('ABC', Vluxon.duration(), new TypeMismatch(Path.ROOT, 'Duration', 'ABC')));

    test('parse serialize roundtrip', () => expectValid('P23DT23H', Vluxon.duration().next(toJSON), 'P23DT23H'));

    test('any valid Duration is valid', () => expectValid(Duration.fromMillis(12345), Vluxon.duration()))
  });

});
