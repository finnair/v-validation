import { describe, test, expect } from 'vitest'
import {
  Validator,
  Violation,
  ValidationResult,
  defaultViolations,
  ValidationError,
  TypeMismatch,
  Group,
  Groups,
  NumberFormat,
  isNumber,
  isString,
  ValidationContext,
  ErrorViolation,
  IfValidator,
  WhenGroupValidator,
  HasValueViolation,
  SizeViolation,
  EnumMismatch,
  JsonSet,
  VType,
} from './validators.js';
import { ObjectValidator, ObjectModel, VInheritableType } from './objectValidator.js';
import { V } from './V.js';
import { Path } from '@finnair/path';
import { expectUndefined, expectValid, expectViolations, verifyValid } from './testUtil.spec.js';
import { fail } from 'assert';
import { EqualTypes, ComparableType, assertType } from './typing.js';

const ROOT = Path.ROOT,
  index = Path.index,
  property = Path.property;

async function expectGroupViolations(value: any, group: Group, validator: Validator, ...violations: Violation[]) {
  const result = await validator.validate(value, { group });
  expect(result).toEqual(new ValidationResult(violations));
}

async function expectGroupValid(value: any, group: Group, validator: Validator, convertedValue?: any) {
  const result = await validator.validateGroup(value, group);
  return verifyValid(result, value, convertedValue);
}

const failAlways = V.assertTrue(value => false, 'Fail');
const failAlwaysViolation = (path: Path = ROOT) => new Violation(path, 'Fail');

const validDateString = '2019-01-23T09:10:00Z';
const validDate = new Date(Date.UTC(2019, 0, 23, 9, 10, 0));

function defer<T>(validator: Validator<T>, ms: number = 1) {
  return new DeferredValidator<T>(validator, ms);
}

class DeferredValidator<T> extends Validator<T> {
  constructor(public validator: Validator<T>, public ms: number = 1) {
    super();
  }

  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        this.validator.validatePath(value, path, ctx).then(resolve, reject);
      }, this.ms);
    });
  }
}

describe('ValidationResult', () => {
  test('getValue() returns valid value', async () => {
    const result = await V.string().validate('123');
    const str: string = result.getValue();
    expect(str).toEqual('123');
  });

  test('getValue() throws ValidationError if validation failed', async () => {
    try {
      const result = await V.string().validate(123 as any);
      result.getValue();
      fail('expected ValidationError');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).violations).toEqual([defaultViolations.string(123)]);
    }
  });

  test('value xor violations', () => {
    expect(() => new ValidationResult([defaultViolations.notNull()], 'value'))
      .toThrow('both violations and success value defined');
  })
});

describe('getValid', () => {
  test('valid string', async () => {
    const value = await V.string().getValid('string');
    expect(value).toEqual('string');
  });
  test('invalid string', async () => {
    try {
      await V.string().getValid(123 as any);
      fail('Expected getValue to throw an error')
    } catch (error) {
      // as expected
    }
  });
})

test('assertTrue', () =>
  expectValid(
    true,
    V.assertTrue(value => value === true),
  ));

describe('strings', () => {
  test('valid value', () => expectValid('str', V.string()));

  test('String objects do not pass as string primitives', () => {
    const str = new String('String');
    expectViolations(str, V.string(), defaultViolations.string(str))
  });

  test('number is not accepted', () => expectViolations(123 as any, V.string(), defaultViolations.string(123)));

  test('null is not accepted', () => expectViolations(null, V.string(), defaultViolations.notNull()));

  test('undefined is not accepted', () => expectViolations(undefined, V.string(), defaultViolations.notNull()));

  test('empty string', () => expectValid('', V.string()));

  test('empty string not allowed', () => expectViolations('', V.allOf(V.string(), V.notEmpty()), defaultViolations.notEmpty()));

  test('non-empty string allowed', () => expectValid(' ', V.string()));

  describe('toString', () => {
    test('string as such', () => expectValid('abc', V.toString()));

    test('convert String to string', () => expectValid(new String('String'), V.toString(), 'String'));

    test('convert number to string', () => expectValid(123, V.toString(), '123'));

    test('no not convert object to string', () => expectViolations({}, V.toString(), new TypeMismatch(ROOT, 'primitive value', {})));

    test('no not convert array to string', () => expectViolations([], V.toString(), new TypeMismatch(ROOT, 'primitive value', [])));

    test('no not convert function to string', () => expectViolations(isString, V.toString(), new TypeMismatch(ROOT, 'primitive value', isString)));

    test('null is not allowed', () => expectViolations(null, V.toString(), defaultViolations.notNull()));

    test('undefined is not allowed', () => expectViolations(undefined, V.toString(), defaultViolations.notNull()));
  });

  describe('string validator chaining', () => {
    test('notBlank > notEmpty > pattern > size', () => expectValid('A', V.string().notBlank().notEmpty().pattern(/^[A-Z]$/).size(1, 2)));

    test('first validator failure', () => {
      expectViolations(123 as any, V.string().notBlank(), new TypeMismatch(ROOT, 'string', 123));
    })
  })

  describe('NotBlank', () => {
    test('valid string', () => expectValid(' A ', V.notBlank()));

    test('null is invalid', () => expectViolations(null, V.notBlank(), defaultViolations.notBlank()));

    test('undefined is invalid', () => expectViolations(null, V.notBlank(), defaultViolations.notBlank()));

    test('non-string is invalid', () => expectViolations(123 as any, V.notBlank(), defaultViolations.string(123)));

    test('blank is invalid', () => expectViolations(' \t\n ', V.notBlank(), defaultViolations.notBlank()));
  });

  describe('pattern', () => {
    const pattern = '^[A-Z]{3}$';
    const regexp = new RegExp(pattern);
    test('valid string', () => expectValid('ABC', V.string().pattern(regexp)));

    test('too short', () => expectViolations('AB', V.pattern(pattern), defaultViolations.pattern(regexp, 'AB')));

    test('too long', () => expectViolations('ABCD', V.pattern(/^[A-Z]{3}$/), defaultViolations.pattern(regexp, 'ABCD')));

    test('non-string', () => expectViolations(123, V.pattern(pattern), defaultViolations.string(123)));

    test('null is not valid', () => expectViolations(null, V.pattern(regexp), defaultViolations.notNull()));

    test('undefined is not valid', () => expectViolations(undefined, V.pattern(regexp), defaultViolations.notNull()));

    test('convert to string', () => expectValid(123, V.toString().next(V.pattern('^[0-9]+$')), '123'));

    test('violation toJSON', () => {
      expect(JSON.parse(JSON.stringify(defaultViolations.pattern(/[A-Z]+/i, '123')))).toEqual({
        path: '$',
        pattern: '/[A-Z]+/i',
        type: 'Pattern',
        invalidValue: '123',
      });
    });

    test('validator toJSON', () => expect(V.pattern(/A-Z/).toJSON()).toEqual({ pattern: '/A-Z/' }));

    describe('toPattern', () => {
      test('convert number to string', () => expectValid(123, V.toPattern(/\d+/), '123'));

      test('valid string', () => expectValid('ABC', V.toPattern(regexp)));

      test('no not convert object to string', () => expectViolations({}, V.toPattern(pattern), new TypeMismatch(ROOT, 'primitive value', {})));

      test('no not convert array to string', () => expectViolations([], V.toPattern(pattern), new TypeMismatch(ROOT, 'primitive value', [])));

      test('no not convert function to string', () => expectViolations(isString, V.toPattern(pattern), new TypeMismatch(ROOT, 'primitive value', isString)));

      test('null is invalid', () => expectViolations(null, V.toPattern(pattern), defaultViolations.notNull()));
    });
  });

  describe('size', () => {
    test('valid', () => expectValid('1', V.size(1, 1)));

    test('too short', () => expectViolations('1', V.size(2, 3), defaultViolations.size(2, 3)));

    test('too long', () => expectViolations([1, 2], V.size(1, 1), defaultViolations.size(1, 1)));

    test('null is not allowed', () => expectViolations(null, V.size(1, 2), defaultViolations.notNull(ROOT)));

    test('length is missing', () => expectViolations({}, V.size(1, 2), new TypeMismatch(ROOT, 'value with numeric length field')));

    test('length property', () => expectValid({ length: 2 }, V.size(1, 2)));

    test('invalid params', () => {
      expect(() => V.size(2, 1)).toThrow();
    });
  });
});

