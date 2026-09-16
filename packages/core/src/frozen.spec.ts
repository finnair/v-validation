import { describe, test, expect } from 'vitest';
import { V } from './V.js';
import { FreezableMap, FreezableSet, JsonMap, JsonSet, Validator } from './validators.js';

describe('V.frozen', () => {
  const model = V.objectType()
    .properties({
      id: V.string(),
      tags: V.array(V.string()),
      nested: V.object({ properties: { deep: V.string() } }),
      maybe: V.optionalStrict(V.object({ properties: { x: V.string() } })),
    })
    .build();

  const input = () => ({ id: 'x', tags: ['t'], nested: { deep: 'd' }, maybe: { x: 'm' } });

  test('leaves the wrapped schema untouched, so the same validator still converts mutably', async () => {
    const frozen = V.frozen(model);
    const mutable: any = await model.getValid(input());
    const readOnly: any = await frozen.getValid(input());

    expect(Object.isFrozen(mutable)).toBe(false);
    expect(Object.isFrozen(mutable.nested)).toBe(false);
    expect(Object.isFrozen(readOnly)).toBe(true);
  });

  test('freezes the whole subtree, not just the root', async () => {
    const result: any = await V.frozen(model).getValid(input());

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nested)).toBe(true);
    expect(Object.isFrozen(result.tags)).toBe(true);
    // Reached through a composition rather than directly by an ObjectValidator.
    expect(Object.isFrozen(result.maybe)).toBe(true);
  });

  test('a write to frozen output throws', async () => {
    const result: any = await V.frozen(model).getValid(input());

    expect(() => {
      result.id = 'other';
    }).toThrow(TypeError);
    expect(() => result.tags.push('another')).toThrow(TypeError);
  });

  test('freezes arrays, their items and the empty array', async () => {
    const validator = V.frozen(V.array(V.object({ properties: { v: V.string() } })));
    const result: any = await validator.getValid([{ v: '1' }, { v: '2' }]);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(await V.frozen(V.array(V.string())).getValid([]))).toBe(true);
  });

  test('propagates through V.proxy, so recursive schemas freeze at every depth', async () => {
    interface Tree {
      name: string;
      child?: Tree;
    }
    const tree: Validator<Tree> = V.objectType()
      .properties({ name: V.string(), child: V.optionalStrict(V.proxy(() => tree)) })
      .build();

    const result: any = await V.frozen(tree).getValid({ name: 'a', child: { name: 'b', child: { name: 'c' } } });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.child)).toBe(true);
    expect(Object.isFrozen(result.child.child)).toBe(true);
  });

  test('propagates through V.oneOf branches', async () => {
    const validator = V.frozen(V.oneOf(V.object({ properties: { a: V.string() } }), V.object({ properties: { b: V.string() } })));

    expect(Object.isFrozen(await validator.getValid({ a: 'v' }))).toBe(true);
  });

  test('delegates skipUndefined to the wrapped validator', () => {
    expect(V.frozen(V.string()).skipUndefined()).toBe(false);
    expect(V.frozen(V.optionalStrict(V.string())).skipUndefined()).toBe(true);
  });

  test('nesting is a no-op: an inner V.frozen reuses the freezing context', async () => {
    // withFreeze() returns `this` when already freezing, so a deep frozen subtree derives one
    // context regardless of how many wrappers it passes through.
    const nested = V.frozen(
      V.objectType()
        .properties({ inner: V.frozen(V.object({ properties: { v: V.string() } })) })
        .build(),
    );

    const result: any = await nested.getValid({ inner: { v: 'x' } });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.inner)).toBe(true);
  });

  test('violations are unaffected', async () => {
    const result = await V.frozen(model).validate({ id: 1, tags: [], nested: { deep: 'd' } });
    expect(result.isSuccess()).toBe(false);
  });
});

