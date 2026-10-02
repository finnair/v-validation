import { describe, test, expect } from 'vitest';
import { AnyIndex, AnyProperty, Path, PathMatcher, UnionMatcher } from '@finnair/path';
import { parsePath } from '@finnair/path-parser';
import { Change, Diff, DiffConfig } from './Diff.js';
import { VersionInfo, VersionInfoConfig } from './VersionInfo.js';

describe('VersionInfo', () => {
  const a: any = Object.freeze({
    id: 1234,
    _timestamp: new Date(Date.UTC(2024, 8, 10)),
    name: Object.freeze({
      first: 'first',
    }),
    'null': null,
    'undefined': undefined,
  });

  const b: any = Object.freeze({
    id: 12345,
    // _timestamp change is ignored
    _timestamp: new Date(Date.UTC(2024, 8, 12)),
    name: Object.freeze({
      first: 'second',
      last: 'last',
    }),
  });

  const config: VersionInfoConfig = {
    diffConfig: {
      isPrimitive: (value: any) => value instanceof Date,
      isEqual: (a: any, b: any) => {
        if (a instanceof Date && b instanceof Date) {
          return a.getTime() === b.getTime();
        }
        return false;
      },
      filter: (path: Path, value: any) => path.length === 0 || !String(path.componentAt(0)).startsWith('_'),
    },
    previousValues: [PathMatcher.of('id')],
  };
  // Support still deprecated diff parameter
  const altConfig: VersionInfoConfig = { diff: new Diff({ filter: (_path: Path, value: any) => !(value instanceof Date) }) };

  const mapFn = (o: any) => {
    return {
      firstName: o.name.first,
      lastName: o.name.last,
      timestamp: o._timestamp,
    };
  };

  const asyncMapFn = async (o: any) => mapFn(o);
  
  const mappedChanges = new Map([
    ['$.firstName', <Change>{ path: Path.of('firstName'), oldValue: 'first', newValue: 'second' }],
    ['$.lastName', <Change>{ path: Path.of('lastName'), newValue: 'last' }],
    ['$.timestamp', <Change>{ path: Path.of('timestamp'), oldValue: a._timestamp, newValue: b._timestamp }],
  ]);

  const mappedB = {
    firstName: b.name.first,
    lastName: b.name.last,
    timestamp: b._timestamp,
  };
  
  test('changes', async () => {
    const version = new VersionInfo(b, a, config);
    const expectedChangedPaths = new Set([ '$.id', '$.name.first', '$.name.last', '$.null', '$.undefined' ]);
    const extpectedPatch = [
      { path: Path.of('id'), value: 12345 },
      { path: Path.of('name', 'first'), value: 'second' },
      { path: Path.of('name', 'last'), value: 'last' },
      { path: Path.of('null') },
      { path: Path.of('undefined') },
    ];

    expect(version.changes).toEqual(new Map([
      ['$.id', <Change>{ path: Path.of('id'), oldValue: 1234, newValue: 12345 }],
      ['$.name.first', <Change>{ path: Path.of('name', 'first'), oldValue: 'first', newValue: 'second'}],
      ['$.name.last', <Change>{ path: Path.of('name', 'last'), newValue: 'last' }],
      ['$.null', <Change>{ path: Path.of('null'), oldValue: null }],
      ['$.undefined', <Change>{ path: Path.of('undefined'), oldValue: undefined }],
    ]));
    expect(version.changedPaths).toEqual(expectedChangedPaths);
    expect(version.patch).toEqual(extpectedPatch);
    expect(version.paths).toEqual(version.changedPaths);
    expect(version.previousValues).toEqual({ id: 1234 });
    expect(version.toJSON()).toEqual({
      current: b,
      changedPaths: Array.from(expectedChangedPaths),
      previous: {
        id: 1234,
      },
    });
    expect(version.matches('$.name')).toBe(true);
    expect(version.matches('$.name.foo')).toBe(false);
    expect(version.matchesAny([PathMatcher.of('null'), '$.name.foo'])).toBe(true);
    expect(version.matchesAny(['$.foo', '$.name.foo'])).toBe(false);

    const mappedVersion = version.map(mapFn);
    expect(mappedVersion.changes).toEqual(mappedChanges);
    expect(mappedVersion.current).toEqual(mappedB);
    expect(mappedVersion.previousValues).toBeUndefined();
    expect(version.map(mapFn, altConfig).changedPaths).toEqual(new Set(['$.firstName', '$.lastName']));

    expect((await version.mapAsync(asyncMapFn, altConfig)).changedPaths).toEqual(new Set(['$.firstName', '$.lastName']));
  });

  test('apply changes', () => {
    const version = new VersionInfo(b, a, config);
    const aClone = structuredClone(a);
    expect(aClone).toEqual(a);

    version.changes!.forEach((change) => change.path.set(aClone, change.newValue));

    expect(a).not.toEqual(b);
    aClone._timestamp = b._timestamp;
    expect(aClone).toEqual(b);
  });

  describe('apply changes of values that changed between object and array', () => {
    test.each([
      ['object to array', { a: { 0: 'old', x: 1 } }, { a: ['new'] }],
      ['array to object', { a: ['old', 'other'] }, { a: { 0: 'new' } }],
    ])('%s', (_name, previous: any, current: any) => {
      const version = new VersionInfo(current, previous);
      const result = [...version.changes!.values()].reduce((value, change) => change.path.set(value, change.newValue), structuredClone(previous));
      expect(result).toEqual(current);
    });
  });

  test('apply patch', () => {
    const version = new VersionInfo(b, a, config);
    const aClone = structuredClone(a);
    expect(aClone).toEqual(a);

    version.patch.forEach((patch) => patch.path.set(aClone, patch.value));

    expect(a).not.toEqual(b);
    aClone._timestamp = b._timestamp;
    expect(aClone).toEqual(b);
  });

  test('no changes', () => {
    const c = {...b, _timestamp: new Date(Date.UTC(2024, 8, 13)) };

    const version = new VersionInfo(c, b, config);

    expect(version.paths).toEqual(new Set());
    expect(version.changedPaths).toEqual(version.paths);
    expect(version.patch).toEqual([]);
    expect(version.previousValues).toBeUndefined();
    expect(version.toJSON()).toEqual({ current: c, changedPaths: [] });
    expect(version.matches('$.name')).toBe(false);
    expect(version.matchesAny(['$.null', '$.name.foo'])).toBe(false);
  });

  test('first version', async () => {
    const version = new VersionInfo(a, undefined, config);

    expect(version.changedPaths).toBeUndefined();
    expect(version.paths).toEqual(new Set(['$', '$.id', '$.name.first', '$.null', '$.undefined']));
    expect(version.changes).toBeUndefined();
    expect(version.patch).toEqual([{ path: Path.ROOT, value: a }])
    expect(version.matches('$.name')).toBe(true);
    expect(version.matchesAny(['$.foo', '$.name'])).toBe(true);
    expect(version.previousValues).toBeUndefined();
    
    const mappedVersion = version.map(mapFn);
    expect(mappedVersion.changes).toEqual(undefined);
    expect(mappedVersion.current).toEqual({
      firstName: a.name.first,
      lastName: undefined,
      timestamp: a._timestamp,
    });
    expect((await version.mapAsync(asyncMapFn)).paths).toEqual(new Set(['$', '$.firstName', '$.lastName', '$.timestamp']));
  });

  test('no previousValues matcher', () => {
    expect(new VersionInfo(b, a).previousValues).toBeUndefined();
  });

  test('array as root', () => {
    expect(new VersionInfo([2], [1], {
      // Default diff/diffConfig
      previousValues: [PathMatcher.of(AnyIndex)],
    }).toJSON()).toEqual({
      current: [2],
      changedPaths: ['$[0]'],
      previous: [1],
    })
  })

  describe('previousValues', () => {
    test('root', () => {
      expect(new VersionInfo<any>('new', 'old', { previousValues: [PathMatcher.of()] }).previousValues).toEqual('old');
    });

    test('changed type', () => {
      const version = new VersionInfo<any>({ a: ['new'] }, { a: { 0: 'old' } }, { previousValues: [PathMatcher.of('a', AnyProperty)] });
      expect(version.changedPaths).toEqual(new Set(['$.a["0"]', '$.a[0]']));
      expect(version.previousValues).toEqual({ a: { 0: 'old' } });
    });

    test('added value', () => {
      expect(new VersionInfo<any>({ id: 1 }, {}, { previousValues: [PathMatcher.of('id')] }).previousValues).toEqual({});
    });

    test('removed array', () => {
      const version = new VersionInfo<any>({}, { a: ['old'] }, { previousValues: [PathMatcher.of('a', AnyIndex)] });
      expect(version.previousValues).toEqual({ a: ['old'] });
    });
  });

  test('many different string matchers', () => {
    const version = new VersionInfo<any>({ a: 2 }, { a: 1 });
    for (let i = 0; i < 1100; i++) {
      expect(version.matches(`$.b${i}`)).toBe(false);
    }
    expect(version.matches('$.a')).toBe(true);
  });

  test('property and index are different paths', () => {
    const version = new VersionInfo<any>({ a: ['new'] }, { a: { 0: 'old' } });
    expect(version.matches('$.a[0]')).toBe(true);
    expect(version.matches(PathMatcher.of('a', '0'))).toBe(true);
    expect(version.matches(PathMatcher.of('a', 1))).toBe(false);
  });

  describe('randomized', () => {
    function random(seed: number) {
      return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const keys = ['a', 'b', '0'];

    function value(rnd: () => number, depth: number): any {
      const r = depth > 3 ? 0.5 + rnd() * 0.5 : rnd();
      if (r < 0.3) {
        const object: any = {};
        keys.forEach(key => rnd() < 0.6 && (object[key] = value(rnd, depth + 1)));
        return object;
      }
      if (r < 0.5) {
        return Array.from({ length: Math.floor(rnd() * 3) }, () => value(rnd, depth + 1));
      }
      return [1, 'x', null, undefined][Math.floor(rnd() * 4)];
    }

    const matchers = [
      PathMatcher.of(),
      PathMatcher.of('a'),
      PathMatcher.of(0),
      PathMatcher.of(AnyProperty),
      PathMatcher.of(AnyIndex, 'a'),
      PathMatcher.of('a', AnyProperty, 'b'),
      PathMatcher.of(UnionMatcher.of('a', 0), AnyProperty),
      PathMatcher.of(AnyProperty, AnyProperty, AnyProperty),
    ];
    const configs: (DiffConfig | undefined)[] = [undefined, { includeObjects: true }, { filter: () => true }];

    test('changes, paths, patch and matches are derived from the same changes', () => {
      for (let seed = 1; seed <= 300; seed++) {
        const rnd = random(seed);
        const previous = value(rnd, 0);
        const current = value(rnd, 0);
        for (const diffConfig of configs) {
          const version = new VersionInfo<any>(current, previous, { diffConfig });
          const changedPaths = previous ? Array.from(Diff.changeset(previous, current, diffConfig).keys(), key => parsePath(key)) : [];
          expect(version.patch).toEqual(Diff.patch(previous, current, diffConfig));
          if (previous) {
            expect(version.changes).toEqual(Diff.changeset(previous, current, diffConfig));
            for (const matcher of matchers) {
              expect(version.matches(matcher)).toBe(changedPaths.some(path => matcher.prefixMatch(path)));
            }
          } else {
            expect(version.paths).toEqual(Diff.changedPaths(previous, current, diffConfig));
          }
        }
      }
    });
  });
});