describe('boolean', () => {
  test('null is not valid', () => expectViolations(null, V.boolean(), defaultViolations.notNull()));

  test('undefined is not valid', () => expectViolations(undefined, V.boolean(), defaultViolations.notNull()));

  test('false is valid', () => expectValid(false, V.boolean()));

  test('true is valid', () => expectValid(true, V.boolean()));

  test('object is invalid', () => expectViolations({}, V.boolean(), new TypeMismatch(ROOT, 'boolean', {})));

  test('Boolean is invalid', () => {
    var bool = new Boolean(true);
    return expectViolations(bool, V.boolean(), new TypeMismatch(ROOT, 'boolean', bool));
  });

  describe('toBoolean', () => {
    test('null is not valid', () => expectViolations(null, V.toBoolean(), defaultViolations.notNull()));

    test('undefined is not valid', () => expectViolations(undefined, V.toBoolean(), defaultViolations.notNull()));

    test('false string is valid', () => expectValid('false', V.toBoolean(), false));

    test('true string is valid', () => expectValid('true', V.toBoolean(), true));

    test('True is invalid', () => expectViolations('True', V.toBoolean(), defaultViolations.boolean('True')));

    test('False is invalid', () => expectViolations('False', V.toBoolean(), defaultViolations.boolean('False')));

    test('1 is valid (true)', () => expectValid(1, V.toBoolean(), true));

    test('0 is valid (false)', () => expectValid(0, V.toBoolean(), false));

    test('false is valid', () => expectValid(false, V.toBoolean()));

    test('object is invalid', () => expectViolations({}, V.toBoolean(), defaultViolations.boolean({}, ROOT)));

    test('Boolean is converted to boolean', () => expectValid(new Boolean(true), V.toBoolean(), true));
  });
});

describe('uuid', () => {
  test('null is not valid', () => expectViolations(null, V.uuid(), defaultViolations.notNull()));

  test('undefined is not valid', () => expectViolations(undefined, V.uuid(), defaultViolations.notNull()));

  test('non-string is not valid', () => expectViolations(12345, V.uuid(), new TypeMismatch(ROOT, 'string', 12345)));

  test('valid uuid v4', () => expectValid('ffa7870a-a612-446c-b892-d33e71caf016', V.uuid()));

  test('valid uuid v4 required', () => expectValid('ffa7870a-a612-446c-b892-d33e71caf016', V.uuid(4)));

  test('valid uuid v1', () => expectValid('761ae724-46fa-11e9-b210-d663bd873d93', V.uuid()));

  test('valid uuid v1 required', () => expectValid('761ae724-46fa-11e9-b210-d663bd873d93', V.uuid(1)));

  test('v1 uuid is not valid v4', () => expectViolations('761ae724-46fa-11e9-b210-d663bd873d93', V.uuid(4), new Violation(ROOT, 'UUIDv4', '761ae724-46fa-11e9-b210-d663bd873d93')));

  test('missing one character', () => expectViolations('761ae724-46fa-11e9-b210-d663bd873d9', V.uuid(), new Violation(ROOT, 'UUID', '761ae724-46fa-11e9-b210-d663bd873d9')));

  test('supports UUIDv7', () => expectValid('0192a07b-69d7-73bd-adb7-d1e060c081b9', V.uuid(7)));
});

