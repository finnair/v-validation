import { describe, test, expect } from 'vitest';
import { Path } from '@finnair/path';
import { V } from './V.js';
import { EnumMismatch, Violation, ValidatorType, WarnLogger, defaultViolations } from './validators.js';
import { anyIndexPath, dedupWarnLogger, warnLoggerKey } from './warnLogger.js';

const ROOT = Path.ROOT;

enum SourceEnum {
  KNOWN = 'KNOWN',
}

/** Object type that ignores an unknown property and an unknown enum value. */
const sourceType = () => V.object({ properties: { known: V.string(), status: V.enum(SourceEnum, 'SourceEnum') } });

const collect = () => {
  const violations: Violation[] = [];
  const logger: WarnLogger = violation => violations.push(violation);
  return { violations, logger, keys: () => violations.map(warnLoggerKey) };
};

describe('anyIndexPath', () => {
  test('root', () => expect(anyIndexPath(ROOT)).toEqual('$'));

  test('property', () => expect(anyIndexPath(Path.of('newProperty'))).toEqual('$.newProperty'));

  test('array index is replaced by *', () => expect(anyIndexPath(Path.of('items', 3, 'newProperty'))).toEqual('$.items[*].newProperty'));

  test('every index is replaced', () => expect(anyIndexPath(Path.of(0, 1, 2))).toEqual('$[*][*][*]'));

  test('different indices normalize to the same path', () =>
    expect(anyIndexPath(Path.of('items', 0, 'p'))).toEqual(anyIndexPath(Path.of('items', 999, 'p'))));

  test('non-identifier property names are quoted like Path.toJSON', () =>
    expect(anyIndexPath(Path.of('with space'))).toEqual(Path.of('with space').toJSON()));
});

describe('warnLoggerKey', () => {
  test('same property in different array elements has the same key', () =>
    expect(warnLoggerKey(defaultViolations.unknownProperty(Path.of('items', 0, 'added')))).toEqual(
      warnLoggerKey(defaultViolations.unknownProperty(Path.of('items', 7, 'added'))),
    ));

  test('different properties have different keys', () =>
    expect(warnLoggerKey(defaultViolations.unknownProperty(Path.of('a')))).not.toEqual(
      warnLoggerKey(defaultViolations.unknownProperty(Path.of('b'))),
    ));

  test('different violation types have different keys', () =>
    expect(warnLoggerKey(defaultViolations.unknownProperty(Path.of('a')))).not.toEqual(
      warnLoggerKey(new Violation(Path.of('a'), ValidatorType.UnknownPropertyDenied)),
    ));

  test('each unknown enum value is a distinct finding', () =>
    expect(warnLoggerKey(new EnumMismatch(Path.of('status'), 'SourceEnum', 'NEW_A'))).not.toEqual(
      warnLoggerKey(new EnumMismatch(Path.of('status'), 'SourceEnum', 'NEW_B')),
    ));

  test('same unknown enum value in different elements has the same key', () =>
    expect(warnLoggerKey(new EnumMismatch(Path.of('items', 0, 'status'), 'SourceEnum', 'NEW'))).toEqual(
      warnLoggerKey(new EnumMismatch(Path.of('items', 5, 'status'), 'SourceEnum', 'NEW')),
    ));
});

describe('dedupWarnLogger', () => {
  test('reports an unknown property once per array, not once per element', async () => {
    const { violations, logger } = collect();
    const warnLogger = dedupWarnLogger(logger);
    const validator = V.array(sourceType());
    const input = [0, 1, 2].map(() => ({ known: 'value', status: 'KNOWN', added: 'value' }));

    const result = await validator.validate(input, { ignoreUnknownProperties: true, warnLogger });

    expect(result.isSuccess()).toBe(true);
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toEqual(ValidatorType.UnknownProperty);
  });

  test('deduplicates across separate validations', async () => {
    const { violations, logger } = collect();
    const warnLogger = dedupWarnLogger(logger);
    const validator = sourceType();
    const input = { known: 'value', status: 'KNOWN', added: 'value' };

    for (let i = 0; i < 100; i++) {
      expect((await validator.validate(input, { ignoreUnknownProperties: true, warnLogger })).isSuccess()).toBe(true);
    }

    expect(violations).toHaveLength(1);
  });

  test('deduplicates repeated branches of anyOf', async () => {
    const { violations, logger } = collect();
    const warnLogger = dedupWarnLogger(logger);
    const validator = V.anyOf(sourceType(), sourceType(), sourceType());

    const result = await validator.validate({ known: 'value', status: 'KNOWN', added: 'value' }, { ignoreUnknownProperties: true, warnLogger });

    expect(result.isSuccess()).toBe(true);
    expect(violations).toHaveLength(1);
  });

  test('distinct findings are all reported', async () => {
    const { violations, logger, keys } = collect();
    const warnLogger = dedupWarnLogger(logger);
    const validator = V.array(sourceType());
    const input = [
      { known: 'value', status: 'NEW_STATUS', addedA: 'value' },
      { known: 'value', status: 'ANOTHER_STATUS', addedB: 'value' },
    ];

    const result = await validator.validate(input, {
      ignoreUnknownProperties: true,
      ignoreUnknownEnumValues: true,
      warnLogger,
    });

    expect(result.isSuccess()).toBe(true);
    expect(keys().sort()).toEqual([
      'EnumMismatch $[*].status ANOTHER_STATUS',
      'EnumMismatch $[*].status NEW_STATUS',
      'UnknownProperty $[*].addedA undefined',
      'UnknownProperty $[*].addedB undefined',
    ]);
  });

  test('a new finding appearing later is still reported', async () => {
    const { violations, logger } = collect();
    const warnLogger = dedupWarnLogger(logger);
    const validator = sourceType();
    const options = { ignoreUnknownProperties: true, warnLogger };

    await validator.validate({ known: 'value', status: 'KNOWN', first: 'value' }, options);
    await validator.validate({ known: 'value', status: 'KNOWN', first: 'value' }, options);
    expect(violations).toHaveLength(1);

    await validator.validate({ known: 'value', status: 'KNOWN', second: 'value' }, options);
    expect(violations).toHaveLength(2);
  });

  test('separate instances have separate state', async () => {
    const first = collect();
    const second = collect();
    const validator = sourceType();
    const input = { known: 'value', status: 'KNOWN', added: 'value' };

    await validator.validate(input, { ignoreUnknownProperties: true, warnLogger: dedupWarnLogger(first.logger) });
    await validator.validate(input, { ignoreUnknownProperties: true, warnLogger: dedupWarnLogger(second.logger) });

    expect(first.violations).toHaveLength(1);
    expect(second.violations).toHaveLength(1);
  });

  test('forwards the ValidatorOptions of the reported violation', async () => {
    const seen: any[] = [];
    const warnLogger = dedupWarnLogger((violation, options) => seen.push(options));
    const options = { ignoreUnknownProperties: true, warnLogger };

    await sourceType().validate({ known: 'value', status: 'KNOWN', added: 'value' }, options);

    expect(seen).toHaveLength(1);
    expect(seen[0].ignoreUnknownProperties).toBe(true);
  });

  test('custom keyOf overrides the identity', async () => {
    const { violations, logger } = collect();
    // Everything is the same finding.
    const warnLogger = dedupWarnLogger(logger, () => 'constant');
    const validator = sourceType();

    await validator.validate({ known: 'value', status: 'KNOWN', a: 1, b: 2 }, { ignoreUnknownProperties: true, warnLogger });

    expect(violations).toHaveLength(1);
  });
});
