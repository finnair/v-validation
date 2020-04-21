import { SchemaValidator, DiscriminatorViolation } from './schema';
import { default as V } from './V';
import { defaultViolations, TypeMismatch, ObjectValidator, HasValueViolation } from './validators';
import { expectViolations, expectValid } from './testUtil.spec';
import { Path } from './path';

const ROOT = Path.ROOT,
  property = Path.property;

describe('schema', () => {
  describe('Validator Schema', () => {
    const validatorType: ObjectValidator = V.object({
      properties: {
        type: V.string(),
      },
    });
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

    test('examples', async done => {
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
      done();
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

    test('property order', async done => {
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
      ).getValue();
      expect(Object.keys(value)).toEqual(['type', 'extends', 'properties', 'property']);
      expect(Object.keys(value.properties)).toEqual(['first', 'second']);
      done();
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

    test('valid string reference', () => expectViolations({ number: 123, string: 123 }, schema, new TypeMismatch(property('string'), 'string', 'number')));
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

  test("discriminator doesn't overwrite existing ownProperty", async done => {
    const schema = new SchemaValidator(schema => ({
      discriminator: 'type',
      models: {
        InvalidType: {
          ownProperties: {
            type: 'Foo', // As a schema this can never be valid
          },
        },
      },
    }));
    await expectValid({ type: 'Foo' }, schema.raw('InvalidType'));
    await expectViolations({ type: 'InvalidType' }, schema, new HasValueViolation(property('type'), 'Foo', 'InvalidType'));
    done();
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

  test('cyclic data allowed', async done => {
    const first: any = { name: 'first' };
    const second: any = { name: 'second', head: first, tail: first };
    first.head = second;
    first.tail = second;
    const result = (await schema.validate(first, { allowCycles: true })).getValue();
    expect(result).not.toBe(first);
    expect(result.head).not.toBe(second);
    expect(result.head).toBe(result.tail);
    expect(result.head.tail).toBe(result);
    done();
  });

  test('cyclic data not allowed by default', async done => {
    const first: any = { name: 'first' };
    const second: any = { name: 'second', head: first, tail: first };
    first.head = second;
    first.tail = second;
    await expectViolations(
      first,
      schema,
      defaultViolations.cycle(property('tail')),
      defaultViolations.cycle(property('head').property('head')),
      defaultViolations.cycle(property('head').property('tail')),
    );
    done();
  });
});

describe('Recursive array', () => {
  const schema = new SchemaValidator(schema => ({
    // TODO: Make discriminator optional if there's only one model
    discriminator: _ => 'ArrayOfArrays',
    models: {
      ArrayOfArrays: V.array(schema.of('ArrayOfArrays')),
    },
  }));

  test('nested recursive array is allowed', async done => {
    const array: any[] = [];
    array[0] = array;
    array[1] = array;

    const result = (await schema.validate(array, { allowCycles: true })).getValue();
    expect(result).not.toBe(array);
    expect(result[0]).toBe(result);
    expect(result[1]).toBe(result);
    done();
  });
});