describe('objects', () => {
  const validator = V.object({
    properties: {
      requiredProperty: V.required(V.string()),
    },
  });

  describe('typing', () => {
    describe('simple type', () => {
      const validator = V.objectType()
        .properties({
          required: V.string(),
          optional: V.optionalStrict(V.string()),
        })
        .build();

      test('required property missing', () => {
        // @ts-ignore
        type v = EqualTypes<
          ComparableType<VType<typeof validator>>,
          // @ts-expect-error
          ComparableType<{
            optional?: string;
          }>
        >;
      });
      test('optional property missing', () => {
        // @ts-ignore
        type v = EqualTypes<
          ComparableType<VType<typeof validator>>,
          // @ts-expect-error
          ComparableType<{
            required: string;
          }>
        >;
      });
      test('optional has wrong type', () => {
        // @ts-ignore
        type v = EqualTypes<
          // @ts-expect-error
          ComparableType<VType<typeof validator>>,
          ComparableType<{
            required: string;
            optional?: number;
          }>
        >;
      });
    });

    describe('nested type', () => {
      const validator = V.objectType()
        .properties({
          required: V.objectType()
            .properties({
              required: V.string(),
              optional: V.optionalStrict(V.string()),
            })
            .build(),
          optional: V.optionalStrict(V.objectType()
            .properties({
              required: V.string(),
              optional: V.optionalStrict(V.string()),
            })
            .build()),
        })
        .build();

      test('required.required property missing', () => {
        // @ts-ignore
        type v = EqualTypes<
          ComparableType<VType<typeof validator>>,
          // @ts-expect-error 
          ComparableType<{
            required: {
              //required: string;
              optional?: string;
            }
            optional?: {
              required: string;
              optional?: string;
            }
          }>
        >;
      });
      test('optional.required property missing', () => {
        // @ts-ignore
        type v = EqualTypes<
          ComparableType<VType<typeof validator>>,
          // @ts-expect-error 
          ComparableType<{
            required: {
              required: string;
              optional?: string;
            }
            optional?: {
              //required: string;
              optional?: string;
            }
          }>
        >;
      });
      test('required.optional property missing', () => {
        // @ts-ignore
        type v = EqualTypes<
          ComparableType<VType<typeof validator>>,
          // @ts-expect-error 
          ComparableType<{
            required: {
              required: string;
              //optional?: string;
            }
            optional?: {
              required: string;
              optional?: string;
            }
          }>
        >;
      });
      test('required.optional has wrong type', () => {
        // @ts-ignore
        type v = EqualTypes<
          // @ts-expect-error 
          ComparableType<VType<typeof validator>>,
          ComparableType<{
            required: {
              required: string;
              optional?: number;
            }
            optional?: {
              required: string;
              optional?: string;
            }
          }>
        >;
      });
      test('required.optional should be required', () => {
        // @ts-ignore
        type v = EqualTypes<
          // @ts-expect-error 
          ComparableType<VType<typeof validator>>,
          ComparableType<{
            required: {
              required: string;
              optional?: number;
            }
            optional?: {
              required: string;
              optional: string;
            }
          }>
        >;
      });
    });
  });

  test('input is not modified', async () => {
    const validator = V.check(
      V.object({
        properties: {
          date: V.date(),
        },
      }),
    );
    const input = { date: validDateString };
    const output = (await validator.validate(input)).getValue();
    expect(output).toBe(input);
    expect(output).toEqual({ date: validDateString });
  });

  test('null is not accepted', () => expectViolations(null, validator, defaultViolations.notNull()));

  test('undefined is not accepted', () => expectViolations(undefined, validator, defaultViolations.notNull()));

  test('missing property value', () => expectViolations({}, validator, defaultViolations.notNull(property('requiredProperty'))));

  test('requiredProperty should be a string', () =>
    expectViolations(
      {
        requiredProperty: true,
      },
      validator,
      new TypeMismatch(property('requiredProperty'), 'string', true),
    ));

  describe('ignoreUnknownProperties', () => {
    test('ignore unknown properties by default', () => {
      const object = { unknownProperty: true };
      return expectValid(object, V.object({}), object, { ignoreUnknownProperties: true });
    });

    test('log warning using warnLogger', async () => {
      const object = { unknownProperty: true };
      const warnings: Violation[] = [];
      await expectValid(object, V.object({}), object, {
        ignoreUnknownProperties: true,
        warnLogger: (violation: Violation) => warnings.push(violation),
      });
      expect(warnings).toEqual([defaultViolations.unknownProperty(property('unknownProperty'))]);
    });

    test('explicitly denied additionalProperties are still not allowed', async () => {
      const object = { unknownProperty: true };
      const result = await V.objectType().allowAdditionalProperties(false).build().validate(object, { ignoreUnknownProperties: true });
      expect(result).toEqual(new ValidationResult([defaultViolations.unknownPropertyDenied(property('unknownProperty'))]));
    });
  });

  test('deny unknown/additional properties', async () => {
    const object = { unknownProperty: true };
    const result = await V.object({ additionalProperties: false }).validate(object);
    expect(result).toEqual(new ValidationResult([defaultViolations.unknownPropertyDenied(property('unknownProperty'))]));
  });

  test('additional properties not allowed', () =>
    expectViolations(
      {
        requiredProperty: 'requiredProperty',
        additionalProperty: 'additionalProperty',
      },
      validator,
      defaultViolations.unknownProperty(property('additionalProperty')),
    ));

  test('additional properties allowed', () => {
    const validator = V.object({
      properties: {},
      additionalProperties: true,
    });
    return expectValid(
      {
        additionalProperty: 'additionalProperty',
      },
      validator,
    );
  });

  describe('extending additional property validations', () => {
    const parent = V.object({
      additionalProperties: {
        keys: V.any(),
        values: V.toInteger(),
      },
    });
    const validator = V.object({
      extends: parent,
      additionalProperties: {
        keys: V.any(),
        values: V.min(1),
      },
    });

    test('parent conversion is available for child validator', () => expectValid({ foo: '1' }, validator, { foo: 1 }));

    test("invalid value for parent doesn't run child validator", () =>
      expectViolations({ foo: 'a' }, validator, defaultViolations.number('a', NumberFormat.integer, property('foo'))));

    test('invalid value for child validator', () => expectViolations({ foo: 0 }, validator, defaultViolations.min(1, true, 0, property('foo'))));
  });

  test('disallow all properties', () =>
    expectViolations({ property: 'value' }, V.object({ additionalProperties: false }), defaultViolations.unknownPropertyDenied(ROOT.property('property'))));

  test('string not allowed', () => expectViolations('string', V.object({}), defaultViolations.object(ROOT)));

  test('number not allowed', () => expectViolations(123, V.object({}), defaultViolations.object()));

  test('parent may disallow additional properties for child models', async () => {
    const parent = V.object({ additionalProperties: false });
    const validator = V.object({ extends: parent, additionalProperties: true });
    await expectViolations({ property: 'string' }, validator, defaultViolations.unknownPropertyDenied(ROOT.property('property')));
  });

  describe('properties', () => {
    test('valid properties', async () => {
      const validator = V.properties(V.string(), V.string());
      await expectValid({ foo: 'bar' }, validator);
    });
    test('enum keys'), async () => {
      enum Keys { A = 'A', B = 'B', C = 'C' };
      type type = { [key in Keys]?: number };
      const validator = V.properties(V.enum(Keys, 'Keys'), V.number());
      await expectValid({ A: 5 }, validator);
      await expectValid({ A: 1, B: 2, C: 3 }, validator);
      await expectViolations({ D: 4 }, validator, defaultViolations.enum('Keys', 'D'))
    }
  });

  describe('cross-property rules', () => {
    interface IPasswordRequest {
      password1: string;
      password2: string;
    }
    class PasswordRequest {
      password1: string;
      password2: string;
      constructor(properties: IPasswordRequest) {
        this.password1 = properties.password1;
        this.password2 = properties.password2;
      }
    }
    const modelValidator = V.objectType()
      .properties({
        password1: V.string().notEmpty(),
        password2: V.string().notBlank(),
      })
      .next(V.map(value => new PasswordRequest(value)))
      .build()

    const validator = modelValidator.next(
      V.assertTrue((request: PasswordRequest) => request.password1 === request.password2, 'ConfirmPassword', property('password1')),
    );

    test('matching passwords', async () =>
      await expectValid({ password1: 'pwd', password2: 'pwd' }, validator, new PasswordRequest({ password1: 'pwd', password2: 'pwd' })));

    test('non-matching passwords', async () =>
      await expectViolations({ password1: 'pwd', password2: 'pwb' }, validator, new Violation(property('password1'), 'ConfirmPassword')));
  });

  describe('recursive models', async () => {

    interface RecursiveModel {
      first: string;
      next?: RecursiveModel;
    }
    // Typed placeholder for the recursive validator
    let recursion: ObjectValidator<RecursiveModel, RecursiveModel>;
    const validator = V.objectType()
      .properties({
        first: V.string(),
        next: V.optionalStrict(V.fn((value: any, path: Path, ctx: ValidationContext) => recursion.validatePath(value, path, ctx))),
      })
      .build();
    recursion = validator;
    assertType<EqualTypes<ComparableType<VType<typeof validator>>, ComparableType<RecursiveModel>>>(true);

    test('recursive type', () => expectValid(({ first: 'first', next: { first: 'second', next: { first: 'third' } } }) satisfies VType<typeof validator>, validator));

    test('cyclic data', async () => {
      const first: any = { first: 'first' };
      const second: any = { first: 'second', next: first };
      first.next = second;
      return expectValid(first, validator, first, { allowCycles: true });
    });
  });

  describe('custom property filtering ObjectValidator extension', () => {
    class DropAllPropertiesValidator<T> extends ObjectValidator<Partial<T>> {
      constructor(model: ObjectModel) {
        super(model);
      }
      validatePath(value: any, path: Path, ctx: ValidationContext): PromiseLike<Partial<T>> {
        return this.validateFilteredPath(value, path, ctx, _ => false);
      }
    }

    test('required property validation skipped', async () =>
      expectValid(
        { property: 'to-be-dropped' },
        new DropAllPropertiesValidator({
          properties: { requiredProperty: V.string() }, // Not reported
        }),
        {},
      ));

    test('additional property validation skipped', async () =>
      expectValid(
        { foo: 'NaN' },
        new DropAllPropertiesValidator({
          additionalProperties: {
            keys: V.hasValue('bar'),
            values: V.integer(),
          },
        }),
        {},
      ));

    test('filtered-out properties are dropped', async () => {
      const result = await new DropAllPropertiesValidator({}).validate({ foo: 'foo', bar: 'bar' });
      expect(result.isSuccess()).toBe(true);
      expect(Object.keys(result.getValue()).length).toBe(0);
    });
  });

  describe('localProperties', () => {
    interface IParent {
      type: string;
      parentProp?: string;
      //foo: boolean; // This makes type of parent never
      nestedObject?: {
        req: string;
        foo: boolean;
      }
    }

    interface IChild extends IParent { }

    const parent = V.objectType()
      .properties({
        /**
         * Type of this object.
         */
        type: V.string(),
        parentProp: V.optionalStrict(V.string()),
        //foo: V.optionalStrict(V.boolean()),
        nestedObject: V.optionalStrict(
          V.objectType()
            .properties({
              req: V.string(),
              foo: V.boolean(),
            })
            .build()
        ),
      })
      .localProperties({
        type: V.hasValue('Parent' as const),
      })
      .build();

    const child = V.objectType()
      .extends(parent)
      .localProperties({
        type: V.hasValue<'Child'>('Child'),
      })
      .build();
    type parentType = VInheritableType<typeof parent>;
    type childType = VInheritableType<typeof child>;
    assertType<EqualTypes<ComparableType<parentType>, ComparableType<IParent>>>(true);
    assertType<EqualTypes<ComparableType<childType>, ComparableType<IChild>>>(true);

    test('valid parent', () => expectValid({ type: 'Parent' } satisfies parentType, parent));

    test('valid child', () => expectValid({ type: 'Child' } satisfies childType, child));

    test('parent is not valid child', () => expectViolations({ type: 'Parent' }, child, new HasValueViolation(property('type'), 'Child', 'Parent')));

    test('child is not valid parent', () => expectViolations({ type: 'Child' }, parent, new HasValueViolation(property('type'), 'Parent', 'Child')));
  });

  describe('toObject', () => {
    test('undefined', () => expectValid(undefined, V.toObject('value')));

    test('null', () => expectValid(null, V.toObject('value'), { value: null }));

    test('123', () => expectValid(123, V.toObject('value'), { value: 123 }));

    test('object', () => expectValid({}, V.toObject('value')));
  });

  describe('derived validators', () => {
    const base = V.objectType()
      .properties({
        prop1: V.string(),
        prop2: V.number(),
      })
      .localProperties({
        local: V.boolean(),
      })
      .build();

    test('omit', async () => {
      const omit = base.omit('prop1', 'local');
      const value = ({ prop2: 123 }) satisfies VType<typeof omit>;
      expectValid(value, omit);
    })
    test('pick', async () => {
      const pick = base.pick('prop1', 'local');
      const value = ({ prop1: 'foo', local: true }) satisfies VType<typeof pick>;
      expectValid(value, pick);
    })
  });
});

