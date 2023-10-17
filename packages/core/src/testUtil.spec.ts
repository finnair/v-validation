import { test, expect } from 'vitest'
import { Validator, Violation, ValidationResult, ValidatorOptions } from './validators.js';

export async function expectViolations(value: any, validator: Validator, ...violations: Violation[]) {
  const result = await validator.validate(value);
  expect(result).toEqual(new ValidationResult(violations));
}

export async function expectValid(value: any, validator: Validator, convertedValue?: any, ctx?: ValidatorOptions) {
  const result = await validator.validate(value, ctx);
  return verifyValid(result, value, convertedValue);
}

export async function expectUndefined(value: any, validator: Validator, convertedValue?: any, ctx?: ValidatorOptions) {
  const result = await validator.validate(value, ctx);
  expect(result.isSuccess()).toBe(true);
  expect(result.getValue()).toBeUndefined();
}

export function verifyValid(result: ValidationResult, value: any, convertedValue?: any) {
  expect(result.getViolations()).toEqual([]);
  if (convertedValue !== undefined) {
    expect(result.getValue()).toEqual(convertedValue);
  } else {
    expect(result.getValue()).toEqual(value);
  }
  return result;
}

test.skip('do not fail build because of no tests found', () => { });
