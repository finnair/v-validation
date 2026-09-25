import { describe, test, expect } from 'vitest';
import { DateTime } from 'luxon';
import { V } from '@finnair/v-validation';
import { Vluxon } from './Vluxon.js';
import { LocalDateLuxon } from './luxon.js';

describe('V.memoize with Vluxon', () => {
  test('parses each distinct date string once and returns one shared instance', async () => {
    const memoized = V.memoize(Vluxon.localDate());

    const first = (await memoized.validate('2026-09-11')).getValue();
    const second = (await memoized.validate('2026-09-11')).getValue();
    const other = (await memoized.validate('2026-09-12')).getValue();

    expect(first).toBeInstanceOf(LocalDateLuxon);
    expect(second).toBe(first); // same string -> same parsed instance
    expect(other).not.toBe(first); // different string -> different instance
    expect(other).not.toEqual(first);
  });

  test('without memoization the same string parses to a fresh instance each time', async () => {
    const plain = Vluxon.localDate();

    const first = (await plain.validate('2026-09-11')).getValue();
    const second = (await plain.validate('2026-09-11')).getValue();

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  test('shouldCache keeps outliers (older than 24h) out of the cache', async () => {
    const recent = V.memoize(Vluxon.dateTime(), {
      shouldCache: (dateTime: any) => dateTime.dateTime.diffNow('hours').hours >= -24,
    });

    const now = DateTime.utc();
    const iso = (dt: DateTime) => dt.toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
    const withinDay = iso(now.minus({ hours: 1 }));
    const outlier = iso(now.minus({ days: 10 }));

    const a = (await recent.validate(withinDay)).getValue();
    const b = (await recent.validate(withinDay)).getValue();
    expect(b).toBe(a); // recent value cached -> same instance

    const c = (await recent.validate(outlier)).getValue();
    const d = (await recent.validate(outlier)).getValue();
    expect(d).not.toBe(c); // outlier not cached -> fresh instance each time
    expect(d).toEqual(c);
  });

  test('propagates parse failures without caching them', async () => {
    const memoized = V.memoize(Vluxon.localDate());

    expect((await memoized.validate('not-a-date')).isSuccess()).toBe(false);
    // A subsequent valid input for the same validator still works.
    expect((await memoized.validate('2026-09-11')).isSuccess()).toBe(true);
  });

  test('shares one cache between frozen and mutable callers, since a wrapper freezes itself', async () => {
    const memoized = V.memoize(Vluxon.localDate());

    const mutable = await memoized.getValid('2026-09-11');
    const frozen = await V.frozen(memoized).getValid('2026-09-11');
    const nested = await V.frozen(V.object({ properties: { date: memoized } })).getValid({ date: '2026-09-11' });

    expect(Vluxon.localDate().dependsOnFreezeContext()).toBe(false);
    expect(frozen).toBe(mutable);
    expect((nested as any).date).toBe(mutable);
  });
});