describe('additionalProperties', () => {
  const allowXString = V.object({
    additionalProperties: {
      keys: V.pattern(/^x-.+/),
      values: V.string(),
    },
  });
  const allowYStringRestrictX = V.object({
    extends: allowXString,
    additionalProperties: [
      {
        keys: V.pattern(/^y-.+/),
        values: V.string(),
      },
      {
        keys: V.pattern(/^x-.+/),
        values: V.check(V.toInteger()),
      },
    ],
  });

  test('x-property: "foo" allowed', () => expectValid({ 'x-property': 'foo' }, allowXString));

  test('x-property: 123 not allowed', () => expectViolations({ 'x-property': 123 }, allowXString, defaultViolations.string(123, property('x-property'))));

  test('y-property not allowed', () =>
    expectViolations({ 'y-property': 'foo' }, allowXString, defaultViolations.pattern(/^x-.+/, 'y-property', property('y-property'))));

  test('y-property allowed', () => expectValid({ 'y-property': 'foo' }, allowYStringRestrictX));

  test('x-property restricted to numeric string', () =>
    expectViolations({ 'x-property': 'foo' }, allowYStringRestrictX, defaultViolations.number('foo', NumberFormat.integer, property('x-property'))));

  test('x-property numeric string is valid', () => expectValid({ 'x-property': '123' }, allowYStringRestrictX));

  test('z-property not allowed', () =>
    expectViolations({ 'z-property': 'foo' }, allowYStringRestrictX, defaultViolations.unknownProperty(property('z-property'))));
});

describe('inheritance', () => {
  const parentValidator = V.objectType()
    .properties({
      id: V.notNull(),
    })
    .build();

  const childValidator = V.objectType()
    .extends(parentValidator).properties({
      id: V.string(), // Additional requirements for the id property
      name: V.string().notEmpty(),
    })
    .build();

  const addionalPropertiesAllowed = V.objectType()
    .allowAdditionalProperties(true)
    .build();

  const multiParentChild = V.objectType()
    .extends(childValidator)
    .extends(addionalPropertiesAllowed)
    .properties({
      anything: V.notNull(),
    })
    .build();

  test('valid parent', () => expectValid({ id: 123 }, parentValidator));

  test('valid child', () => expectValid({ id: '123', name: 'child' }, childValidator));

  test('valid child id', () => expectViolations({ id: 123, name: 'child' }, childValidator, defaultViolations.string(123, property('id'))));

  test('invalid parent property', () => expectViolations({ name: 'child' }, childValidator, defaultViolations.notNull(property('id'))));

  test('invalid child property', () => expectViolations({ id: '123', name: '' }, childValidator, defaultViolations.notEmpty(property('name'))));

  test('valid multi-parent object', () =>
    expectValid(
      {
        id: '123',
        name: 'multi-parent',
        anything: true,
        additionalProperty: 123,
      } satisfies VType<typeof multiParentChild>,
      multiParentChild,
    ));
  test('invalid multi-parent object', () =>
    expectViolations(
      { additionalProperty: 123, name: '' },
      multiParentChild,
      defaultViolations.notNull(property('anything')),
      defaultViolations.notNull(property('id')),
      defaultViolations.notEmpty(property('name')),
    ));

  test("child's extended property validators are only run after successful parent property validation", async () => {
    const parent = V.object({
      properties: {
        required: V.required(V.toInteger(), V.min(0)),
      },
    });
    const type = V.object({
      extends: parent,
      properties: {
        required: V.allOf(V.min(1), V.max(3)), // Extend parent rules
      },
    });

    await expectViolations({}, type, defaultViolations.notNull(property('required')));
  });

  test('property order', async () => {
    const value = (
      await multiParentChild.validate({
        id: '123',
        name: 'multi-parent',
        anything: true,
        firstAdditional: 'firstAdditional',
        additionalProperty: 2,
        thirdAdditional: 'thirdAdditional',
      })
    ).getValue();
    expect(Object.keys(value)).toEqual(['id', 'name', 'anything', 'firstAdditional', 'additionalProperty', 'thirdAdditional']);
  });

  describe('allOf parent next validators', async () => {
    const parent1 = V.objectType().properties({
      pwd1: V.string(),
      pwd2: V.string(),
    }).next(V.assertTrue(obj => obj.pwd1 === obj.pwd2, 'PasswordsMatch'))
      .build();

    const parent2 = V.objectType().properties({
      min: V.number(),
      max: V.number(),
    }).next(V.assertTrue(obj => obj.min <= obj.max, 'MinLoeMax'))
      .build();

    const child = V.objectType()
      .extends(parent1)
      .extends(parent2)
      .build();

    test('valid child', () => expectValid({ pwd1: 'pwd', pwd2: 'pwd', min: 1, max: 2 } satisfies VType<typeof child>, child))

    test('invalid child', () => expectViolations({ pwd1: 'pwd1', pwd2: 'pwd2', min: 2, max: 1 }, child, new Violation(ROOT, 'PasswordsMatch'), new Violation(ROOT, 'MinLoeMax')));
  });
});

describe('object next', () => {
  interface Password {
    pw1: string;
    pw2: string;
  }
  const passwordValidator = V.object<Password>({
    properties: {
      pw1: V.string(),
      pw2: V.string(),
    },
    next: V.assertTrue((user: Password) => user.pw1 === user.pw2, 'PasswordVerification', Path.of('pw2')),
  });

  test('passwords match', () => expectValid({ pw1: 'test', pw2: 'test' }, passwordValidator));

  test('passwords mismatch', () => expectViolations({ pw1: 'test', pw2: 't3st' }, passwordValidator, new Violation(Path.of('pw2'), 'PasswordVerification')));

  test('run after property validators', () => expectViolations({ pw1: 'test' }, passwordValidator, defaultViolations.notNull(Path.of('pw2'))));

  describe('inherited next', () => {
    interface User extends Password {
      name: string;
    }
    const userValidator = V.object({
      extends: passwordValidator,
      properties: {
        name: V.string(),
      },
      next: V.assertTrue((user: User) => user.pw1.indexOf(user.name) < 0, 'BadPassword', Path.of('pw1')),
    });

    test('BadPassword', () => expectViolations({ pw1: 'test', pw2: 'test', name: 'tes' }, userValidator, new Violation(Path.of('pw1'), 'BadPassword')));

    test('child next is applied after successfull parent next', () =>
      expectViolations({ pw1: 'test', pw2: 't3st', name: 'tes' }, userValidator, new Violation(Path.of('pw2'), 'PasswordVerification')));
  });
});

