import moment, { Moment } from 'moment';
import { V, defaultViolations, Validator, ValidatorOptions, ValidationResult, Violation, TypeMismatch } from '@finnair/v-validation';
import { Path } from '@finnair/path';
import { Vmoment, dateUtcMoment, dateTimeUtcMoment, dateTimeMoment, timeMoment, dateMoment, dateTimeMillisUtcMoment, dateTimeMillisMoment } from './Vmoment';

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

describe('moment', () => {
  const toJSON = V.map((value: any) => value.toJSON());
  const toDate = V.map((value: any) => value.toDate());

  test('null is invalid', () => expectViolations(null, Vmoment.date(), defaultViolations.notNull()));

  test('undefined is invalid', () => expectViolations(null, Vmoment.date(), defaultViolations.notNull()));

  test('construct from Moment', () => {
    const m = moment();
    expect(m.isSame(dateTimeMillisUtcMoment(m))).toBe(true);
    expect(m.isSame(dateTimeUtcMoment(m))).toBe(true);
    expect(dateTimeUtcMoment(m).toJSON()).toEqual(m.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z');
  });

  describe('local date', () => {
    test('valid local date converted', () => expectValid('2019-03-07', Vmoment.date().next(toJSON), '2019-03-07'));

    test('invalid', () => expectViolations('2019.03.07', Vmoment.date(), defaultViolations.date('2019.03.07')));

    test('clone', () => expectCloneToMatch(dateMoment()));
  });

  describe('local dateTime', () => {
    test('retain timezone', () => expectValid('2019-03-07T14:13:14+02:00', Vmoment.dateTime().next(toJSON), '2019-03-07T14:13:14+02:00'));

    test('valid local dateTime with +02:00 offset converted', () =>
      expectValid('2019-03-07T14:13:14+02:00', Vmoment.dateTime().next(toJSON), '2019-03-07T14:13:14+02:00'));

    test('clone', () => expectCloneToMatch(dateTimeMoment()));
  });

  describe('dateUtc', () => {
    test('valid utc date value', () => expectValid('2019-03-07', Vmoment.dateUtc().next(toDate), new Date('2019-03-07T00:00:00Z')));

    test('valid utc date converted', () => expectValid('2019-03-07', Vmoment.dateUtc().next(toJSON), '2019-03-07'));

    test('array constructor', () => expect(dateUtcMoment([2019, 0, 1]).toJSON()).toEqual('2019-01-01'));

    test('clone', () => expectCloneToMatch(dateUtcMoment()));
  });

  describe('dateTimeUtc', () => {
    test('valid utc dateTime converted', () => expectValid('2019-03-07T12:13:14Z', Vmoment.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('valid utc dateTime with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14+00:00', Vmoment.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('valid utc dateTime with +02:00 offset converted', () =>
      expectValid('2019-03-07T14:13:14+02:00', Vmoment.dateTimeUtc().next(toJSON), '2019-03-07T12:13:14Z'));

    test('array constructor', () => expect(dateTimeUtcMoment([2019, 0, 1, 1, 1, 1]).toJSON()).toEqual('2019-01-01T01:01:01Z'));

    test('convert dateTimeUtcMoment to local time', () => {
      const d: moment.Moment = dateTimeUtcMoment('2019-05-21T12:13:14Z');
      expect(
        d
          .clone()
          .utcOffset(3)
          .toJSON(),
      ).toEqual('2019-05-21T15:13:14+03:00');
    });

    test('utcOffset of dateTimeUtcMoment', () => {
      const d: moment.Moment = dateTimeUtcMoment('2019-05-21T12:13:14+03:00');
      expect(d.utcOffset()).toEqual(0);
    });

    test('clone', () => expectCloneToMatch(dateTimeUtcMoment()));
  });

  describe('dateTimeMillisUtc', () => {
    test('valid utc dateTime converted', () => expectValid('2019-03-07T12:13:14.123Z', Vmoment.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('valid utc dateTime with +00:00 offset converted', () =>
      expectValid('2019-03-07T12:13:14.123+00:00', Vmoment.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('valid utc dateTime with +02:00 offset converted', () =>
      expectValid('2019-03-07T14:13:14.123+02:00', Vmoment.dateTimeMillisUtc().next(toJSON), '2019-03-07T12:13:14.123Z'));

    test('array constructor', () => expect(dateTimeMillisUtcMoment([2019, 0, 1, 1, 1, 1, 123]).toJSON()).toEqual('2019-01-01T01:01:01.123Z'));

    test('millis required', () => expectViolations('2019-03-07T12:13:14Z', Vmoment.dateTimeMillis(), defaultViolations.date('2019-03-07T12:13:14Z', Path.ROOT, 'DateTimeMillis')));

    test('two digit millis is not allowed', () => expectViolations('2019-03-07T12:13:14.1Z', Vmoment.dateTimeMillis(), defaultViolations.date('2019-03-07T12:13:14.1Z', Path.ROOT, 'DateTimeMillis')));

    test('convert dateTimeMillisUtcMoment to local time', () => {
      const d: moment.Moment = dateTimeMillisUtcMoment('2019-05-21T12:13:14.123Z');
      expect(
        d
          .clone()
          .utcOffset(3)
          .toJSON(),
      ).toEqual('2019-05-21T15:13:14.123+03:00');
    });

    test('utcOffset of dateTimeMillisUtcMoment', () => {
      const d: moment.Moment = dateTimeMillisUtcMoment('2019-05-21T12:13:14.123+03:00');
      expect(d.utcOffset()).toEqual(0);
    });

    test('clone', () => expectCloneToMatch(dateTimeMillisUtcMoment()));
  });

  describe('local dateTimeMillis', () => {
    test('retain timezone', () => expectValid('2019-03-07T14:13:14.123+02:00', Vmoment.dateTimeMillis().next(toJSON), '2019-03-07T14:13:14.123+02:00'));

    test('valid local dateTime with +02:00 offset converted', () =>
      expectValid('2019-03-07T14:13:14.123+02:00', Vmoment.dateTimeMillis().next(toJSON), '2019-03-07T14:13:14.123+02:00'));

    test('clone', () => expectCloneToMatch(dateTimeMillisMoment()));
  });

  describe('normalize Moment', () => {
    test('valid utc date', () => expectValid(moment('2019-03-07T12:13:14Z'), Vmoment.dateUtc().next(toJSON), '2019-03-07'));
  });

  describe('duration', () => {
    test('null is invalid', () => expectViolations(null, Vmoment.duration(), defaultViolations.notNull()));

    test('undefined is invalid', () => expectViolations(null, Vmoment.duration(), defaultViolations.notNull()));

    test('ABC is invalid', () => expectViolations('ABC', Vmoment.duration(), new TypeMismatch(Path.ROOT, 'Duration', 'ABC')));

    test('parse serialize roundtrip', () => expectValid('P23DT23H', Vmoment.duration().next(toJSON), 'P23DT23H'));
  });

  describe('time', () => {
    test('retain original time', () => {
      expect(timeMoment('10:00:00').toJSON()).toEqual('10:00:00');
    });

    test('clone', () => expectCloneToMatch(timeMoment()));
  });

  describe('local time', () => {
    test('convert dateTimeMoment to local time', () => {
      const d: moment.Moment = dateTimeMoment('2019-05-21T12:13:14Z');
      expect(
        d
          .clone()
          .utcOffset(3)
          .toJSON(),
      ).toEqual('2019-05-21T15:13:14+03:00');
    });

    test('clone', () => expectCloneToMatch(dateTimeMoment()));
  });
});

function expectCloneToMatch(m: Moment) {
  const clone = m.clone();
  expect(clone).not.toBe(m);
  expect(clone.isSame(m)).toBe(true);
  expect(clone.toJSON()).toEqual(m.toJSON());
}