describe('FreezableMap / FreezableSet', () => {
  test('JsonMap and JsonSet are freezable', () => {
    expect(new JsonMap([['k', 'v']])).toBeInstanceOf(FreezableMap);
    expect(new JsonSet(['a'])).toBeInstanceOf(FreezableSet);
  });

  test('constructing from entries does not trip the guard', () => {
    // The Map/Set constructor calls this.set/this.add per entry, so a guard implemented as an
    // overridden method reading a #private flag would throw during construction. Keep it shadowed.
    expect(
      new JsonMap([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]).size,
    ).toBe(3);
    expect(new JsonSet(['a', 'b', 'c']).size).toBe(3);
  });

  test('freeze() rejects mutation but still reads', () => {
    const map = new FreezableMap([['k', 'v']]).freeze();

    expect(() => map.set('x', 'y')).toThrow(TypeError);
    expect(() => map.delete('k')).toThrow(TypeError);
    expect(() => map.clear()).toThrow(TypeError);
    expect(map.get('k')).toBe('v');
    expect(map.size).toBe(1);

    const set = new FreezableSet(['a']).freeze();
    expect(() => set.add('b')).toThrow(TypeError);
    expect(() => set.delete('a')).toThrow(TypeError);
    expect(() => set.clear()).toThrow(TypeError);
    expect(set.has('a')).toBe(true);
  });

  test('freeze() is idempotent and returns this', () => {
    const map = new FreezableMap([['k', 'v']]);
    expect(map.freeze()).toBe(map);
    expect(map.freeze()).toBe(map);

    const set = new FreezableSet(['a']);
    expect(set.freeze()).toBe(set);
    expect(set.freeze()).toBe(set);
  });

  test('the guard cannot be removed', () => {
    const map = new FreezableMap([['k', 'v']]).freeze();
    expect(() => {
      (map as any).set = Map.prototype.set;
    }).toThrow(TypeError);

    const set = new FreezableSet(['a']).freeze();
    expect(() => {
      (set as any).add = Set.prototype.add;
    }).toThrow(TypeError);
  });

  test('KNOWN LIMITATION: the native method still mutates when called with a frozen receiver', () => {
    // This is a guard against accidental mutation, not immutability; Object.freeze cannot protect
    // a Map's contents because they live in an internal slot. Documented in the README.
    const map = new FreezableMap([['k', 'v']]).freeze();
    Map.prototype.set.call(map, 'sneaky', 'x');
    expect(map.size).toBe(2);
  });
});

describe('V.frozen with Map and Set validators', () => {
  const mapValidator = (jsonSafe: boolean) => V.toMapType(V.string(), V.string(), jsonSafe as true);
  const setValidator = (jsonSafe: boolean) => V.setType(V.string(), jsonSafe as true);

  test('frozen Map output rejects mutation and keeps toJSON', async () => {
    const result = await V.frozen(mapValidator(true)).getValid([['k', 'v']]);

    expect(() => result.set('x', 'y')).toThrow(TypeError);
    expect(result.get('k')).toBe('v');
    expect(JSON.stringify(result)).toBe('[["k","v"]]');
    expect(result).toBeInstanceOf(JsonMap);
  });

  test('frozen Set output rejects mutation and keeps toJSON', async () => {
    const result = await V.frozen(setValidator(true)).getValid(['a']);

    expect(() => result.add('b')).toThrow(TypeError);
    expect(result.has('a')).toBe(true);
    expect(JSON.stringify(result)).toBe('["a"]');
    expect(result).toBeInstanceOf(JsonSet);
  });

  test('unfrozen output stays mutable - freezing is opt-in', async () => {
    const map = await mapValidator(true).getValid([['k', 'v']]);
    expect(map.set('x', 'y').size).toBe(2);

    const set = await setValidator(true).getValid(['a']);
    expect(set.add('b').size).toBe(2);
  });

  test('the non-json variant stays a plain Map/Set unless frozen', async () => {
    const map: any = await mapValidator(false).getValid([['k', 'v']]);
    expect(map).toBeInstanceOf(Map);
    expect(map).not.toBeInstanceOf(FreezableMap);
    expect(map.set('x', 'y').size).toBe(2);

    const frozenMap: any = await V.frozen(mapValidator(false)).getValid([['k', 'v']]);
    expect(frozenMap).toBeInstanceOf(FreezableMap);
    expect(() => frozenMap.set('x', 'y')).toThrow(TypeError);
  });

  test('the non-json Set variant behaves the same way', async () => {
    const set: any = await setValidator(false).getValid(['a']);
    expect(set).toBeInstanceOf(Set);
    expect(set).not.toBeInstanceOf(FreezableSet);

    const frozenSet: any = await V.frozen(setValidator(false)).getValid(['a']);
    expect(frozenSet).toBeInstanceOf(FreezableSet);
    expect(() => frozenSet.add('b')).toThrow(TypeError);
  });

  test('an empty frozen Map/Set is frozen too', async () => {
    const map = await V.frozen(mapValidator(true)).getValid([]);
    const set = await V.frozen(setValidator(true)).getValid([]);

    expect(() => map.set('x', 'y')).toThrow(TypeError);
    expect(() => set.add('x')).toThrow(TypeError);
  });
});
