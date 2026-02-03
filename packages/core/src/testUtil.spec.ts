import { test, expect } from 'vitest'
import { Validator, Violation, ValidationResult, ValidatorOptions, ValidationContext, violationsOf } from './validators.js';
import { Path } from '@finnair/path';
import { fail } from 'assert';

export async function expectViolations<In>(value: In, validator: Validator<any, In>, ...violations: Violation[]) {
  await validator.validatePath(value, Path.ROOT, new ValidationContext({})).then(
    (success) => {
      fail(`expected violations, got ${success}`)
    },
    (fail) => {
      expect(violationsOf(fail, Path.ROOT)).toEqual(violations);
    }
  )
}

export async function expectValid<Out, In>(value: In, validator: Validator<Out, In>, convertedValue?: Out, ctx?: ValidatorOptions) {
  const result = await validator.validate(value, ctx);
  return verifyValid(result, value, convertedValue);
}

export async function expectUndefined(value: any, validator: Validator, convertedValue?: any, ctx?: ValidatorOptions) {
  const result = await validator.validate(value, ctx);
  expect(result.isSuccess()).toBe(true);
  expect(result.getValue()).toBeUndefined();
}

export function verifyValid<Out>(result: ValidationResult<Out>, value: any, convertedValue?: Out) {
  expect(result.getViolations()).toEqual([]);
  if (convertedValue !== undefined) {
    expect(result.getValue()).toEqual(convertedValue);
  } else {
    expect(result.getValue()).toEqual(value);
  }
  return result.getValue();
}

test.skip('do not fail build because of no tests found', () => { });
