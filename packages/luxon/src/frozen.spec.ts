import { describe, test, expect } from 'vitest';
import { DateTime } from 'luxon';
import { V } from '@finnair/v-validation';
import { Vluxon } from './Vluxon.js';

describe('V.frozen with Vluxon', () => {
  describe('wrapper validators support freeze', () => {
    const wrappers: Array<[string, ReturnType<typeof Vluxon.localDate>, string]> = [
      ['localDate', Vluxon.localDate(), '2026-09-17'],
      ['localTime', Vluxon.localTime(), '10:30:00'],
      ['localDateTime', Vluxon.localDateTime(), '2026-09-17T10:30:00'],
      ['dateTime', Vluxon.dateTime(), '2026-09-17T10:30:00Z'],
      ['dateTimeUtc', Vluxon.dateTimeUtc(), '2026-09-17T10:30:00Z'],
      ['dateTimeMillis', Vluxon.dateTimeMillis(), '2026-09-17T10:30:00.000Z'],
      ['dateTimeMillisUtc', Vluxon.dateTimeMillisUtc(), '2026-09-17T10:30:00.000Z'],
    ];

    test.each(wrappers)('%s reports supportsFreeze and yields a frozen wrapper', async (_name, validator, input) => {
      expect(validator.supportsFreeze()).toBe(true);

      const result = await V.frozen(validator).getValid(input);
      expect(Object.isFrozen(result)).toBe(true);
    });

    test('a schema of wrapper validators is accepted and its output frozen', async () => {
      const leg = V.objectType().properties({ id: V.string(), date: Vluxon.localDate(), std: Vluxon.dateTimeUtc() }).build();

      const result: any = await V.frozen(leg).getValid({ id: 'L1', date: '2026-09-17', std: '2026-09-17T10:30:00Z' });

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.date)).toBe(true);
      expect(() => {
        result.id = 'other';
      }).toThrow(TypeError);
    });

    test('the frozen wrapper blocks reassigning its dateTime', async () => {
      const result = await V.frozen(Vluxon.dateTimeUtc()).getValid('2026-09-17T10:30:00Z');

      expect(() => {
        (result as any).dateTime = DateTime.utc(2000, 1, 1);
      }).toThrow(TypeError);
    });
  });

  describe('plain Luxon validators do not support freeze', () => {
    const plain: Array<[string, { supportsFreeze(): boolean }]> = [
      ['dateTimeFromISO', Vluxon.dateTimeFromISO()],
      ['dateTimeFromRFC2822', Vluxon.dateTimeFromRFC2822()],
      ['dateTimeFromHTTP', Vluxon.dateTimeFromHTTP()],
      ['dateTimeFromSQL', Vluxon.dateTimeFromSQL()],
      ['duration', Vluxon.duration()],
      ['timeDuration', Vluxon.timeDuration()],
    ];

    test.each(plain)('%s reports supportsFreeze false', (_name, validator) => {
      expect(validator.supportsFreeze()).toBe(false);
    });

    test('V.frozen rejects a schema containing a plain DateTime validator', () => {
      expect(() => V.frozen(V.object({ properties: { at: Vluxon.dateTimeFromISO() } }))).toThrow();
      expect(() => V.frozen(V.object({ properties: { d: Vluxon.duration() } }))).toThrow();
    });
  });

  describe('why a plain DateTime cannot be frozen', () => {
    // Pins the reason the classification above is what it is: Luxon caches week data on the
    // instance on first read, so a frozen DateTime throws from those accessors.
    test('freezing a DateTime breaks its lazily cached week accessors', () => {
      const frozen = Object.freeze(DateTime.utc(2026, 9, 17, 10, 30));

      expect(() => frozen.weekYear).toThrow(TypeError);
      expect(() => frozen.weekNumber).toThrow(TypeError);
      expect(() => frozen.weekday).toThrow(TypeError);
      expect(() => frozen.localWeekday).toThrow(TypeError);
      expect(() => frozen.toISOWeekDate()).toThrow(TypeError);
      expect(() => frozen.toFormat('kkkk-WW')).toThrow(TypeError);
    });

    test('everything else on a frozen DateTime still works, so the break is narrow but real', () => {
      const frozen = Object.freeze(DateTime.utc(2026, 9, 17, 10, 30));

      expect(frozen.toISO()).toBe('2026-09-17T10:30:00.000Z');
      expect(frozen.plus({ hours: 1 }).hour).toBe(11);
      expect(frozen.toFormat('yyyy-MM-dd')).toBe('2026-09-17');
      expect(frozen.year).toBe(2026);
    });

    test('a validated wrapper keeps working, including week fields', async () => {
      const result = await V.frozen(Vluxon.dateTimeUtc()).getValid('2026-09-17T10:30:00Z');

      // The wrapper is frozen; the DateTime it holds is not, so week fields still resolve.
      expect(Object.isFrozen(result)).toBe(true);
      expect(result.dateTime.weekNumber).toBe(38);
    });

    test('KNOWN LIMITATION: the wrapped DateTime internals stay mutable', async () => {
      const result = await V.frozen(Vluxon.dateTimeUtc()).getValid('2026-09-17T10:30:00Z');

      expect(Object.isFrozen(result.dateTime)).toBe(false);
      // Reaching into Luxon internals is still possible; V.frozen does not claim otherwise.
      result.dateTime.loc = DateTime.utc().loc;
      expect(result.dateTime.loc).toBeDefined();
    });
  });
});
