import { describe, test, expect } from 'vitest'
import { SchemaValidator, DiscriminatorViolation } from './schema.js';
import { V } from './V.js';
import { defaultViolations, TypeMismatch, HasValueViolation, Violation } from './validators.js';
import { expectViolations, expectValid } from './testUtil.spec.js';
import { Path } from '@finnair/path';
import { ObjectValidator } from './objectValidator.js';

const ROOT = Path.ROOT,
  property = Path.property;

describe('schema', () => {
  describe('Validator Schema', () => {
    const validatorType: ObjectValidator = V.object({
      properties: {
        type: V.string(),
      },
    });
    V.compositionOf(V.string())
    const schema = new SchemaValidator((schema: SchemaValidator) => ({
      discriminator: 'type', // or (value: any) => string function
      models: {
        Object: {
          extends: 'Validator', // Allow referencing parents by name before they are actually defined
          properties: {
            extends: V.optional(schema.of('Object')), // Allow referencing validators by name before they are actually defined
            properties: V.optional(V.properties(V.string(), schema.of('Validator'))),
          },
        },
        ObjectNormalizer: {
          extends: 'Object',
          properties: {
            property: V.string(),
          },
        },
        Array: {
          extends: validatorType, // Allow direct inheritance
          properties: {
            items: schema.of('Validator'),
          },
        },
        Number: {
          extends: 'Validator',
        },
        Validator: validatorType, // Allow combining existing validators
      },
    }));

    test('examples', async () => {
      // SchemaValidator is a Validator like any other
      expect((await schema.validate({ type: 'ObjectNormalizer', property: 'value' })).isSuccess()).toBe(true);
      // true
      expect((await schema.validate({ type: 'Object', property: 'value' })).isSuccess()).toBe(false);
      // false

      // Validate specific subclass
      expect((await schema.of('Object').validate({ type: 'ObjectNormalizer', property: 'value' })).isSuccess()).toBe(true);
      // true

      // While Object is a subclass of Validator, it's not subclas of Number
      expect((await schema.of('Number').validate({ type: 'Object' })).isSuccess()).toBe(false);
      // false

      // Access raw Validator - Object validator doesn't know about ObjectNormalizer properties
      expect((await schema.raw('Object').validate({ type: 'ObjectNormalizer', property: 'value' })).isSuccess()).toBe(false);
      // false

      // Property based discriminator is validated as own property (i.e. not inherited)
      expect((await schema.raw('Object').validate({ type: 'Object' })).isSuccess()).toBe(true);
      // true
      expect((await schema.raw('Object').validate({ type: 'ObjectNormalizer' })).isSuccess()).toBe(false);
      // false
    });

    test('null value is not allowed', () => expectViolations(null, schema, defaultViolations.notNull(ROOT)));

    test('invalid ObjectNormalizer', () => expectViolations({ type: 'ObjectNormalizer' }, schema, defaultViolations.notNull(property('property'))));

    test('valid minimal ObjectNormalizer', () => expectValid({ type: 'ObjectNormalizer', property: 'value' }, schema));

    test('raw validator validates Object discriminator value', () => expectValid({ type: 'Object' }, schema.raw('Object')!));

    test('raw validator validates ObjectNormalizer discriminator value (valid)', () => expectValid({ type: 'Object' }, schema.raw('Object')));

    test('raw validator validates ObjectNormalizer discriminator value (invalid)', () =>
      expectViolations({ type: 'ObjectNormalizer' }, schema.raw('Object'), new HasValueViolation(property('type'), 'Object', 'ObjectNormalizer')));

    test('invalid parent type (sibling)', () =>
      expectViolations({ type: 'Object', extends: { type: 'Number' } }, schema, new TypeMismatch(property('extends'), 'Object', 'Number')));

    test('invalid parent type (super type)', () =>
      expectViolations({ type: 'Object', extends: { type: 'Validator' } }, schema, new TypeMismatch(property('extends'), 'Object', 'Validator')));

    test('ObjectNormalizer is valid parent', () => expectValid({ type: 'Object', extends: { type: 'ObjectNormalizer', property: 'value' } }, schema));

    test('schema.raw - validator not found error', () => expect(() => schema.raw('Foo')).toThrow());

    test('extends correct ObjectValidator instances', () => {
      expect((schema.raw('Object') as ObjectValidator).parentValidators[0]).toBe(schema.raw('Validator'));
      expect((schema.raw('ObjectNormalizer') as ObjectValidator).parentValidators[0] === schema.raw('Object')).toBe(true);
      expect((schema.raw('Array') as ObjectValidator).parentValidators[0]).toBe(schema.raw('Validator'));
      expect((schema.raw('Number') as ObjectValidator).parentValidators[0]).toBe(schema.raw('Validator'));
    });

    test('invalid type', () =>
      expectViolations(
        { type: 'Foo' },
        schema,
        new DiscriminatorViolation(property('type'), 'Foo', ['Validator', 'Object', 'ObjectNormalizer', 'Array', 'Number']),
      ));

    test('circular inheritance is not allowed', () => {
      expect(
        () =>
          new SchemaValidator((schema: SchemaValidator) => ({
            discriminator: 'type',
            models: {
              Parent: {
                extends: 'Child',
              },
              Child: {
                extends: 'Parent',
              },
            },
          })),
      ).toThrow();
    });

    test('new proxies cannot be created after constructor is finished', () =>
      expect(() => new SchemaValidator(schema => ({ discriminator: 'type', models: {} })).of('NewModel')).toThrow());

    test('property order', async () => {
      const value = (
        await schema.validate({
          property: 'property',
          properties: {
            first: { type: 'Number' },
            second: { type: 'Number' },
          },
          extends: { type: 'Object' },
          type: 'ObjectNormalizer',
        })
      ).getValue() as any;
      expect(Object.keys(value)).toEqual(['type', 'extends', 'properties', 'property']);
      expect(Object.keys(value.properties)).toEqual(['first', 'second']);
    });
  });

  describe('Primitive Schema', () => {
    const schema = new SchemaValidator(schema => ({
      discriminator: value => typeof value,
      models: {
        number: V.number(),
        string: V.string(),
        object: {
          properties: {
            number: schema.of('number'),
            string: schema.of('string'),
          },
        },
      },
    }));

    test('valid object', () => expectValid({ number: 123, string: 'string' }, schema));

    test('invalid string reference', () => expectViolations({ number: 123, string: 123 }, schema, new TypeMismatch(property('string'), 'string', 'number')));
  });

  test('parent must be ObjectValidator', () => {
    expect(
      () =>
        new SchemaValidator(_ => ({
          discriminator: value => typeof value,
          models: {
            string: V.string(),
            object: {
              extends: 'string',
            },
          },
        })),
    ).toThrow();
  });

  test('missing named model', () =>
    expect(
      () =>
        new SchemaValidator(schema => ({ discriminator: 'type', models: { BadType: { properties: { illegalReference: schema.of('IllagalReference') } } } })),
    ).toThrow());

  test("discriminator doesn't overwrite existing ownProperty", async () => {
    const schema = new SchemaValidator(schema => ({
      discriminator: 'type',
      models: {
        InvalidType: {
          localProperties: {
            type: 'Foo', // As a schema this can never be valid
          },
        },
      },
    }));
    await expectValid({ type: 'Foo' }, schema.raw('InvalidType'));
    await expectViolations({ type: 'InvalidType' }, schema, new HasValueViolation(property('type'), 'Foo', 'InvalidType'));
  });
});

