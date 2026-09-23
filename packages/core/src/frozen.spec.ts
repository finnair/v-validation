import { describe, test, expect } from 'vitest';
import { V } from './V.js';
import { Path } from '@finnair/path';
import {
  assertFreezable,
  CompositeType,
  CompositeVisitorContext,
  CompositionVisitorContext,
  FreezableMap,
  FreezableSet,
  GroupVisitorContext,
  Groups,
  IdentityValidator,
  JsonMap,
  JsonSet,
  Validator,
  ValidatorConfigurationError,
  ValidatorVisitor,
  ValidatorVisitorContext,
} from './validators.js';

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

  test('it propagates when reached from an async callback without a try/catch', async () => {
    const bad = () => V.proxy(() => V.any(), true);
    const asyncId = V.fn(async (value: any) => value);

    await expect(V.object({ properties: { a: asyncId }, localProperties: { a: bad() } }).validate({ a: 'x' })).rejects.toThrow(
      ValidatorConfigurationError,
    );
    await expect(V.object({ additionalProperties: { keys: asyncId, values: bad() } }).validate({ a: 'x' })).rejects.toThrow(
      ValidatorConfigurationError,
    );
  });

  test('it is not mistaken for a non-matching branch', async () => {
    // Branching validators treat an ordinary failure as "try the next option"; a schema bug must
    // escape even when another option would match.
    const bad = () => V.proxy(() => V.any(), true);

    await expect(V.oneOf(bad(), V.string()).validate('x')).rejects.toThrow(ValidatorConfigurationError);
    await expect(V.anyOf(bad(), V.string()).validate('x')).rejects.toThrow(ValidatorConfigurationError);
    await expect(
      V.object({ additionalProperties: [{ keys: bad(), values: V.string() }, { keys: V.string(), values: V.string() }] }).validate({ a: 'x' }),
    ).rejects.toThrow(ValidatorConfigurationError);
  });

  test('a throwing proxy factory is reported as an error violation, not thrown', async () => {
    const failing = V.proxy(() => {
      throw new Error('factory failed');
    });

    const result = await V.object({ properties: { a: failing } }).validate({ a: 'x' });

    expect(result.getViolations()).toMatchObject([{ type: 'Error', message: 'factory failed' }]);
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

  test('the whenGroup otherwise branch cannot leak an unfrozen value', async () => {
    const groups = new Groups();
    const matching = groups.define('matching');
    const other = groups.define('other');
    const shape = V.object({ properties: { a: V.string() } });

    // Freezable on the group branch, pass-through on the otherwise branch: rejected outright,
    // because validating under any other group would return the raw input unfrozen.
    expect(() => V.frozen(V.whenGroup(matching, shape).otherwise(V.any()))).toThrow();

    // With both branches freezable, either path yields frozen output.
    const validator = V.frozen(V.whenGroup(matching, shape).otherwise(shape));
    expect(Object.isFrozen(await validator.getValid({ a: 'x' }, { group: matching }))).toBe(true);
    expect(Object.isFrozen(await validator.getValid({ a: 'x' }, { group: other }))).toBe(true);
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
      ['V.string()', V.string()],
      ['V.string().size(1, 2)', V.string().size(1, 2)],
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
      // otherwiseSuccess() hands the input straight back, so the composite cannot support freezing.
      ['V.whenGroup(...).otherwiseSuccess()', V.whenGroup('g', V.string()).otherwiseSuccess()],
      ['V.whenGroup(...).otherwise(V.any())', V.whenGroup('g', V.string()).otherwise(V.any())],
      // Used by otherwiseSuccess(); passes the input straight through, like V.any().
      ['new IdentityValidator()', new IdentityValidator()],
      // Pass the input through too: an array or object input comes out unfrozen.
      ['V.notEmpty()', V.notEmpty()],
      ['V.size(1, 2)', V.size(1, 2)],
      ['V.notNull()', V.notNull()],
    ])('%s does not support freeze', (_name, validator) => expect(validator.supportsFreeze()).toBe(false));
  });

  describe('preservesFreeze', () => {
    test.each([
      ['V.any()', V.any()],
      ['V.unknown()', V.unknown()],
      ['V.check(V.any())', V.check(V.any())],
      ['V.assertTrue(...)', V.assertTrue(() => true)],
      ['V.hasValue(...)', V.hasValue({ a: 1 })],
      ['V.notNull()', V.notNull()],
      ['V.notEmpty()', V.notEmpty()],
      ['V.size(1, 2)', V.size(1, 2)],
      ['new IdentityValidator()', new IdentityValidator()],
      ['V.string()', V.string()],
      ['V.object(...)', V.object({ properties: { a: V.string() } })],
    ])('%s passes a frozen input on frozen', (_name, validator) => expect(validator.preservesFreeze()).toBe(true));

    test.each([
      ['V.fn(...)', V.fn((value: any) => value)],
      ['V.map(...)', V.map((value: any) => value)],
      ['V.date()', V.date()],
      ['V.proxy(() => V.notEmpty())', V.proxy(() => V.notEmpty())],
      ['V.array(V.notEmpty())', V.array(V.notEmpty())],
    ])('%s can produce a new unfrozen value', (_name, validator) => expect(validator.preservesFreeze()).toBe(false));

    test('branches and wrappers preserve when every child does', () => {
      const preserving = V.notEmpty();
      const producing = V.fn((value: any) => value);

      for (const [label, build] of [
        ['V.anyOf', (v: Validator<any, any>) => V.anyOf(v, V.string())],
        ['V.oneOf', (v: Validator<any, any>) => V.oneOf(v, V.string())],
        ['V.allOf', (v: Validator<any, any>) => V.allOf(v, V.string())],
        ['V.if', (v: Validator<any, any>) => V.if(() => true, v).else(V.string())],
        ['V.whenGroup', (v: Validator<any, any>) => V.whenGroup('g', v).otherwiseSuccess()],
        ['V.optional', (v: Validator<any, any>) => V.optional(v)],
        ['V.optionalStrict', (v: Validator<any, any>) => V.optionalStrict(v)],
        ['V.nullable', (v: Validator<any, any>) => V.nullable(v)],
        ['V.required', (v: Validator<any, any>) => V.required(v)],
        ['V.memoize', (v: Validator<any, any>) => V.memoize(v)],
      ] as const) {
        expect(build(preserving).preservesFreeze(), label).toBe(true);
        expect(build(preserving).supportsFreeze(), label).toBe(false);
        expect(build(producing).preservesFreeze(), label).toBe(false);
      }
    });

    test('containers do not trust a merely preserving child, whose input is raw data', () => {
      expect(V.object({ properties: { a: V.notEmpty() } }).supportsFreeze()).toBe(false);
      expect(V.array(V.size(1, 2)).supportsFreeze()).toBe(false);
      expect(V.toMapType(V.string(), V.check(V.any()), true).supportsFreeze()).toBe(false);
      expect(V.setType(V.notEmpty(), true).supportsFreeze()).toBe(false);
      expect(V.json(V.notEmpty()).supportsFreeze()).toBe(false);
    });
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

    test('V.whenGroup requires every group branch and the otherwise branch', () => {
      expect(V.whenGroup('g', freezable).supportsFreeze()).toBe(true);
      expect(V.whenGroup('g', notFreezable).supportsFreeze()).toBe(false);
      expect(V.whenGroup('g', freezable).whenGroup('h', V.number()).supportsFreeze()).toBe(true);
      expect(V.whenGroup('g', freezable).whenGroup('h', notFreezable).supportsFreeze()).toBe(false);
      // The otherwise branch produces the result whenever no group matches.
      expect(V.whenGroup('g', freezable).otherwise(V.number()).supportsFreeze()).toBe(true);
      expect(V.whenGroup('g', freezable).otherwise(notFreezable).supportsFreeze()).toBe(false);
      expect(V.whenGroup('g', freezable).otherwiseSuccess().supportsFreeze()).toBe(false);
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

    test('a composition supports freeze if a step does and every later step preserves it', () => {
      const array = V.array(V.string());
      const producing = V.fn((value: any) => value);

      expect(V.object({ properties: { a: V.string() } }).next(V.check(V.any())).supportsFreeze()).toBe(true);
      expect(array.next(V.size(1, 3), V.notEmpty()).supportsFreeze()).toBe(true);
      expect(array.next(V.compositionOf(V.notEmpty(), V.size(1, 3))).supportsFreeze()).toBe(true);
      expect(array.next(V.anyOf(V.notEmpty(), V.size(1, 3))).supportsFreeze()).toBe(true);
      expect(producing.next(V.string()).supportsFreeze()).toBe(true);

      // Nothing freezes the raw input...
      expect(V.compositionOf(V.notEmpty(), V.size(1, 3)).supportsFreeze()).toBe(false);
      // ...or a later step replaces the frozen value.
      expect(array.next(producing).supportsFreeze()).toBe(false);
      expect(array.next(producing, V.notEmpty()).supportsFreeze()).toBe(false);
    });

    test('a composition preserves freeze when every step does', () => {
      expect(V.compositionOf(V.notEmpty(), V.size(1, 3)).preservesFreeze()).toBe(true);
      expect(V.compositionOf(V.notEmpty(), V.fn((value: any) => value)).preservesFreeze()).toBe(false);
    });
  });

  test('V.frozen rejects a lone pass-through validator, which would return the raw input', async () => {
    expect(() => V.frozen(V.notEmpty())).toThrow(/NotEmptyValidator/);
    expect(() => V.frozen(V.size(1, 3))).toThrow(/SizeValidator/);

    const output = await V.frozen(V.array(V.string()).next(V.size(1, 3))).getValid(['a']);
    expect(Object.isFrozen(output)).toBe(true);
  });

  describe('the assertion escape hatches', () => {
    test.each([
      ['V.fn', () => V.fn((value: any) => String(value), true)],
      ['V.map', () => V.map((value: any) => String(value), true)],
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

    test('V.map ignores a non-boolean assertion, such as a leftover error argument', () => {
      // V.map's second argument used to be an unused `error?: any`.
      expect(V.map((value: any) => value, 'InvalidEncoding' as unknown as boolean).supportsFreeze()).toBe(false);
      expect(V.map((value: any) => value, true).supportsFreeze()).toBe(true);
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

describe('assertFreezable reporting', () => {
  // V.frozen rejects a schema that cannot be frozen; the report has to say which validator and
  // where, because the offender is usually a leaf far from the V.frozen call.
  const messageOf = (build: () => unknown): string => {
    try {
      build();
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  };

  test('names the path and type of an offending property', () => {
    const message = messageOf(() =>
      V.frozen(
        V.objectType()
          .properties({
            id: V.string(),
            nested: V.objectType()
              .properties({ leak: V.fn((value: any) => ({ value })) })
              .build(),
          })
          .build(),
      ),
    );

    expect(message).toContain('do not support freeze');
    expect(message).toContain('$.nested.leak');
    expect(message).toContain('ValidatorFnWrapper');
  });

  test('reports every offender, not just the first', () => {
    const message = messageOf(() =>
      V.frozen(
        V.objectType()
          .properties({ a: V.any(), b: V.array(V.unknown()), c: V.date() })
          .build(),
      ),
    );

    expect(message).toContain('$.a');
    expect(message).toContain('$.b["*"]');
    expect(message).toContain('$.c');
  });

  test('marks which branch of a composite is at fault', () => {
    expect(messageOf(() => V.frozen(V.oneOf(V.string(), V.any())))).toContain('oneOf: 2/2');
    expect(messageOf(() => V.frozen(V.if(() => true, V.string()).else(V.any())))).toContain('(else: 2/2)');
    expect(messageOf(() => V.frozen(V.whenGroup('g', V.string()).otherwiseSuccess()))).toContain('(otherwise)');
    expect(messageOf(() => V.frozen(V.object({ additionalProperties: { keys: V.string(), values: V.any() } })))).toContain('additionalProperties: value');
  });

  test('uses a wildcard path segment for array items and map entries', () => {
    expect(messageOf(() => V.frozen(V.array(V.any())))).toContain('$["*"]');
    expect(messageOf(() => V.frozen(V.toMapType(V.string(), V.any(), true)))).toContain('(value)');
    expect(messageOf(() => V.frozen(V.toMapType(V.any(), V.string(), true)))).toContain('(key)');
  });

  test('tolerates a non-final composition step, which does not decide the output', () => {
    // Only the last validator of a composition produces the result, so an intermediate one that
    // cannot freeze is not itself a problem.
    expect(messageOf(() => V.frozen(V.compositionOf(V.check(V.any()), V.object({ properties: { a: V.string() } }))))).toBe('');
  });

  test('blames only the final step of a failing composition', () => {
    const message = messageOf(() => V.frozen(V.compositionOf(V.any(), V.fn((value: any) => ({ value })))));

    expect(message).toContain('ValidatorFnWrapper (compositionOf: 2/2)');
    expect(message).not.toContain('AnyValidator');
  });

  test('does not blame object properties when a later step replaces the object', () => {
    expect(messageOf(() => V.frozen(V.object({ properties: { a: V.any() }, next: V.fn((value: any) => ({ ...value })) })))).toBe(
      'The following validators do not support freeze:\n' +
        '$: ObjectValidator\n' +
        '$: CompositionValidator\n' +
        '$: ValidatorFnWrapper (compositionOf: 2/2)',
    );
  });

  test('blames the value-producing step rather than pass-through steps after it', () => {
    expect(messageOf(() => V.frozen(V.object({ properties: { a: V.any() }, next: V.any() })))).toBe(
      'The following validators do not support freeze:\n' +
        '$: ObjectValidator\n' +
        '$: CompositionValidator\n' +
        '$: PropertiesValidator (compositionOf: 1/2)\n' +
        '$.a: AnyValidator (property)',
    );
  });

  test('blames every step when all of them only pass the raw input through', () => {
    const message = messageOf(() => V.frozen(V.compositionOf(V.notEmpty(), V.size(1, 3))));

    expect(message).toContain('$: NotEmptyValidator (compositionOf: 1/2)');
    expect(message).toContain('$: SizeValidator (compositionOf: 2/2)');
  });

  test('blames a pass-through validator used as a property', () => {
    expect(messageOf(() => V.frozen(V.object({ properties: { a: V.notEmpty() } })))).toContain('$.a: NotEmptyValidator (property)');
  });

  test('a label that merely reads like a composition step is not skipped', () => {
    // A schema model name ends up in the context message; only a real CompositeVisitorContext counts.
    const schema = V.schema(() => ({ discriminator: 'type', models: { 'compositionOf: 1/2': V.any() } }));

    expect(messageOf(() => V.frozen(schema))).toContain('$: AnyValidator (schema: compositionOf: 1/2)');
  });

  test('descends into set values', () => {
    const message = messageOf(() => V.frozen(V.setType(V.any(), true)));

    expect(message).toContain('SetValidator');
    expect(message).toContain('AnyValidator');
  });

  test('an unasserted proxy is reported without forcing its factory', () => {
    let factoryCalls = 0;
    const proxy = V.proxy(() => {
      factoryCalls++;
      return V.string();
    });

    expect(messageOf(() => V.frozen(V.object({ properties: { a: proxy } })))).toContain('$.a: ProxyValidator');
    expect(factoryCalls).toBe(0);
  });

  test('terminates on a recursive schema whose proxy has already been resolved', async () => {
    interface Tree {
      name: string;
      child?: Tree;
    }
    const tree: Validator<Tree> = V.objectType()
      .properties({ name: V.string(), child: V.optionalStrict(V.proxy(() => tree)) })
      .build();
    await tree.getValid({ name: 'root', child: { name: 'leaf' } });

    // The resolved proxy leads back to `tree`, which must not be walked a second time.
    expect(messageOf(() => V.frozen(tree))).toContain('$.child: ProxyValidator');
  });

  test('returns the validator unchanged when everything supports freeze', () => {
    const validator = V.object({ properties: { a: V.string() } });

    expect(assertFreezable(validator)).toBe(validator);
  });

  test('visits a recursive schema without forcing the proxy factory', () => {
    interface Tree {
      name: string;
      child?: Tree;
    }
    let factoryCalls = 0;
    const tree: Validator<Tree> = V.objectType()
      .properties({
        name: V.string(),
        child: V.optionalStrict(
          V.proxy(() => {
            factoryCalls++;
            return tree;
          }, true),
        ),
      })
      .build();

    V.frozen(tree);

    // An asserted proxy answers from its own flag, so the assertion never descends through it.
    expect(factoryCalls).toBe(0);
  });
});

describe('ValidatorVisitor traversal', () => {
  // assertFreezable stops descending as soon as a validator reports support, so the traversal
  // itself is pinned separately with a visitor that always continues. Each entry records the path
  // and the context label a composite hands to its children. No dedup: singletons like V.string()
  // recur at several paths, and visit itself stops at cycles.
  const walk = (validator: Validator<any, any>): string[] => {
    const seen: string[] = [];
    const visitor: ValidatorVisitor = {
      accept(v, path, context) {
        seen.push(`${path}: ${v.constructor.name}${context ? ` (${context})` : ''}`);
        return true;
      },
    };
    validator.visit(visitor);
    return seen;
  };

  const contains = (entries: string[], needle: string) => entries.some(entry => entry.includes(needle));

  test('a leaf reports itself and nothing else', () => {
    expect(walk(V.string())).toEqual(['$: StringValidator']);
  });

  test('descends into every wrapper', () => {
    const cases: Array<[string, Validator<any, any>, string]> = [
      ['V.frozen', V.frozen(V.string()), 'FreezeValidator'],
      ['V.check', V.check(V.string()), 'CheckValidator'],
      ['V.compositionOf', V.compositionOf(V.string(), V.check(V.string())), 'compositionOf: 1/2'],
      ['V.anyOf', V.anyOf(V.string(), V.number()), 'anyOf: 1/2'],
      ['V.allOf', V.allOf(V.string(), V.string()), 'AllOfValidator'],
      ['V.oneOf', V.oneOf(V.string(), V.number()), 'oneOf: 2/2'],
      ['V.optional', V.optional(V.string()), 'OptionalValidator'],
      ['V.nullable', V.nullable(V.string()), 'NullableValidator'],
      ['V.required', V.required(V.string()), 'RequiredValidator'],
      ['V.json', V.json(V.string()), 'JsonValidator'],
      ['V.memoize', V.memoize(V.string()), 'MemoizeValidator'],
      ['V.if/else', V.if(() => true, V.string()).else(V.number()), '(else: 2/2)'],
      ['V.whenGroup', V.whenGroup('g', V.string()).otherwise(V.number()), '(otherwise)'],
      ['V.array', V.array(V.string()), '$["*"]'],
      ['V.mapType', V.mapType(V.string(), V.string(), true), '(value)'],
      ['V.setType', V.setType(V.string(), true), 'StringValidator'],
      ['V.string().notEmpty()', V.string().notEmpty(), 'NextStringValidator'],
      ['V.number().min(1)', V.number().min(1), 'NextNumberValidator'],
    ];

    for (const [label, validator, expected] of cases) {
      const entries = walk(validator);
      expect(contains(entries, expected), `${label} -> ${entries.join(' | ')}`).toBe(true);
      // Every wrapper must reach its wrapped leaf, not just report itself.
      expect(entries.length, `${label} visited only itself`).toBeGreaterThan(1);
    }
  });

  test('object properties, local properties and additional properties are all labelled', () => {
    const entries = walk(
      V.object({
        properties: { a: V.string() },
        localProperties: { b: V.string() },
        additionalProperties: { keys: V.string(), values: V.number() },
      }),
    );

    expect(contains(entries, '$.a: StringValidator (property)')).toBe(true);
    expect(contains(entries, '$.b: StringValidator (localProperty)')).toBe(true);
    expect(contains(entries, 'additionalProperties: key')).toBe(true);
    expect(contains(entries, 'additionalProperties: value')).toBe(true);
    expect(contains(entries, '$: PropertiesValidator')).toBe(true);
  });

  test('labels every branch of an if / else if / else chain', () => {
    const entries = walk(V.if(() => true, V.string()).elseIf(() => true, V.number()).else(V.boolean()));

    expect(entries).toEqual([
      '$: IfValidator',
      '$: StringValidator (if: 1/3)',
      '$: NumberValidator (else if: 2/3)',
      '$: BooleanValidator (else: 3/3)',
    ]);
  });

  test('an if chain without else counts only its conditionals', () => {
    expect(walk(V.if(() => true, V.string()).elseIf(() => true, V.number()))).toEqual([
      '$: IfValidator',
      '$: StringValidator (if: 1/2)',
      '$: NumberValidator (else if: 2/2)',
    ]);
  });

  test('contexts are structured, not just labels', () => {
    const contexts = (validator: Validator<any, any>) => {
      const collected: ValidatorVisitorContext[] = [];
      validator.visit({
        accept(_v, _path, context) {
          if (context) {
            collected.push(context);
          }
          return true;
        },
      });
      return collected;
    };

    const [first, second] = contexts(V.compositionOf(V.string(), V.number()));
    expect(first).toBeInstanceOf(CompositionVisitorContext);
    expect(first).toMatchObject({ type: CompositeType.compositionOf, current: 1, count: 2 });
    expect(second).toMatchObject({ type: CompositeType.compositionOf, current: 2, count: 2 });
    expect((first as CompositionVisitorContext).steps).toEqual([V.string(), V.number()]);

    const [firstString, nextString] = contexts(V.string().notEmpty());
    expect(firstString).toBeInstanceOf(CompositionVisitorContext);
    expect((nextString as CompositionVisitorContext).steps).toHaveLength(2);
    const [, nextNumber] = contexts(V.number().min(1));
    expect(nextNumber).toMatchObject({ type: CompositeType.compositionOf, current: 2, count: 2 });

    const [group, otherwise] = contexts(V.whenGroup('g', V.string()).otherwise(V.number()));
    expect(group).toBeInstanceOf(GroupVisitorContext);
    expect(group).toMatchObject({ group: 'g', message: 'group: g' });
    expect(otherwise).toMatchObject({ group: undefined, message: 'otherwise' });

    const [property] = contexts(V.object({ properties: { a: V.string() } }));
    expect(property).not.toBeInstanceOf(CompositeVisitorContext);
    expect(property.message).toBe('property');
  });

  test('a schema visits each of its named validators', () => {
    const schema = V.schema(() => ({
      discriminator: 'type',
      models: { Root: { properties: { value: V.any() } } },
    }));

    const entries = walk(schema);

    expect(contains(entries, 'SchemaValidator')).toBe(true);
    expect(contains(entries, 'Root')).toBe(true);
  });

  test('returning false from accept stops the descent', () => {
    const seen: string[] = [];
    const validator = V.object({ properties: { a: V.string() } });

    validator.visit(
      {
        accept(v, path) {
          seen.push(`${path}: ${v.constructor.name}`);
          return false;
        },
      },
      Path.ROOT,
    );

    expect(seen).toEqual(['$: ObjectValidator']);
  });

  test('a proxy descends only once its factory has run', async () => {
    const proxy = V.proxy(() => V.string());

    expect(walk(proxy)).toEqual(['$: ProxyValidator']);

    await proxy.validate('x');

    expect(walk(proxy)).toEqual(['$: ProxyValidator', '$: StringValidator (proxy)']);
  });

  describe('cycles', () => {
    // A proxy only descends once resolved, so each recursive schema is validated once first. The
    // re-entered container is still accepted - that is where the cycle closes - but not descended.
    test('an object stops at its own re-entry', async () => {
      const tree: Validator<any> = V.object({ properties: { child: V.optionalStrict(V.proxy(() => tree)) } });
      await tree.validate({ child: {} });

      expect(walk(tree)).toEqual([
        '$: ObjectValidator',
        '$: PropertiesValidator',
        '$.child: OptionalUndefinedValidator (property)',
        '$.child: ProxyValidator',
        '$.child: ObjectValidator (proxy)',
      ]);
    });

    test('an array stops at its own re-entry', async () => {
      const nested: Validator<any> = V.array(V.proxy(() => nested));
      await nested.validate([[]]);

      expect(walk(nested)).toEqual(['$: ArrayValidator', '$["*"]: ProxyValidator', '$["*"]: ArrayValidator (proxy)']);
    });

    test('a map stops at its own re-entry', async () => {
      const nested: Validator<any> = V.mapType(V.string(), V.proxy(() => nested), false);
      await nested.validate(new Map([['a', new Map()]]));

      expect(walk(nested)).toEqual([
        '$: MapValidator',
        '$["*"]: StringValidator (key)',
        '$["*"]: ProxyValidator (value)',
        '$["*"]: MapValidator (proxy)',
      ]);
    });

    test('a set stops at its own re-entry', async () => {
      const nested: Validator<any> = V.setType(V.proxy(() => nested), false);
      await nested.validate(new Set([new Set()]));

      expect(walk(nested)).toEqual(['$: SetValidator', '$["*"]: ProxyValidator', '$["*"]: SetValidator (proxy)']);
    });

    test('a validator shared by siblings is not a cycle and is visited at each path', () => {
      const leaf = V.object({ properties: { x: V.string() } });

      const entries = walk(V.object({ properties: { a: leaf, b: leaf } }));

      expect(contains(entries, '$.a.x: StringValidator')).toBe(true);
      expect(contains(entries, '$.b.x: StringValidator')).toBe(true);
    });

    test('assertFreezable reports a shared offender at every path', () => {
      const leak = V.fn((value: any) => ({ value }));

      expect(() => V.frozen(V.object({ properties: { a: leak, b: leak } }))).toThrow(/\$\.a: ValidatorFnWrapper[\s\S]*\$\.b: ValidatorFnWrapper/);
    });
  });
});
