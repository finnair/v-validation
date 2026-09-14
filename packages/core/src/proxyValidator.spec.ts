import { describe, test, expect } from 'vitest';
import { Path } from '@finnair/path';
import { V } from './V.js';
import { defaultViolations, Validator } from './validators.js';

describe('ProxyValidator', () => {
  test('does not call the factory until the first validation', () => {
    let calls = 0;
    V.proxy(() => {
      calls++;
      return V.string();
    });

    expect(calls).toBe(0);
  });

  test('calls the factory once and reuses the validator for later validations', async () => {
    let calls = 0;
    const proxy = V.proxy(() => {
      calls++;
      return V.string();
    });

    expect((await proxy.validate('a')).isSuccess()).toBe(true);
    expect((await proxy.validate('b')).isSuccess()).toBe(true);
    expect(calls).toBe(1);
  });

  test('delegates success, conversion and failure to the proxied validator', async () => {
    const proxy = V.proxy<number, string>(() => V.toNumber());

    expect((await proxy.validate('42')).getValue()).toBe(42);

    const failure = await proxy.validate('not-a-number');
    expect(failure.isSuccess()).toBe(false);
    expect(failure.getViolations()).toEqual([defaultViolations.number('not-a-number')]);
  });

  test('reports violations at the path of the proxied value', async () => {
    const validator = V.objectType()
      .properties({ name: V.proxy(() => V.string()) })
      .build();

    const result = await validator.validate({ name: 1 });

    expect(result.isSuccess()).toBe(false);
    expect(result.getViolations()).toEqual([defaultViolations.string(1, Path.of('name'))]);
  });

  describe('self-reference', () => {
    interface Tree {
      name: string;
      child?: Tree;
    }

    const tree: Validator<Tree> = V.objectType()
      .properties({
        name: V.string(),
        child: V.optionalStrict(V.proxy(() => tree)),
      })
      .build();

    test('validates a recursive structure to arbitrary depth', async () => {
      const value = { name: 'a', child: { name: 'b', child: { name: 'c' } } };

      expect(await tree.getValid(value)).toEqual(value);
    });

    test('reports a violation at the nested path', async () => {
      const result = await tree.validate({ name: 'a', child: { name: 'b', child: { name: 1 } } });

      expect(result.isSuccess()).toBe(false);
      expect(result.getViolations()).toEqual([defaultViolations.string(1, Path.of('child', 'child', 'name'))]);
    });

    test('rejects a reference cycle rather than recursing forever', async () => {
      const cyclic: any = { name: 'a' };
      cyclic.child = cyclic;

      const result = await tree.validate(cyclic);

      expect(result.isSuccess()).toBe(false);
      expect(result.getViolations()).toEqual([defaultViolations.cycle(Path.of('child'))]);
    });
  });

  describe('composition stays lazy', () => {
    // `next`/`allOf` call skipUndefined() in their constructors, so a proxy that delegated it would
    // force the factory at construction time - and throw for a not-yet-assigned self-reference.
    test('next() does not force the factory', () => {
      let calls = 0;
      const composed = V.proxy<string, string>(() => {
        calls++;
        return V.string();
      }).next(V.check(V.string()));

      expect(calls).toBe(0);
      return expect(composed.getValid('a')).resolves.toBe('a');
    });

    test('allOf() does not force the factory', () => {
      let calls = 0;
      V.allOf(
        V.proxy<string, string>(() => {
          calls++;
          return V.string();
        }),
        V.check(V.string()),
      );

      expect(calls).toBe(0);
    });

    test('a self-reference composed with next() can be built', async () => {
      interface Node {
        name: string;
        child?: Node;
      }
      const node: Validator<Node> = V.objectType()
        .properties({
          name: V.string(),
          child: V.optionalStrict(V.proxy<Node, any>(() => node).next(V.check(V.any()))),
        })
        .build();

      const value = { name: 'a', child: { name: 'b' } };
      expect(await node.getValid(value)).toEqual(value);
    });
  });

  test('inherits skipUndefined() === false instead of delegating it', () => {
    // Delegating would force the factory before the proxied validator exists; see ProxyValidator.
    let calls = 0;
    const proxy = V.proxy(() => {
      calls++;
      return V.optionalStrict(V.string());
    });

    expect(proxy.skipUndefined()).toBe(false);
    expect(calls).toBe(0);
  });

  test('an optional property behind a proxy still yields the same output as a direct optional', async () => {
    const properties = (child: Validator<any, any>) => V.objectType().properties({ name: V.string(), child }).propertyOrder(['name']).build();
    const direct = properties(V.optionalStrict(V.string()));
    const viaProxy = properties(V.proxy(() => V.optionalStrict(V.string())));

    const expected = await direct.getValid({ name: 'a' });

    expect(await viaProxy.getValid({ name: 'a' })).toEqual(expected);
    expect(Object.keys((await viaProxy.getValid({ name: 'a' })) as object)).toEqual(Object.keys(expected as object));
  });
});