describe('object localNext', () => {
  const parent = V.objectType()
    .properties({
      name: V.string(),
      upper: V.optional(V.boolean()),
    }).next(V.map(obj => {
      if (obj.upper) {
        obj.name = (obj.name as string).toUpperCase();
      }
      return obj;
    }))
    .localNext(V.map(obj => `parent:${obj.name}`))
    .build();
  const child = V.objectType()
    .extends(parent)
    .localNext(V.map(obj => `child:${obj.name}`))
    .build();

  test('parent', async () => {
    expect((await parent.validate({ name: 'Darth' })).getValue()).toEqual('parent:Darth');
  });

  test('child', async () => {
    expect((await child.validate({ name: 'Luke' })).getValue()).toEqual('child:Luke');
  });

  test('next applies for parent', async () => {
    expect((await parent.validate({ name: 'Darth', upper: true })).getValue()).toEqual('parent:DARTH');
  });

  test('next applies for child', async () => {
    expect((await child.validate({ name: 'Luke', upper: true })).getValue()).toEqual('child:LUKE');
  });

  test('localNext is skipped on field validation error', async () => {
    const model = V.object({
      properties: {
        name: V.string(),
      },
      localNext: V.map((obj: any) => `parent:${obj.name}`),
    });
    await expectViolations({}, model, defaultViolations.notNull(property('name')));
  });
});

describe('Date', () => {
  const now = new Date();
  const validator = V.objectType()
    .properties({
      date: V.date(),
    })
    .build();

  ({ date: new Date() }) satisfies VType<typeof validator>;

  test('null is not allowed', () => expectViolations(null, V.date(), defaultViolations.notNull()));

  test('convert string to Date', () => expectValid(validDateString, V.date(), validDate));

  test('Date instance is valid', () => expectValid(now, V.date()));

  test('boolean is invalid', () => expectViolations(true, V.date(), defaultViolations.date(true)));

  test('convert nested string to Date', async () => {
    let object = {
      date: validDateString,
    };
    await expectValid(object, validator, { date: new Date(validDateString) });
  });

  test('invalid date format', () => expectViolations('23.10.2019T09:10:00Z', V.date(), defaultViolations.date('23.10.2019T09:10:00Z')));

  test('subsequent validators get to work on Date', () => {
    async function notInstanceOfDate(value: any, path: Path, ctx: ValidationContext) {
      // Return violation of expected case to verify that this validator is actually run
      if (value instanceof Date) {
        throw new Violation(path, 'NotInstanceOfDate');
      }
      return Promise.resolve(value);
    }
    const validator = V.object({
      properties: {
        date: V.date().next(V.fn(notInstanceOfDate, 'NotInstanceOfDate')),
      },
    });
    const object = {
      date: validDateString,
    };
    return expectViolations(object, validator, new Violation(property('date'), 'NotInstanceOfDate'));
  });
});

describe('compositionOf', () => {
  test('only first failure returned', () => expectViolations(null, V.notNull().next(V.notEmpty()), defaultViolations.notNull()));
});

describe('enum', () => {
  enum StrEnum {
    A = 'A',
    B = 'B',
  }
  enum IntEnum {
    A,
    B,
  }

  test('null is not allowed', () => expectViolations(null, V.enum(StrEnum, 'StrEnum'), defaultViolations.notNull()));

  describe('String', () => {
    const validator = V.enum(StrEnum, 'StrEnum');
    type validatorType = VType<typeof validator>;
    test('valid reference', async () =>
      (await expectValid(StrEnum.B satisfies validatorType, validator)) satisfies validatorType);
    test('valid strign', () => expectValid('A', validator));
    test('invalid', () => expectViolations('C', validator, defaultViolations.enum('StrEnum', 'C')));
  });

  describe('int', () => {
    const validator = V.enum(IntEnum, 'IntEnum');
    type validatorType = VType<typeof validator>;
    test('valid reference', async () =>
      (await expectValid(IntEnum.A satisfies validatorType, validator)) satisfies validatorType);
    test('valid int', () => expectValid(0, validator));
    test('invalid', () => expectViolations(2, validator, defaultViolations.enum('IntEnum', 2)));
  });

  test('ignoreUnknownEnumValues', () =>
    expectValid('C', V.enum(StrEnum, 'StrEnum'), 'C' as any, {
      ignoreUnknownEnumValues: true,
    }));

  test('ignoreUnknownEnumValues with warning', async () => {
    const warnings: Violation[] = [];
    await expectValid('C', V.enum(StrEnum, 'StrEnum'), 'C' as any, {
      ignoreUnknownEnumValues: true,
      warnLogger: (violation: Violation) => warnings.push(violation),
    });
    expect(warnings).toEqual([defaultViolations.enum('StrEnum', 'C')]);
  });
});

describe('oneOf', () => {
  enum EnumType {
    A = 'A',
    B = 'B',
  }
  describe('with conversion', () => {
    const validator = V.oneOf(V.hasValue('2019-01-24T09:10:00Z'), V.date(), V.enum(EnumType, 'EnumType'));

    test('valid enum', () => expectValid('A', validator, EnumType.A));

    test('valid date', () => expectValid(validDateString, validator, validDate));

    test('invalid value matching two', () => expectViolations('2019-01-24T09:10:00Z', validator, defaultViolations.oneOf(2)));

    test('no matches', () => expectViolations('ABD', validator, defaultViolations.oneOf(0)));
  });
});

describe('anyOf', () => {
  enum EnumType {
    A = 'ABC',
  }

  const violationHasValue = new HasValueViolation(ROOT, '2019-01-24T09:10:00Z', 'ABD');
  const violationTypeMismatch = new TypeMismatch(ROOT, 'Date', 'ABD');
  const violationEnumMismatch = new EnumMismatch(ROOT, 'EnumType', 'ABD');

  const noMatchesViolations: Violation[] = [violationHasValue, violationTypeMismatch, violationEnumMismatch];

  const validator = V.anyOf(V.hasValue('2019-01-24T09:10:00Z'), V.date(), V.enum(EnumType, 'EnumType'));

  describe('single context', () => {
    test('valid enum', () => expectValid('ABC', validator, EnumType.A));
    test('valid date', () => expectValid(validDateString, validator, validDate));
    test('no matches', () => expectViolations('ABD', validator, ...noMatchesViolations));
  });

  describe('array context', () => {
    const matchingArray = ['2019-01-24T09:10:00Z', validDate, 'ABC'];
    const arrayValidator = V.array(validator);

    test('valid items in array', async () =>
      arrayValidator.validate(matchingArray).then(result => {
        expect(result.getValue().length).toBe(3);
        expect(result.getViolations()).toEqual([]);
      }));
    test('fails due to invalid item added', async () =>
      arrayValidator.validate([...matchingArray, 'ABD']).then(result => {
        expect(result.getViolations().length).toBe(3);
      }));
  });
});

describe('arrays', () => {
  const dateArray = V.check(V.array(V.date()));
  const stringArray = V.toArray(V.string());

  test('no conversion', () => expectValid([validDateString], dateArray, [validDateString]));

  test('contains invalid date', () => expectViolations([validDateString, 'abc'], dateArray, defaultViolations.date('abc', index(1))));

  test('input is not modified', async () => {
    const dateArray = V.array(V.check(V.date()));
    const input = [validDateString];
    const output = (await dateArray.validate(input)).getValue();
    expect(output).not.toBe(input);
    expect(output).toEqual([validDateString]);
  });

  test('undefined is not allowed', () => expectViolations(undefined, V.array(V.string()), defaultViolations.notNull(ROOT)));

  test('null is not allowed', () => expectViolations(null, V.array(V.string()), defaultViolations.notNull(ROOT)));

  test('non-array is not allowed', () => expectViolations({}, V.array(V.string()), new TypeMismatch(ROOT, 'array', {})));

  describe('convert', () => {
    const dateArray = V.toArray(V.date());

    test('convert items to dates', () => expectValid([validDateString], dateArray, [validDate]));

    test('convert to Set', () =>
      expectValid(
        ['foo', 'foo', 'foo'],
        V.array(V.string()).nextMap(array => new Set(array)),
        new Set(['foo']),
      ));
  });

  describe('normalize', () => {
    test('undefined to empty array', () => expectValid(undefined, stringArray, []));

    test('null to array with null', () => expectViolations(null, stringArray, defaultViolations.notNull(ROOT.index(0))));

    test('single value to array of one', () => expectValid('foo', stringArray, ['foo']));

    test('any item is allowed', () => expectValid(['string'], V.toArray(V.string())));
  });

  describe('size', () => {
    test('valid', () => expectValid([1], V.size<number[]>(1, 1)));

    test('too short', () => expectViolations([1], V.size(2, 3), defaultViolations.size(2, 3)));

    test('too long', () => expectViolations([1, 2], V.size(1, 1), defaultViolations.size(1, 1)));
  });
});

