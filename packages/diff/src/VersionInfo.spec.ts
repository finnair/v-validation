import { describe, test, expect } from 'vitest';
import { AnyIndex, Path, PathMatcher } from '@finnair/path';
import { Change, Diff } from './Diff.js';
import { VersionInfo, VersionInfoConfig } from './VersionInfo.js';

describe('VersionInfo', () => {
  const a: any = Object.freeze({
    id: 1234,
    _timestamp: new Date(2024, 8, 10),
    name: Object.freeze({
      first: 'first',
    }),
    'null': null,
    'undefined': undefined,
  });

  const b: any = Object.freeze({
    id: 12345,
    // _timestamp change is ignored
    _timestamp: new Date(2024, 8, 12),
    name: Object.freeze({
      first: 'second',
      last: 'last',
    }),
  });

  const config: VersionInfoConfig = {
    diff: new Diff({
      isPrimitive: (value: any) => value instanceof Date,
      isEqual: (a: any, b: any) => {
        if (a instanceof Date && b instanceof Date) {
          return a.getTime() === b.getTime();
        }
        return false;
      },
      filter: (path: Path, value: any) => path.length === 0 || !String(path.componentAt(0)).startsWith('_'),
    }),
    previousValues: [PathMatcher.of('id')],
  };
  const altConfig: VersionInfoConfig = { diff: new Diff({ filter: (_path: Path, value: any) => !(value instanceof Date) }) };

  const mapFn = (o: any) => {
    return {
      firstName: o.name.first,
      lastName: o.name.last,
      timestamp: o._timestamp,
    };
  };

  const asyncMapFn = async (o: any) => mapFn(o);

  const expectedChangedPaths = new Set([ '$.id', '$.name.first', '$.name.last', '$.null', '$.undefined' ]);
  
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

    expect(version.changes).toEqual(new Map([
      ['$.id', <Change>{ path: Path.of('id'), oldValue: 1234, newValue: 12345 }],
      ['$.name.first', <Change>{ path: Path.of('name', 'first'), oldValue: 'first', newValue: 'second'}],
      ['$.name.last', <Change>{ path: Path.of('name', 'last'), newValue: 'last' }],
      ['$.null', <Change>{ path: Path.of('null'), oldValue: null }],
      ['$.undefined', <Change>{ path: Path.of('undefined'), oldValue: undefined }],
    ]));
    expect(version.changedPaths).toEqual(expectedChangedPaths);
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

  test('apply chnanges', () => {
    const version = new VersionInfo(b, a, config);
    const aClone = { ...a, name: {...a.name} }
    expect(aClone).toEqual(a);

    version.changes!.forEach((change) => change.path.set(aClone, change.newValue));

    expect(a).not.toEqual(b);
    aClone._timestamp = b._timestamp;
    expect(aClone).toEqual(b);
  });

  test('no changes', () => {
    const c = {...b, _timestamp: new Date(2024, 8, 13) };

    const version = new VersionInfo(c, b, config);

    expect(version.paths).toEqual(new Set());
    expect(version.changedPaths).toEqual(version.paths);
    expect(version.previousValues).toBeUndefined();
    expect(version.toJSON()).toEqual({ current: c, changedPaths: [] });
    expect(version.matches('$.name')).toBe(false);
    expect(version.matchesAny(['$.null', '$.name.foo'])).toBe(false);
  });

  test('first version', async () => {
    const version = new VersionInfo(a, undefined, config);

    expect(version.changedPaths).toBeUndefined();
    expect(version.paths).toEqual(new Set(['$.id', '$.name.first', '$.null', '$.undefined']));
    expect(version.changes).toBeUndefined();
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
    expect((await version.mapAsync(asyncMapFn)).paths).toEqual(new Set(['$.firstName', '$.lastName', '$.timestamp']));
  });

  test('no previousValues matcher', () => {
    expect(new VersionInfo(b, a).previousValues).toBeUndefined();
  });

  test('array as root', () => {
    expect(new VersionInfo([2], [1], {
      diff: new Diff(), 
      previousValues: [PathMatcher.of(AnyIndex)],
    }).toJSON()).toEqual({
      current: [2],
      changedPaths: ['$[0]'],
      previous: [1],
    })
  })
});
