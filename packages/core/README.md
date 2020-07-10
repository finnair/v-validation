![CI](https://github.com/finnair/v-validation/workflows/CI/badge.svg?branch=master)
[![codecov](https://codecov.io/gh/finnair/v-validation/branch/master/graph/badge.svg)](https://codecov.io/gh/finnair/v-validation)
[![npm version](https://badge.fury.io/js/%40finnair%2Fv-validation.svg)](https://badge.fury.io/js/%40finnair%2Fv-validation)

# v-validation

V stands for Validation.

`V` rules define how input is to be converted, normalized and validated to
conform to the expected model.

## Getting Started

Install v-validation using [`yarn`](https://yarnpkg.com/en/package/jest):

```bash
yarn add @finnair/v-validation
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/v-validation
```

## Show Me the Code!

```typescript
(await V.toNumber().validate('123')).getValue();
// 123

(await V.date().validate('2020-03-05T09:08:06.397Z')).getValue();
// new Date('2020-03-05T09:08:06.397Z')

(await V.toBoolean().validate('truish')).getValue();
// ValidationError: [             // One or more Violations
//   {
//     "path": "$",               // JSONPath to the invalid value
//     "type": "TypeMismatch",    // Type of the error
//     "invalidValue": "truish",  // Invalid input value
//     "expected": "boolean"      //  Expected type
//   }
// ]
```

Validators can be chained and combined.

```typescript
const percentageValidator = V.integer().then(V.min(0), V.max(100));
(await percentageValidator.validate(123)).getValue();
// ValidationError: [
//   {
//     "path": "$",
//     "type": "Max",
//     "invalidValue": 123,
//     "max": 100,
//     "inclusive": true
//   }
// ]
```

Optional `Vmoment` (`@finnair/v-validation-moment`) extension uses custom Moment extensions to support full JSON roundtrip with strict validation.

```typescript
const dateMoment = (await Vmoment.date().validate('2020-03-05')).getValue();
// moment('2020-03-05', 'YYYY-MM-DD', true)

JSON.stringify(dateMoment);
// "2020-03-05"
```

Validators are essentially immutable functions that can be combined to form more complex models.

```typescript
const personValidator = V.object({
  properties: {
    name: V.required(V.string(), V.notBlank()), // Another way of saying V.string().then(V.notBlank())
    dateOfBirth: Vmoment.date(), // Requires a non-null value, a Moment instance or YYYY-MM-DD formatted string
    nickName: V.optional(V.string()),
  },
  additionalProperties: false,
});

(await personValidator.validate({ name: 'John Doe', extraProperty: 'foo' })).getValue();
// ValidationError: [
//   {
//     "path": "$.dateOfBirth",
//     "type": "NotNull"
//   },
//   {
//     "path": "$.extraProperty",
//     "type": "UnknownProperty"
//   }
// ]
```

Custom converters can be defined as a simple map functions.

```typescript
const base64json = V.map(value => JSON.parse(new Buffer(value, 'base64').toString()), 'InvalidEncoding');
(await base64json.validate('eyAibWVzc2FnZSI6ICJIZWxsbyBXb3JsZCEiIH0=')).getValue();
// { message: 'Hello World!' }

(await base64json.validate('eyBtZXNzYWdlOiBIZWxsbyBXb3JsZCEgfQ==')).getValue(); // Invalid JSON throws an exception
// ValidationError: [
//   {
//     "path": "$",
//     "type": "Error",
//     "error": "InvalidEncoding"
//   }
// ]
```

Even complex custom validators can be implemented as simple anonymous functions.

```typescript
// 1) MODEL
interface UserRegistration {
  password1: string;
  password2: string;
}

// 2) VALIDATION RULES
// A custom validator to check that password1 === password2 with failures targeted at password2 field
const checkPassword = V.fn(async (value: UserRegistration, path: Path, ctx: ValidationContext) => {
  if (value.password1 !== value.password2) {
    return ctx.failure(new Violation(path.property('password2'), 'PasswordsMustMatch'), value);
  }
  return ctx.success(value);
});

const UserRegistrationValidator = V.object({
  properties: {
    password1: V.string().then(V.pattern(/[A-Z]/), V.pattern(/[a-z]/), V.pattern(/[0-9]/), V.size(8, 32)),
    password2: V.string(),
  },
  // then: checkPassword, /* An alternative way of defining cross-property rules. This allows extending UserRegistrationValidator. */
}).then(checkPassword); // Because of this, UserRegistrationValidator is actually a ThenValidator, which cannot be extended by V.object().

// 3) INPUT VALIDATION
(await UserRegistrationValidator.validate({ password1: 'FooBar' })).getValue();
// ValidationError: ValidationError: [
//   {
//     "path": "$.password2",
//     "type": "NotNull"
//   },
//   {
//     "path": "$.password1",
//     "type": "Pattern",
//     "invalidValue": "FooBar",
//     "pattern": "/[0-9]/"
//   },
//   {
//     "path": "$.password1",
//     "type": "Size",
//     "min": 8,
//     "max": 32
//   }

(await UserRegistrationValidator.validate({ password1: 'FooBar0_', password2: 'Foobar0_' })).getValue();
// ValidationError: [
//   {
//     "path": "$.password2",
//     "type": "PasswordsMustMatch"
//   }
// ]
```

## Vhy?

- Machine readable error reports
  - V's Violation is easily readable to any developer and can be used to localize and target human readable error messages in the UI
  - Errors serialize to JSON nicely for easy interoperability
- Asynchronous processing allows I/O based validators
  - E.g. check if a code or an ID exists
- Fluent syntax
- Composability
- Supports object oriented inheritance and polymorphism where as
  - OpenAPI's inheritance and polymorpism mechanism is problematic if not broken alltogether
  - The latest draft of [JSON Schema (2019-09) doesn't support inheritance](https://github.com/json-schema-org/json-schema-org.github.io/issues/148)
- Effortless custom extension
  - All non-trivial use cases require some custom validation logic
  - Custom validators can be defined as simple functions
  - No need to register custom validators
- Effectively Immutable
  - Everything that can be immutable, is immutable - or as immutable as practically possible in TypeScript/JavaScript
  - Only defining recursive models requires mutations when defining the rules - a rule must first be defined so that it can be referenced
- TypeScript

## Pure Validation?

As a matter of principle, `V` doesn't modify the value being validated. All conversions and normalizations return a new object or array. For pure validation,

1. check if `validationResult.isSuccess() === true` and use the original value or
2. wrap validation rules with `V.check(...)`.

Conversions are always applied internally as in validation rule combinations latter rules may depend on conversions applied earlier. E.g. checking if a date is in future relies on the value actually being a Date.

## <a name="then">Validator Chaining</a>

All validators can be chained using `Validator.then(...allOf: Validator[])` function. Then-validators are only run for successful results with the converted value. Often occurring pattern is to first verify/convert the type and then run the rest of the validations, e.g. validating a prime number between 1 and 1000:

```typescript
V.toInteger().then(V.min(1), V.max(1000), V.assertTrue(isPrime));
```

## Combining Validators

`V` supports

- `allOf` - value must satisfy all the validators
  - validators are run in parallel and the results are combined
  - if conversion happens, all the validators must return the same value (deepEquals)
- `oneOf` - exactly one validator must match while others should return false
- `compositionOf` - validators are run one after another against the (current) converted value (a shortcut for [`Validator.then`](#then))

## <a name="object">V.object</a>

`V.object` allows defining hierarchical object models (see [Schema](#schema) about polymorphism). `ObjectModel` consists of

1. named properties as references to other validators,
2. rules defining what, if any, additional (unnamed) properties are allowed,
3. references to parent model(s),
4. local (non-inheritable) properties and
5. then validator for cross-property rules
6. local then for non-inheritable mapping

### Named Properties

An object may have any named property defined in a parent `properties`, it's own `properties` or `localProperties`, which in turn are not inherited.

A child model may extend the validation rules of any inherited properties. In such a case inherited property validators are executed first and, if success, the converted value is validated against child's property validators. A child may only further restrict parent's property rules.

```typescript
const vehicle = V.object({
  properties: {
    wheelCount: V.required(V.toInteger(), V.min(0)),
    ownerName: V.optional(V.string()),
  },
  localProperties: {
    type: 'Vehicle', // This rule is not inherited! A string or number value is a shortcur for V.hasValue(...).
  },
});

const bike = V.object({
  extends: vehicle,
  properties: {
    wheelCount: V.allOf(V.min(1), V.max(3)), // Extend parent rules
    sideBags: V.boolean(), // Add a property
  },
  localProperties: {
    type: 'Bike',
  },
});

const abike = { type: 'Bike', wheelCount: 2, sideBags: false };

(await bike.validate(abike)).isSuccess();
// true

(await vehicle.validate(abike)).getValue();
// ValidationError: [
//   {
//     "path": "$.type",
//     "type": "HasValue",
//     "invalidValue": "Bike",
//     "expectedValue": "Vehicle"
//   },
//   {
//     "path": "$.sideBags",
//     "type": "UnknownProperty"
//   }
// ]
```

### Optional Properties

Most validation rules require a non-null and non-undefined value. Optional properties need to be defined with `V.optional`:

```typescript
V.optional(V.integer());
```

### Additional Properties

Additional properties can be allowed or disallowed in general or by key pattern(s). Again a child model may further restrict parent's rules.

```typescript
enum SeatClass {
  BUSINESS = 'BUSINESS',
  ECONOMY = 'ECONOMY',
}
const aircraft = V.object({
  extends: vehicle,
  properties: {
    seatsByClass: V.object({
      additionalProperties: {
        keys: V.enum(SeatClass, 'SeatClass'),
        values: V.integer(),
      },
    }),
  },
});

(await aircraft.validate({ wheelCount: 3, seatsByClass: { BUSINESS: 10, ECONOMY: 100 } })).isSuccess();
// true
```

This kind of use case where an object holds a mapping from identifiers (like enum) to values is so common that there's even a shortcut for it: `V.properties`.

Note that `V.object` may explicitly _deny_ additional properties from it's submodels by setting `additionalProperties: false`, but this cannot block submodels from adding their own named properties.
Objects may have zero or more additional property validators which are invoked for all non-named properties.

All additional-property-validators consist of two parts, key and value validator. For a non-named property there must be at least one additional-property-validator
returning success for the key. The value validator is only run if the key validator is successful. Setting `additionalProperties: true` is simply a shortcut for a case
where both key and value validators allow anything; and `additionalProperties: false` is a shortcut for any key and a value validator that always returns `UnknownPropertyDenied` error.

### Then

An object may define inheritable cross-property rules with `ObjectModel.then` and non-inheritable validations or, e.g. mappings to corresponding a classes, using `localThen`. As `localProperties`, `localThen` is not inherited by extending validators.

`Then` validation rules are run after all the properties are validated successfully and `localThen`
is the last step in the validation chain. Inherited `then` rules are executed before child's own.

## <a name="array">Arrays</a>

Arrays are defined in terms of their element type:

```typescript
V.array(V.integer()).then(V.size(1, 100)); // An integer array of size 1 to 100
```

Note that basic validators do not handle polymoprhism even though they support inheritance. For example this definition would not validate elements against `bike` or `aircraft`:

```typescript
V.array(vehicle);
```

## <a name="schema">Schema</a>

Polymorphims requires that objects are somehow tagged with a type used to validate it. Since plain JSON/JavaScript objects do not have type information attached to them
one needs a _discriminator_ property or a function to infer object's type. This type is then used to actually validate the object.

Polymorphic schemas are recursive in nature: 1) a child needs to know it's parents so that it may extend them and 2) unless the type information is natively bound to
the object being validated, the parent needs to know it's children so that it may dispatch the validation to the correct child. As (direct) cyclic references are not possible, SchemaValidator is created with a callback function that supports referencing other models within the schema by name
even before they are defined:

1. An object may extend other models by simply referencing them by name.
2. Object properties can refer named models via `SchemaValidator.of('ModelName')`.

```typescript
const validatorType: ObjectValidator = V.object({
  properties: {
    type: V.string(),
  },
});
const schema = V.schema((schema: SchemaValidator) => ({
  discriminator: 'type', // or (value: any) => string function
  models: {
    Object: {
      extends: 'Validator', // Allows referencing parents by name before they are actually defined
      properties: {
        extends: V.optional(schema.of('Object')), // Allows referencing validators by name before they are actually defined
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
      extends: validatorType, // Allows direct inheritance
      properties: {
        items: schema.of('Validator'),
      },
    },
    Number: {
      extends: 'Validator',
    },
    Validator: validatorType, // Allows combining existing validators
  },
}));

// SchemaValidator is a Validator like any other
(await schema.validate({ type: 'ObjectNormalizer', property: 'value' })).isSuccess();
// true
(await schema.validate({ type: 'Object', property: 'value' })).isSuccess();
// false

// Validate specific subclass
(await schema.of('Object').validate({ type: 'ObjectNormalizer', property: 'value' })).isSuccess();
// true

// While Object is a subclass of Validator, it's not subclas of Number
(await schema.of('Number').validate({ type: 'Object' })).isSuccess();
// false

// Access raw Validator - Object validator doesn't know about ObjectNormalizer properties
(await schema.raw('Object').validate({ type: 'ObjectNormalizer', property: 'value' })).isSuccess();
// false

// Property based discriminator is validated as local property (i.e. not inherited)
(await schema.raw('Object').validate({ type: 'Object' })).isSuccess();
// true
(await schema.raw('Object').validate({ type: 'ObjectNormalizer' })).isSuccess();
// false
```

## Recursive Models

Recursive models have a cyclic reference(s) to itself. This is only case that `V` allows for mutability:

```typescript
// { head: 'first value', tail: { head: 'second value', tail: { head: 'last value' } } }
const list = V.object({
  properties: {
    head: V.any(),
    // Cannot reference itself here
  },
});
list.withProperty('tail', V.optional(list));
```

### Cyclic Data

By default `V` returns an error if same object is referenced multiple times in the input data structure.
While plain data cannot contain duplicates, as they require references, `V` allows these and even
cyclic data by setting `ValidatorOptions.allowCycles = true`. The converted object returned by
successful validation retains identical reference structure compared to the original.

## Map

`V` supports JavaScript Maps with a custom extension for JSON serialization.

```typescript
const keys = V.string();
const values = V.any();
const myMap = V.toMapType(keys, values); // keyValidator, valueValidator, jsonSafeMap?
const map = (
  await myMap.validate([
    ['key1', 'value1'],
    ['key2', 'value2'],
  ])
).getValue() as Map;

JSON.stringify(map);
// [["key1", "value1"], ["key2", "value2"]]

// Or without array conversion and JSON support:
V.mapType(keys, values, false);
```

## Validator Options

`V` supports contextual validation options which can be used to guide validation.
Options are passed to to `validate` function as optional second argument.

| Option                            | Description                                |
| --------------------------------- | ------------------------------------------ |
| ignoreUnknownProperties?: boolean | Unknown properties allowed by default.\*   |
| ignoreUnknownEnumValues?: boolean | Unknown enum values allowed by default     |
| warnLogger?: WarnLogger           | A reporter function for ignored Violations |
| group?: Group                     | A group used to activate validation rules  |
| allowCycles?: boolean             | Multiple references to same object allowed |

\*) Note that this option has no effect in cases where additional properties are explicitly denied.

```typescript
(await V.object({}).validate({ additionalProperty: 'OK' }, { ignoreUnknownProperties: true })).isSuccess();
// true

(await V.object({ additionalProperties: false }).validate({ additionalProperty: 'Not OK' }, { ignoreUnknownProperties: true })).isSuccess();
// false
```

## Custom Validators

There are four main ways of defining custom validators

```typescript
// 1) Any function accepting any value and returning a boolean:
V.assertTrue(...)


// 2) Any function accepting any value and returning value on success or throwing an error on failure:
V.map(...)


// 3) If a validator doesn't have any parameters, but needs access to path and context,
// it can be defined as a simple anonymous function:
V.fn((value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> => {...})


// 4) Full parametrizable validators extend Validator
class MyValidator extends Validator {
  // Validators should be immutable
  constructor(public readonly myParameter: any) {
    super();
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext) {
    if (isOK(value)) {
      return ctx.success(value);
    } else {
      return ctx.failure(new MyViolation(path, myParameter, value));
    }
  }
}
// Custom Violations may be used to convey additional parameters required for reporting the error
class MyViolation extends Violation {
  // Violations should be immutable
  constructor(path: Path, public readonly myParameter: any, invalidValue?: any) {
    super(path, 'MyError', invalidValue);
  }
}
```

## Built-In Validators

Unless otherwise stated, all validators require non-null and non-undefined values.

| V.                      | Arguments                                                        | Description                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| fn                      |  fn: ValidatorFn, type?: string                                  | Function reference as a validator. A short cut for extending Validator class.                                                              |
| ignore                  |                                                                  | Converts any input value to undefined.                                                                                                     |
| any                     |                                                                  | Accepts any value, including undefined and null.                                                                                           |
| check                   | ...allOf: Validator[]                                            | Runs all the validators and, if successful, returns the original value discarding any conversions.                                         |
| map                     | fn: MappingFn, error?: any                                       | Mapping function to convert a value. Catches and converts errors to Violations                                                             |
| optional                | type: Validator, ...allOf: Validator[]                           | Allows null and undefined. For other values, runs first the `type` validator and then `allOf` the rest validators.                         |
| required                | type: Validator, ...allOf: Validator[]                           | 1) Requires a non-null and non-undefined value, 2) runs `type` validator and 3) then `allOf` the rest validators.                          |
| string                  |                                                                  | Requires string or String.                                                                                                                 |
| toString                |                                                                  | Converts primitive values to (primitive) strings.                                                                                          |
| notNull                 |                                                                  | Requires non-null and non-undefined value.                                                                                                 |
| nullOrUndefined         |                                                                  | Requires null or undefined value.                                                                                                          |
| notEmpty                |                                                                  | Requires non-null, non-undefined and not empty. Works with anything having numeric `length` property, e.g. string or array.                |
| notBlank                |                                                                  | Requires non-null, non-undefined and not blank (whitespace only string) values.                                                            |
| uuid                    | version?: number                                                 | Uses `uuid-validate` package to validate input.                                                                                            |
| pattern                 |  pattern: string \| RegExp, flags?: string                       | Tests input against the pattern.                                                                                                           |
| toPattern               |                                                                  | Combines `toString` normalization with pattern validator.                                                                                  |
| boolean                 |                                                                  | Requires that input is primitive boolean.                                                                                                  |
| toBoolean               | truePattern?: RegExp, falsePattern?: RegExp                      | Converts strings and numbers to boolean. Patterns for true and false can be configured using regexp, defaults to true and false.           |
| number                  |                                                                  | Requires that input is either primitive number or Number and not NaN.                                                                      |
| toNumber                |                                                                  | Converts numeric strings to numbers.                                                                                                       |
| integer                 |                                                                  |  Requires that input is integer.                                                                                                           |
| toInteger               |                                                                  | Converts numeric strings to integers.                                                                                                      |
| min                     | min: number, inclusive = true                                    | Asserts that numeric input is greater than or equal (if inclusive = true) than `min`.                                                      |
| max                     | max: number, inclusive = true                                    | Asserts that numeric input is less than or equal (if inclusive = true) than `max`.                                                         |
| date                    |                                                                  | Reqruires a valid date. Converts string to Date.                                                                                           |
| enum                    | enumType: object, name: string                                   | Requires that the input is one of given enumType. Name of the enum provided for error message.                                             |
| assertTrue              | fn: AssertTrue, type: string = 'AssertTrue', path?: Path         | Requires that the input passes `fn`. Type can be provided for error messages and path to target a sub property                             |
| hasValue                | expectedValue: any                                               | Requires that the input matches `expectedValue`. Uses `node-deep-equal` library.                                                           |
| object                  | model: Model                                                     | Defines an [Object validator](#object) based on provided Model.                                                                            |
| toObject                | property: string                                                 | Converts a primitive value to object `{ property: 'value' }`. Undefined is passed on as such.                                              |
| schema                  | callback: (schema: SchemaValidator) => SchemaModel               | Defines a [SchemaValidator](#schema) for a discriminator and models.                                                                       |
| properties              | keys: Validator \| Validator[], values: Validator \| Validator[] | A shortcut for object with `additionalProperties`.                                                                                         |
| mapType                 | keys: Validator, values: Validator, jsonSafeMap: boolean = true  | [Map validator](#map)                                                                                                                      |
| toMapType(keys, values) | keys: Validator, values: Validator                               | Converts an array-of-arrays representation of a Map into a JsonSafeMap instance.                                                           |
| array                   | ...items: Validator[]                                            | [Array validator](#array)                                                                                                                  |
| toArray                 | items: Validator                                                 | Converts undefined to an empty array and non-arrays to single-valued arrays.                                                               |
| size                    | min: number, max: number                                         |  Asserts that input's numeric `length` property is between min and max (both inclusive).                                                   |
| allOf                   | ...validators: Validator[]                                       | Requires that all given validators match. Validators are run in parallel and in case they convert the input, all must provide same output. |
| oneOf                   | ...validators: Validator[]                                       | Requires that exactly one of the given validators match.                                                                                   |
| compositionOf           | ...validators: Validator[]                                       | Runs given the validators one after another, chaining the result.                                                                          |
| emptyToUndefined        |                                                                  | Converts null or empty string to undefined. Does not touch any other values.                                                               |
| emptyToNull             |                                                                  | Converts undefined or empty string to null. Does not touch any other values.                                                               |
| emptyTo                 | defaultValue: string                                             | Uses given `defaultValue` in place of null, undefined or empty string. Does not touch any other values.                                    |
| nullTo                  | defaultValue: string                                             | Uses given `defaultValue` in place of null. Does not touch any other values.                                                               |
| undefinedToNull         |                                                                  | Convets undefined to null. Does not touch any other values.                                                                                |
| if...elseif...else      | fn: AssertTrue, ...allOf: Validator[]                            | Configures validators (`allOf`) to be executed for cases where if/elseif AssertTrue fn returns true.                                       |
| whenGroup...otherwise   | group: GroupOrName, ...allOf: Validator[]                        | Defines validation rules (`allOf`) to be executed for given `ValidatorOptions.group`.                                                      |

## Violations

All `Violations` have following propertie in common:

| Property           | Description                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| path: Path         | Path is a wrapper for JSONPaths denoting violating element.                                                                                                                                          |
| type: string       | Type of error, e.g. NotNull.                                                                                                                                                                         |
| invalidValue?: any | The violating value. This is only used for primitive values. Note: This may not be the original value. In case of validator chaining it's the (converted) value passed on by the previous validator. |

`Violation` class can be directly used to report any violation that doesn't require extra parameters.

### Built-in Violations

| Class                  | Type                  | Properties                       | Description                                                                         |
| ---------------------- | --------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| TypeMismatch           | TypeMismatch          | expected: string                 | Type mismatch: `expected` is a description of expected type.                        |
| EnumMismatch           | EnumMismatch          | enumType: string                 | Invalid enum value: `enumType` is the name of the expected enumeration.             |
| ErrorViolation         | Error                 | error: any                       | An unspecified Error that was thrown and caught.                                    |
| HasValueViolation      | HasValue              | expectedValue: any               | Input does not match (deepEqual) expectedValue.                                     |
| PatternViolationi      | Pattern               | pattern: string                  | Input does not match the regular expression (pattern).                              |
| OneOfMismatch          | OneOf                 | matches: number                  | Input matches 0 or >= 2 of the configured validators.                               |
| MaxViolation           | Max                   | max: number, inclusive: boolean  | Input is greater-than or greater-than-or-equal, if `inclusive=true`, than `max`.    |
| MinViolation           | Min                   |  min: number, inclusive: boolean | Input is less-than or less-than-or-equal if inclusive=true than `min`.              |
| SizeViolation          | Size                  | min: number, max: number         | Input `length` (required numeric property) is less-than `min` or grater-than `max`. |
| Violation              | NotNull               |                                  | Input is `null` or `undefined`.                                                     |
| Violation              | NotEmpty              |                                  | Input is `null`, `undefined` or empty (i.e. input.length === 0).                    |
| Violation              | NotBlank              |                                  | Input (string) is `null`, `undefined` or empty when trimmed.                        |
| Violation              | UnknownProperty       |                                  | Additional property that is denied by default (see ignoreUnknownProperties).        |
| Violation              | UnknownPropertyDenied |                                  | Explicitly denied additional property.                                              |
| DiscriminatorViolation | Discriminator         | expectedOneOf: string[]          | Invalid discriminator value: `expectedOneOf` is a list of known types.              |

## Roadmap

### Before 1.0 Release

- <s>Remove jsonpath dependency as it doesn't work with webpack</s>
- <s>Detect cyclic input</s>
- <s>Use in real-life project. While `V` was originally built as a part of a critical large-scale real-life project, this library isn't an exact copy of that...</s>
- Add JSDoc

### Later

- TypeScript type inference from V rules?
- OpenAPI documentation generation from V rules?