describe('number', () => {
  test('valid number', () => expectValid(12.34, V.number()));

  test('valid numeral string', () => expectValid('-12.34', V.toNumber(), -12.34));

  test('invalid number', () => expectViolations('12.ab', V.toNumber(), defaultViolations.number('12.ab')));

  test('undefined is invalid', () => expectViolations(undefined, V.number(), defaultViolations.notNull()));

  test('null is invalid', () => expectViolations(undefined, V.toNumber(), defaultViolations.notNull()));

  test('blank string is not valid number', () => expectViolations(' ', V.toNumber(), defaultViolations.number(' ')));

  test('boolean is not a number', () => expectViolations(true, V.toNumber(), defaultViolations.number(true)));

  describe('min', () => {
    test('undefined is not allowed', () => expectViolations(undefined, V.min(1), defaultViolations.notNull()));

    test('string is not allowed', () => expectViolations('123' as any, V.min(1), defaultViolations.number('123')));

    test('min/max chaining', () => expectValid(2, V.number().min(1).max(3)));

    test('min/max chaining failure', () => expectViolations('2' as any, V.number().min(1).max(3), new TypeMismatch(ROOT, 'number', '2')));

    test('min inclusive equal value', () => expectValid(1.1, V.min(1.1, true)));

    test('min smaller value', () => expectViolations(0.1, V.min(1.1, false), defaultViolations.min(1.1, false, 0.1)));

    test('min larger value', () => expectValid(1.2, V.min(1.1, false)));

    test('min inclusive equal (string) value', () => expectValid('1.1', V.check(V.toNumber(), V.min(1.1, true))));

    test('min strict equal value', () => expectViolations(1.1, V.min(1.1, false), defaultViolations.min(1.1, false, 1.1)));

    test('min strict equal (string) value', () => expectViolations('1.1', V.toNumber().next(V.min(1.1, false)), defaultViolations.min(1.1, false, 1.1)));
  });

  describe('max', () => {
    test('undefined is not allowed', () => expectViolations(undefined, V.max(1), defaultViolations.notNull()));

    test('string is not allowed', () => expectViolations('123' as any, V.max(1), defaultViolations.number('123')));

    test('max/min chaining', () => expectValid(2, V.number().max(3).min(1)));

    test('max inclusive equal value', () => expectValid(1.1, V.max(1.1, true)));

    test('max larger value', () => expectViolations(1.2, V.max(1.1, false), defaultViolations.max(1.1, false, 1.2)));

    test('max smaller value', () => expectValid(1.0, V.max(1.1, false)));

    test('max inclusive equal (string) value', () => expectValid('1.1', V.check(V.toNumber(), V.max(1.1, true))));

    test('max strict equal value', () => expectViolations(1.1, V.max(1.1, false), defaultViolations.max(1.1, false, 1.1)));

    test('max strict equal (string) value', () =>
      expectViolations('1.1', V.check(V.toNumber().next(V.max(1.1, false))), defaultViolations.max(1.1, false, 1.1)));

    test('invalid max inclusive', () => expectViolations(2, V.max(1, true), defaultViolations.max(1, true, 2)));
  });

  describe('between', () => {
    test('min <= max when both are inclusive', () => expect(() => V.number().between(2, 1)).toThrow());

    test('min < max when either is exclusive', () => expect(() => V.number().between(2, 2, false)).toThrow());

    test('2 is between(2, 2)', () => expectValid(2, V.number().between(2, 2)));

    test('2 is not between(2, 3, false)', () => expectViolations(2, V.number().between(2, 3, false), defaultViolations.min(2, false, 2)));

    test('3 is not between(2, 3, true, false)', () => expectViolations(3, V.number().between(2, 3, true, false), defaultViolations.max(3, false, 3)));
  });

  describe('integer', () => {
    test('valid integer', () => expectValid(123456, V.integer(), 123456));

    test('valid integer string', () => expectValid('123456', V.toInteger(), 123456));

    test('decimals not allowed', () => expectViolations(12.34, V.integer(), defaultViolations.number(12.34, NumberFormat.integer)));

    test('decimal string is not valid', () => expectViolations('12.34', V.toInteger(), defaultViolations.number(12.34, NumberFormat.integer)));

    describe('min', () => {
      test('min inclusive equal value', () => expectValid(0, V.min(0, true)));

      test('min inclusive equal (string) value', () => expectValid('1', V.check(V.toNumber().min(1, true))));

      test('min strict equal value', () => expectViolations(0, V.min(0, false), defaultViolations.min(0, false, 0)));

      test('min strict equal (string) value', () => expectViolations('1', V.toNumber().min(1, false), defaultViolations.min(1, false, 1)));
    });

    describe('convert', () => {
      test('valid integer', () => expectValid(-123, V.toInteger(), -123));

      test('convert Number to number', () => expectValid(new Number(123), V.toInteger(), 123));

      test('convert string to integer', () => expectValid('-123', V.toInteger(), -123));
    });
  });

  describe('async', () => {
    class WaitValidator<InOut> extends Validator<InOut, InOut> {
      public executionOrder: any[] = [];
      async validatePath(value: InOut, path: Path, ctx: ValidationContext) {
        return new Promise<InOut>((resolve, reject) => {
          setTimeout(() => {
            this.executionOrder.push(value);
            resolve(value);
          }, value as number);
        });
      }
    }
    test('should maintain original order even if execution order is reversed', async () => {
      const waitValidator = new WaitValidator();
      await expectValid([50, 40, 30, 20, 10, 1], V.array(waitValidator))
      expect(waitValidator.executionOrder).toEqual([1, 10, 20, 30, 40, 50])
    })
  })
});

describe('null or undefined', () => {
  test('null is valid', () => expectValid(null, V.nullOrUndefined()));

  test('undefined is valid', () => expectValid(undefined, V.nullOrUndefined()));

  test('true is invalid', () => expectViolations(true, V.nullOrUndefined(), new TypeMismatch(ROOT, 'NullOrUndefined', true)));
});

describe('async validation', () => {
  describe('allOf', () => {
    test('results ordered by timeout', async () => {
      const validator = V.allOf(defer(V.notEmpty(), 10), defer(V.toNumber(), 5), V.date());
      await expectViolations(
        '',
        validator,
        defaultViolations.date(''),
        defaultViolations.number(''),
        defaultViolations.notEmpty(),
      );
    });

    test('results must match', async () => {
      const validator = V.allOf(V.string(), V.toInteger());
      await expectViolations('123', validator, new Violation(ROOT, 'ConflictingConversions', '123'));
    });

    test('return original', async () => {
      await expectValid('123', V.allOf(V.string(), V.check(V.toInteger())), '123');
    });

    test('conflicting conversions not allowed', async () => {
      try {
        await V.allOf(defer(V.toInteger(), 3), defer(V.toObject('value'), 1)).validate('123');
        fail('expected an error');
      } catch (e) {
        // as expected
      }
    });
  });

  describe('oneOf', () => {
    test('valid', async () => {
      await expectValid('abc', V.oneOf(defer(V.number()), defer(V.string())));
    });

    test('invalid', async () => {
      await expectViolations(true, V.oneOf(defer(V.number()), defer(V.string())), defaultViolations.oneOf(0));
    });
  });

  describe('next', () => {
    const validator = defer(V.string()).next(defer(V.hasValue('true')));
    test('valid', async () => {
      await expectValid('true', validator);
    });

    test('invalid', async () => {
      await expectViolations(true, validator, defaultViolations.string(true));
    });
  });
});