describe('ClassModel.next', () => {
  const schema = new SchemaValidator(schema => ({
    discriminator: 'type',
    models: {
      PasswordChangeRequest: {
        properties: {
          pw1: V.string(),
          pw2: V.string(),
        },
        next: V.assertTrue((user: any) => user.pw1 === user.pw2, 'PasswordVerification', Path.of('pw2')),
      },
      NewUserRequest: {
        extends: 'PasswordChangeRequest',
        properties: {
          name: V.string(),
        },
        next: V.assertTrue((user: any) => user.pw1.indexOf(user.name) < 0, 'BadPassword', Path.of('pw1')),
      },
    },
  }));
  test('passwords match', () => expectValid({ type: 'PasswordChangeRequest', pw1: 'test', pw2: 'test' }, schema));

  test('passwords mismatch', () =>
    expectViolations({ type: 'PasswordChangeRequest', pw1: 'test', pw2: 't3st' }, schema, new Violation(Path.of('pw2'), 'PasswordVerification')));

  describe('inherited next', () => {
    test('BadPassword', () =>
      expectViolations({ type: 'NewUserRequest', pw1: 'test', pw2: 'test', name: 'tes' }, schema, new Violation(Path.of('pw1'), 'BadPassword')));

    test('child next is applied after successfull parent next', () =>
      expectViolations({ type: 'NewUserRequest', pw1: 'test', pw2: 't3st', name: 'tes' }, schema, new Violation(Path.of('pw2'), 'PasswordVerification')));
  });
});

describe('ClassModel.localNext', () => {
  const schema = new SchemaValidator(schema => ({
    discriminator: () => 'Model',
    models: {
      Model: {
        properties: {
          name: V.string(),
        },
        localNext: V.map((obj: any) => `${obj.name}`),
      },
    },
  }));

  test('localNext is called', async () => {
    expect((await schema.validate({ name: 'localNext' })).getValue()).toEqual('localNext');
  });
});

describe('Recursive object', () => {
  const schema = new SchemaValidator(schema => ({
    // TODO: Make discriminator optional if there's only one model
    discriminator: value => typeof value,
    models: {
      object: {
        properties: {
          name: V.string(),
          head: schema,
          tail: V.optional(schema.of('object')),
        },
      },
      number: V.number(),
    },
  }));

  test('valid LinkedList', () => expectValid({ name: 'first', head: 1, tail: { name: 'second', head: 2 } }, schema));
});
