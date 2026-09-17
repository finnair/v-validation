import { describe, test, expect } from 'vitest';
import { V } from './V.js';
import { FreezableMap, FreezableSet, IdentityValidator, JsonMap, JsonSet, Validator, ValidatorConfigurationError } from './validators.js';

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
      // A proxy cannot report supportsFreeze without forcing its factory, so the author asserts it.
      .properties({ name: V.string(), child: V.optionalStrict(V.proxy(() => tree, true)) })
      .build();

    const result: any = await V.frozen(tree).getValid({ name: 'a', child: { name: 'b', child: { name: 'c' } } });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.child)).toBe(true);
    expect(Object.isFrozen(result.child.child)).toBe(true);
  });

  test('a recursive schema is rejected unless the proxy asserts supportsFreeze', () => {
    interface Tree {
      name: string;
      child?: Tree;
    }
    const tree: Validator<Tree> = V.objectType()
      .properties({ name: V.string(), child: V.optionalStrict(V.proxy(() => tree)) })
      .build();

    expect(() => V.frozen(tree)).toThrow();
  });

  test('a proxy that asserts supportsFreeze wrongly throws a configuration error', async () => {
    // The assertion cannot be checked at construction time without forcing the factory, so it is
    // verified once the factory has run. It is a schema bug, not invalid data, so it propagates out
    // of validation instead of being reported as a violation.
    const lying = V.frozen(
      V.objectType()
        .properties({ child: V.optionalStrict(V.proxy(() => V.any(), true)) })
        .build(),
    );

    await expect(lying.validate({ child: {} })).rejects.toThrow(ValidatorConfigurationError);
    await expect(lying.getValid({ child: {} })).rejects.toThrow(/supportsFreeze/);
  });

  test('it keeps throwing: the proxied validator is not cached until the assertion holds', async () => {
    const lying = V.frozen(
      V.objectType()
        .properties({ child: V.optionalStrict(V.proxy(() => V.any(), true)) })
        .build(),
    );

    // Caching before the check would make it fire once and then silently leak an unfrozen value.
    for (let i = 0; i < 3; i++) {
      await expect(lying.validate({ child: {} })).rejects.toThrow(ValidatorConfigurationError);
    }
  });

  test('it propagates from every position, including past an async validator', async () => {
    const bad = () => V.proxy(() => V.any(), true);

    await expect(V.frozen(bad()).validate('x')).rejects.toThrow(ValidatorConfigurationError);
    await expect(V.frozen(V.array(bad())).validate([{}])).rejects.toThrow(ValidatorConfigurationError);
    await expect(V.frozen(V.oneOf(bad(), V.string())).validate('x')).rejects.toThrow(ValidatorConfigurationError);
    // An async validator upstream means the failure travels the promise path; it must still escape
    // rather than becoming an unhandled rejection.
    await expect(
      V.frozen(
        V.compositionOf(
          V.fn(async (value: any) => value, true),
          bad(),
        ),
      ).validate('x'),
    ).rejects.toThrow(ValidatorConfigurationError);
  });

  test('a proxy asserting supportsFreeze over a freezable target validates normally', async () => {
    const validator = V.frozen(
      V.objectType()
        .properties({ child: V.optionalStrict(V.proxy(() => V.object({ properties: { v: V.string() } }), true)) })
        .build(),
    );

    const result: any = await validator.getValid({ child: { v: 'x' } });

    expect(Object.isFrozen(result.child)).toBe(true);
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

describe('supportsFreeze classification', () => {
  // Every validator that can appear in a frozen schema declares whether its output is freezable.
  // This pins each answer so a change is deliberate rather than incidental.
  describe('validators whose output is a primitive or already frozen', () => {
    test.each([
      ['V.toString()', V.toString()],
      ['V.nullOrUndefined()', V.nullOrUndefined()],
      ['V.notBlank()', V.notBlank()],
      ['V.toBoolean()', V.toBoolean()],
      ['V.jsonBigInt()', V.jsonBigInt()],
      ['V.uuid()', V.uuid()],
      ['V.size(1, 2)', V.size(1, 2)],
      ['V.string()', V.string()],
      ['V.number()', V.number()],
      ['V.object(...)', V.object({ properties: { a: V.string() } })],
      ['V.array(V.string())', V.array(V.string())],
      ['V.toMapType(...)', V.toMapType(V.string(), V.string(), true)],
      ['V.setType(...)', V.setType(V.string(), true)],
    ])('%s supports freeze', (_name, validator) => expect(validator.supportsFreeze()).toBe(true));
  });

  describe('validators that can hand out a value nobody froze', () => {
    test.each([
      ['V.any()', V.any()],
      ['V.unknown()', V.unknown()],
      ['V.check(V.any())', V.check(V.any())],
      ['V.fn(...)', V.fn((value: any) => value)],
      ['V.map(...)', V.map((value: any) => value)],
      ['V.assertTrue(...)', V.assertTrue(() => true)],
      ['V.hasValue(...)', V.hasValue({ a: 1 })],
      ['V.date()', V.date()],
      ['V.proxy(...)', V.proxy(() => V.string())],
      ['V.whenGroup(...)', V.whenGroup('g', V.string())],
      ['V.whenGroup(...).otherwiseSuccess()', V.whenGroup('g', V.string()).otherwiseSuccess()],
      // Used by otherwiseSuccess(); passes the input straight through, like V.any().
      ['new IdentityValidator()', new IdentityValidator()],
    ])('%s does not support freeze', (_name, validator) => expect(validator.supportsFreeze()).toBe(false));
  });

  describe('composites derive their answer from their children', () => {
    const freezable = V.string();
    const notFreezable = V.any();

    test('V.nullable delegates', () => {
      expect(V.nullable(freezable).supportsFreeze()).toBe(true);
      expect(V.nullable(notFreezable).supportsFreeze()).toBe(false);
    });

    test('V.json delegates', () => {
      expect(V.json(V.object({ properties: { a: V.string() } })).supportsFreeze()).toBe(true);
      expect(V.json(notFreezable).supportsFreeze()).toBe(false);
    });

    test('V.anyOf requires all branches', () => {
      expect(V.anyOf(freezable, V.number()).supportsFreeze()).toBe(true);
      expect(V.anyOf(freezable, notFreezable).supportsFreeze()).toBe(false);
    });

    test('V.oneOf requires all branches', () => {
      expect(V.oneOf(freezable, V.number()).supportsFreeze()).toBe(true);
      expect(V.oneOf(freezable, notFreezable).supportsFreeze()).toBe(false);
    });

    test('V.allOf requires all branches', () => {
      expect(V.allOf(freezable, V.string()).supportsFreeze()).toBe(true);
      expect(V.allOf(freezable, notFreezable).supportsFreeze()).toBe(false);
    });

    test('V.if requires every conditional branch and the else branch', () => {
      expect(V.if(() => true, freezable).supportsFreeze()).toBe(true);
      expect(V.if(() => true, notFreezable).supportsFreeze()).toBe(false);
      expect(
        V.if(() => true, freezable)
          .elseIf(() => true, V.number())
          .supportsFreeze(),
      ).toBe(true);
      expect(
        V.if(() => true, freezable)
          .elseIf(() => true, notFreezable)
          .supportsFreeze(),
      ).toBe(false);
      expect(
        V.if(() => true, freezable)
          .else(V.number())
          .supportsFreeze(),
      ).toBe(true);
      expect(
        V.if(() => true, freezable)
          .else(notFreezable)
          .supportsFreeze(),
      ).toBe(false);
    });

    test('V.optional / V.optionalStrict delegate', () => {
      expect(V.optionalStrict(freezable).supportsFreeze()).toBe(true);
      expect(V.optionalStrict(notFreezable).supportsFreeze()).toBe(false);
    });

    test('an object requires every property, local property and additional property', () => {
      expect(V.object({ properties: { a: freezable } }).supportsFreeze()).toBe(true);
      expect(V.object({ properties: { a: notFreezable } }).supportsFreeze()).toBe(false);
      expect(V.object({ localProperties: { a: notFreezable } }).supportsFreeze()).toBe(false);
      expect(V.object({ additionalProperties: { keys: V.string(), values: notFreezable } }).supportsFreeze()).toBe(false);
    });

    test('an array requires its items', () => {
      expect(V.array(freezable).supportsFreeze()).toBe(true);
      expect(V.array(notFreezable).supportsFreeze()).toBe(false);
    });

    test('a Map/Set requires its keys and values', () => {
      expect(V.toMapType(V.string(), notFreezable, true).supportsFreeze()).toBe(false);
      expect(V.setType(notFreezable, true).supportsFreeze()).toBe(false);
    });

    test('a composition takes its answer from the last value-producing validator', () => {
      // KNOWN LIMITATION: V.check passes its input through, so it cannot claim support on its own -
      // which makes `.next(V.check(...))` report false even though the upstream value was frozen.
      expect(
        V.object({ properties: { a: V.string() } })
          .next(V.check(V.any()))
          .supportsFreeze(),
      ).toBe(false);
    });
  });

  describe('the assertion escape hatches', () => {
    test.each([
      ['V.fn', () => V.fn((value: any) => String(value), true)],
      ['V.map', () => V.map((value: any) => String(value), undefined, true)],
      ['V.assertTrue', () => V.assertTrue(() => true, 'T', undefined, true)],
      ['V.hasValue', () => V.hasValue('a', true)],
      ['V.proxy', () => V.proxy(() => V.string(), true)],
      ['IdentityValidator', () => new IdentityValidator(true)],
    ])('%s can assert support', (_name, build) => expect(build().supportsFreeze()).toBe(true));

    test('V.fn ignores a non-boolean assertion and keeps the safe default', () => {
      // V.fn's second argument used to be an unused `type?: string`. A leftover string must not be
      // read as a freeze assertion, so anything but a boolean falls back to `false`.
      expect(V.fn((value: any) => value, 'NotInstanceOfDate' as unknown as boolean).supportsFreeze()).toBe(false);
      expect(V.fn((value: any) => value, 1 as unknown as boolean).supportsFreeze()).toBe(false);
      expect(V.fn((value: any) => value, {} as unknown as boolean).supportsFreeze()).toBe(false);
      expect(V.fn((value: any) => value, undefined).supportsFreeze()).toBe(false);

      // ...and a real boolean is still honoured.
      expect(V.fn((value: any) => value, true).supportsFreeze()).toBe(true);
      expect(V.fn((value: any) => value, false).supportsFreeze()).toBe(false);
    });

    test('a V.fn carrying a leftover type string is rejected by V.frozen', () => {
      const legacy = V.fn((value: any) => ({ wrapped: value }), 'SomeType' as unknown as boolean);

      expect(() => V.frozen(legacy)).toThrow();
    });

    test('an assertion is a promise the caller makes: V.frozen cannot verify it', async () => {
      const lying = V.frozen(V.object({ properties: { a: V.fn((value: any) => ({ mutable: value }), true) } }));

      const result: any = await lying.getValid({ a: 'x' });

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.a)).toBe(false);
    });
  });
});