describe('compositionOf', () => {
  const validator = V.compositionOf(
    V.string(),
    V.map((s: string) => s.replace(/[^0-9]/g, '')),
    V.toNumber(),
  );

  test('valid input', () => expectValid('A12c', validator, 12));

  test('invalid input', () => expectViolations('AbCd', validator, defaultViolations.number('')));
});

describe('groups', () => {
  const groups = new Groups();
  const DEFAULT = groups.define('default');
  const withDefault = groups.define('with default', 'default');
  const parent = groups.define('parent');
  const child = groups.define('child', 'parent');
  const grandchild = groups.define('grandchild', 'child', withDefault);

  test('group inclusions', () => {
    expect(DEFAULT.includes(withDefault)).toEqual(false);

    expect(withDefault.includes(DEFAULT)).toEqual(true);

    expect(DEFAULT.includes(parent)).toEqual(false);

    expect(child.includes(parent)).toEqual(true);

    expect(grandchild.includes('parent')).toEqual(true);

    expect(grandchild.includes('default')).toEqual(true);
  });

  test('groups contains all registered groups', () => {
    expect(groups.get('default')).toEqual(DEFAULT);

    expect(groups.get('with default')).toEqual(withDefault);

    expect(groups.get('parent')).toEqual(parent);

    expect(groups.get('child')).toEqual(child);

    expect(groups.get('grandchild')).toEqual(grandchild);
  });

  test('default not included in parent', () => expectGroupValid(null, DEFAULT, V.whenGroup(parent, failAlways).otherwise(V.any())));

  test('group includes itself', () => expectGroupViolations(null, parent, V.whenGroup('parent', failAlways), failAlwaysViolation()));

  test('grandhild includes child', () => expectGroupViolations(null, grandchild, V.whenGroup(child, failAlways), failAlwaysViolation()));

  test('grandhild includes parent', () => expectGroupViolations(null, grandchild, V.whenGroup('parent', failAlways), failAlwaysViolation()));

  test('child does not include grandchild', () => expectGroupViolations(null, child, V.whenGroup(grandchild, failAlways), new Violation(ROOT, 'NoMatchingGroup', null)));

  test('grandchild indluces default', () => expectGroupViolations(null, grandchild, V.whenGroup(DEFAULT, failAlways), failAlwaysViolation()));

  test('non-grouped validations run always', () => expectGroupViolations(null, DEFAULT, V.notNull(), defaultViolations.notNull()));

  test('both parent and child validators are executed', () => expectGroupValid('123', child, V.whenGroup(parent, V.string()).whenGroup(child, V.toNumber()), 123));

  test('referencing unknown groups not allowed', () => {
    const groups = new Groups();
    expect(() => groups.define('foo', 'bar')).toThrow();
  });

  test('redefinition not allowed', () => {
    const groups = new Groups();
    groups.define('foo');
    expect(() => groups.define('foo')).toThrow();
  });

  test('whenGroup not allowed after otherwise', () => {
    expect(() => (V.whenGroup('any', V.any()).otherwise(V.any()) as WhenGroupValidator).whenGroup('foo', V.any())).toThrow();
  });

  test('otherwise not allowed after otherwise', () => {
    expect(() => (V.whenGroup('any', V.any()).otherwise(V.any()) as WhenGroupValidator).otherwise(V.any())).toThrow();
  });

  test('Group.of', () => {
    const group = Group.of('foo', 'bar', 'baz');
    expect(group.includes('foo')).toBe(true);
    expect(group.includes('bar')).toBe(true);
    expect(group.includes('baz')).toBe(true);
    expect(group.includes('qux')).toBe(false);
  });

  describe('chaining', () => {
    const whenChainValidator = V.whenGroup(DEFAULT, V.notNull())
      .whenGroup(parent, V.notEmpty())
      .otherwise(V.string());

    test('chain first match', () => expectGroupViolations(null, withDefault, whenChainValidator, defaultViolations.notNull()));

    test('chain second match', () => expectGroupViolations('', child, whenChainValidator, defaultViolations.notEmpty()));

    test('chain otherwise', () => expectGroupViolations([], groups.define('new group'), whenChainValidator, defaultViolations.string([])));
  });
});

describe('required', () => {
  const validator = V.required(V.string());

  const dateInPast = (date: Date) => date.valueOf() < Date.now();

  test('null is invalid', () => expectViolations(null, validator, defaultViolations.notNull()));

  test('undefined is invalid', () => expectViolations(undefined, validator, defaultViolations.notNull()));

  test('value is passed to next', () => expectViolations(123 as any, validator, defaultViolations.string(123)));

  test('valid string', () => expectValid('123', validator));

  test('type conversion with compositionOf', () =>
    expectValid(validDateString, V.required(V.hasValue(validDateString), V.date(), V.assertTrue(dateInPast)), validDate));

  test('type validation with compositionOf', () =>
    expectValid(validDateString, V.check(V.hasValue(validDateString), V.date(), V.assertTrue(dateInPast))));
});

describe('optional', () => {
  const validator = V.optional(V.string());

  const dateInPast = (date: Date) => date.valueOf() < Date.now();

  test('null is valid', () => expectValid(null, validator));

  test('undefined is valid', () => expectValid(undefined, validator));

  test('value is passed to next', () => expectViolations(123 as any, validator, defaultViolations.string(123)));

  test('valid string', () => expectValid('123', validator));

  test('type conversion with compositionOf', () => expectValid(validDateString, V.optional(V.hasValue(validDateString), V.date(), V.assertTrue(dateInPast)), validDate));

  test('type validation with compositionOf', () => expectValid(validDateString, V.check(V.optional(V.hasValue(validDateString), V.date(), V.assertTrue(dateInPast)))));

  test('chained validation rules', () => expectViolations('0', V.optional(V.toInteger(), V.min(1)), defaultViolations.min(1, true, 0)));
});

describe('nullable', () => {
  const validator = V.nullable(V.string());

  test('valid null', () => expectValid(null, validator));

  test('valid string', () => expectValid('string', validator));

  test('undefined is invalid', () => expectViolations(undefined, validator, defaultViolations.notUndefined()));
});

describe('isNumber', () => {
  describe('positive cases', () => {
    test('123', () => expect(isNumber(123)).toBe(true));

    test('Number("123")', () => expect(isNumber(Number('123'))).toBe(true));

    test('Number objects do not pass as number primitives', () => expect(isNumber(new Number('123'))).toBe(false));
  });
  describe('negative cases', () => {
    test('"123"', () => expect(isNumber('123')).toBe(false));

    test('Number("abc")', () => expect(isNumber(Number('abc'))).toBe(false));

    test('new Number(123)', () => expect(isNumber(new Number(123))).toBe(false));
  });
});

describe('if', () => {
  const validator = V.if((value: any) => typeof value === 'number', V.min(1))
    .elseIf((value: unknown) => typeof value === 'boolean', V.hasValue(true))
    .else(V.string());

  test('if matches valid', () => expectValid(123, validator));

  test('if matches invalid', () => expectViolations(-1, validator, defaultViolations.min(1, true, -1)));

  test('elseif matches valid', () => expectValid(true, validator));

  test('elseif matches invalid', () => expectViolations(false, validator, new HasValueViolation(ROOT, true, false)));

  test('else matches valid', () => expectValid('123', validator));

  test('else matches invalid', () => expectViolations({}, validator, defaultViolations.string({})));

  test('defining else before elseif is not allowed', () => {
    expect(() => (V.if(_ => true, V.any()).else(V.any()) as IfValidator).elseIf(_ => true, V.any())).toThrow();
  });

  test('redefining else is not allowed', () => {
    expect(() => (V.if(_ => true, V.any()).else(V.any()) as IfValidator).else(V.any())).toThrow();
  });

  test('no-conditional anomaly', () => {
    expect(() => new IfValidator([])).toThrow('At least one conditional required');
  });

  test('no matching conditional', () => expectViolations("foo", V.if(() => false, V.boolean()), new Violation(ROOT, 'NoMatchingCondition', "foo")));
});

describe('ignore', () => {
  test('converts any value to undefined', async () => {
    expectUndefined('any value', V.ignore());
  });
});

describe('normalizers', () => {
  describe('emptyToNull', () => {
    test('undefined', () => expectValid(undefined, V.emptyToNull(), null));

    test('empty string', () => expectValid('', V.emptyToNull(), null));

    test('anything else is passed as is', () => expectValid('anything', V.emptyToNull()));
  });

  describe('emptyToUndefined', () => {
    test('null', () => expectUndefined(null, V.emptyToUndefined()));

    test('empty string', () => expectUndefined('', V.emptyToUndefined()));

    test('anything else is passed as is', () => expectValid('anything', V.emptyToUndefined()));
  });

  describe('undefinedToNull', () => {
    test('undefined', () => expectValid(undefined, V.undefinedToNull(), null));

    test('anything else is passed as is', () => expectValid('anything', V.undefinedToNull()));
  });

  describe('emptyTo', () => {
    test('undefined', () => expectValid(undefined, V.emptyTo('default'), 'default'));

    test('empty string', () => expectValid('', V.emptyTo('default'), 'default'));

    test('empty array', () => expectValid([], V.emptyTo(['default']), ['default']));

    test('anything else is passed as is', () => expectValid('anything', V.emptyTo('default')));
  });

  describe('nullTo', () => {
    test('undefined', () => expectValid(undefined, V.nullTo('default'), 'default'));

    test('null', () => expectValid(null, V.nullTo(1), 1));

    test('empty string', () => expectValid('', V.nullTo(true)));

    test('anything else is passed as is', () => expectValid('anything', V.nullTo('default')));
  });

  describe('nullToObject', () => {
    const validator = V.nullToObject();
    test('will produce new object each time', async () => {
      const a = (await validator.validate(null)).getValue();
      const b = (await validator.validate(undefined)).getValue();
      expect(a).toEqual({});
      expect(b).toEqual(a);
      expect(b).not.toBe(a);
    });
    test('will return existing value as is', async () => expectValid(123, validator));
  });

  describe('nullToArray', () => {
    const validator = V.nullToArray();
    test('will produce new array each time', async () => {
      const a = (await validator.validate(null)).getValue();
      const b = (await validator.validate(undefined)).getValue();
      expect(a).toEqual([]);
      expect(b).toEqual(a);
      expect(b).not.toBe(a);
    });
    test('will return existing value as is', async () => expectValid(false, validator));
  });
});

test('V.schema', () =>
  expectValid(
    { type: 'Model' },
    V.schema(_ => ({ discriminator: 'type', models: { Model: {} } })),
  ));

describe('map function', () => {
  test('exeption as violation', async () => {
    const error = new Error('Error message');
    await expectViolations(
      'anything',
      V.map((value: any) => {
        throw error;
      }),
      new ErrorViolation(ROOT, error),
    );
  });

  test('promise throwing a ValidationError', async () => {
    await expectViolations(
      'abc',
      V.map(async (value: any) => (await defer(V.number()).validate(value)).getValue()),
      defaultViolations.number('abc'),
    );
  });

  test('promise returning a Violation', async () => {
    await expectViolations(
      'any value',
      V.map(_ => new Promise(resolve => resolve(defaultViolations.notNull()))),
      defaultViolations.notNull(),
    );
  });
});

describe('Map', () => {
  interface MapKeyType {
    key1: string;
    key2: string;
  }

  test('undefined not allowed', () => expectViolations(undefined, V.mapType(V.any(), V.any()), defaultViolations.notNull()));

  describe('toMapType', () => {
    const validator = V.toMapType(
      V.object({
        properties: { key1: V.required(V.string()), key2: V.required(V.string()) },
      }),
      V.string(),
    );
    test('JSON roundtrip', async () => {
      const key = { key1: 'key1', key2: 'key2' };
      const mapArray: [MapKeyType, String][] = [[key, 'value']];

      // Real map is valid
      const map = new Map<MapKeyType, String>(mapArray);
      expect(map.get(key)).toEqual('value');
      let result = await validator.validate(map);
      expect(result.isFailure()).toBe(false);

      // Serializes to JSON as array
      const jsonString = JSON.stringify(result.getValue());
      const json = JSON.parse(jsonString);
      expect(json).toEqual(mapArray);

      // Is converted back to real (JsonMap extends) Map by validator
      result = await validator.validate(json);
      expect(result.isSuccess()).toBe(true);
      const convertedMap = result.getValue();
      expect(convertedMap).toBeInstanceOf(Map);
      expect(convertedMap.entries()).toEqual(map.entries());

      // WARN! Object keys use identity hash/equals (===)
      expect(convertedMap.get(key)).toBeUndefined();
    });

    test('non-array component is not allowed', () => expectViolations([{}], validator, new TypeMismatch(Path.of(0), 'Array')));

    test('three element component is not allowed', () => expectViolations([[1, 2, 3]], validator, new SizeViolation(Path.of(0), 1, 2)));

    test('empty array component is not allowed', () => expectViolations([[]], validator, new SizeViolation(Path.of(0), 1, 2)));

    test('object is not allowed', () => expectViolations({}, validator, new TypeMismatch(Path.ROOT, 'Map OR array of [key, value] arrays')));
  });

  describe('mapType', () => {
    const validator = V.mapType(V.string(), V.string(), false);

    test('Map instance is valid', () => expectValid(new Map(), validator));

    test('object is not valid', () => expectViolations({}, validator, new TypeMismatch(ROOT, 'Map')));

    test('Map has invalid value', () => expectViolations(new Map([['foo', 0]]), validator, new TypeMismatch(Path.of(0, 1), 'string', 0)));

    test('Map has invalid key', () => expectViolations(new Map([[0, 'foo']]), validator, new TypeMismatch(Path.of(0, 0), 'string', 0)));
  });
});

describe('Set', () => {
  test('undefined not allowed', () => expectViolations(undefined, V.setType(V.any()), defaultViolations.notNull()));

  test('Set instance is valid', () => expectValid(new Set([1, 2]), V.setType(V.number(), false)));

  test('array is valid', () => expectValid([1, 2], V.setType(V.number(), false), new Set([1, 2])));

  test('object is not valid', () => expectViolations({}, V.setType(V.number(), false), new TypeMismatch(ROOT, 'Set')));

  test('Set has invalid value', () => expectViolations(new Set(['foo']), V.setType(V.number()), new TypeMismatch(Path.of(0), 'number', 'foo')));

  test('json round-trip', async () => {
    const setArray = [1, 2, 3];
    const validator = V.setType(V.number(), true);

    const set1 = (await validator.validate(new Set(setArray))).getValue();
    expect(set1).toBeInstanceOf(JsonSet);

    const parsedArray = JSON.parse(JSON.stringify(set1));
    expect(parsedArray).toEqual(setArray);
  })
})

describe('json', () => {
  const validator = V.json(V.array(V.string()));

  test('undefined is invalid', () => expectViolations(undefined, validator, defaultViolations.notNull()));

  test('null is invalid', () => expectViolations(null, validator, defaultViolations.notNull()));

  test('JSON string array is valid', () => expectValid('["foo", "bar"]', validator, ['foo', 'bar']));

  test('JSON object is invalid', () => expectViolations('{}', validator, new TypeMismatch(Path.of(), 'array', {})));

  test('Invalid JSON', () => expectViolations('["foo", "bar"', validator, new TypeMismatch(Path.of(), 'JSON', '["foo", "bar"')));

  test('Non-string input is invalid', () => expectViolations(123 as any, validator, new TypeMismatch(Path.of(), 'string', 123)));
});
