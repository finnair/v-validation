![CI](https://github.com/finnair/v-validation/workflows/CI/badge.svg?branch=master)
[![codecov](https://codecov.io/gh/finnair/v-validation/branch/master/graph/badge.svg)](https://codecov.io/gh/finnair/v-validation)
[![npm version](https://badge.fury.io/js/%40finnair%2Fv-validation.svg)](https://badge.fury.io/js/%40finnair%2Fv-validation)

# v-validation

V stands for Validation.

`V` rules define how input is to be converted, normalized and validated to
conform to the expected model.

## Getting Started

Install v-validation using [`yarn`](https://yarnpkg.com):

```bash
yarn add @finnair/v-validation
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/v-validation
```

## Major Changes in Version 8

Drop (partial) support for cyclic data: There are cases where validation result (i.e. converted object) simply cannot retain cycles, e.g. the same object being validated with `V.oneOf` in different branches of the validator tree and resulting in different versions of the object. The rare use-cases for cyclic data simply do not justify the added complexity. 

There is no special cycle detection, but if cyclic data is validated, the result will be an ErrorViolation due to "Maximum call stack size exceeded".

The newly improved `V.oneOf` violations are further improved. Instead of `ValidationResult[]` the result is simplified to `OneOfResult[]` of either successes of error violations: `{ success: true } | { violations: Violation[] }`.

## Major Changes in Version 7
### New Features
* **Typing**: Validators may have a specific input and especially output type.
* `V.objectType()` builder can be used to build an ObjectValidator with inferred type.
* Validator (output/result) type can be acquired with `VType<typeof validator>`. 
* Direct, chainable support for most used "next" validation rules, e.g. `V.number().min(1).max(2)`: 
  * `V.string()` supports `notEmpty`, `notBlank`, `pattern` and `size`,
  * `V.number()` supports `min`, `max` and `between`.
* Use `Validator#getValid(input)` to get valid a valid value or an exception directly.
* New strictly typed "optional" validators: 
  * `V.optionalStrict<T>(validator: Validator<T>)`: `undefined | T` - `V.optional` allows also null,
  * `V.nullable<T>(validator: Validator<T>)`: `null | T`,
  * `V.optionalProperties<K, V>(keys: Validator<K>, values: Validator<V>)`: `Partial<Record<Key, Value>>`.
* `JsonBigInt`: `BigInt` wrapper with `toJSON()` serialization as `string`.

### Breaking changes: 
* `V.string()` and some other validators do not support String object as input any more.
* `isString()` function doesn't support String object any more.
* `V.number()` does not support Number object as input any more.
* `V.allOf()` requires that all results match.
* Validators that accept multiple subvalidators (`V.optional`, `V.required`, `V.check`, `V.if`, `V.whenGroup`, `V.json` and `ObjectModel#next`) are combined using `V.compositionOf` instead of `V.allOf` as composition makes more sense in general. However, if there are multiple parents with next validators, those are still combined with `V.allOf` as they are not aware of each other.
* `V.if` does not support "fall through" any more but rejects with NoMatchingCondition if no condition matches. Use `.else(V.any())` if "fall through" is desirable.
* `V.whenGroup` does not support "fall through" any more but rejects with NoMatchingGroup if no condition matches. Use `.otherwise(V.any())` if "fall through" is desirable.
* More straightforward internal architecture:
  * internal Validator#validatePath returns now a Promise of valid value or reject of Violation(s) directly instead of ValidationResult,
  * custom SyncPromise is removed in favor of Promise.resolve and reject,
  * `ValidatorContext` no longer has `success`, `successPromise`, `failurePromise` and `promise` functions - use `Promise.resolve(value)` or `Promise.reject(new Violation(...))` with single violation or an array of violations. 
* `V.mapType`, `V.toMapType` and `V.setType` now require `jsonSafe` boolean parameter for typing: JsonMap/JsonSet (true) or plain Map/Set (false).

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
const percentageValidator = V.integer().min(0).max(100));
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

Optional `Vmoment` (`@finnair/v-validation-moment`) extension uses custom Moment extensions to support full JSON roundtrip with strict validation. *NOTE: As Moment is now a legacy project, we recommend using Luxon with `@finnair/v-validation-luxon` instead.*

```typescript
const dateMoment = (await Vmoment.date().validate('2020-03-05')).getValue();
// moment('2020-03-05', 'YYYY-MM-DD', true)

JSON.stringify(dateMoment);
// "2020-03-05"
```

Optional `Vluxon` (`@finnair/v-validation-luxon`) extension uses custom DateTime wrapper to support full JSON roundtrip with strict validation:

```typescript
const luxonDate: LocalDateLuxon = await Vluxon.localDate().getValid('2020-03-05');

JSON.stringify(luxonDate);
// "2020-03-05"
```

Validators are effectively immutable objects/functions that can be combined to form more complex models.

```typescript
const personValidator = V.object({
  properties: {
    name: V.required(V.string(), V.notBlank()), // Another way of saying V.string().next(V.notBlank())
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
// 1) VALIDATION RULES
// A custom validator to check that password1 === password2 with failures targeted at password2 field

// Use V.objectType() to build typed ObjectValidator. The inferred type is accesseible with Vtype<typeof UserRegistrationValidator>
const UserRegistrationValidator = V.objectType()
  .properties({
    password1: V.string().next(V.pattern(/[A-Z]/), V.pattern(/[a-z]/), V.pattern(/[0-9]/), V.size(8, 32)),
    password2: V.string(),
  })
  .next(V.fn(async (value, path: Path, ctx: ValidationContext) => {
    if (value.password1 !== value.password2) {
      return Promise.reject(new Violation(path.property('password2'), 'PasswordsMustMatch'));
    }
    return Promise.resolve(value);
  }))
  .build();

// 2) Derived type
type UserRegistration = VType<typeof UserRegistrationValidator>;

// 3) INPUT VALIDATION
// Valid object
(await UserRegistrationValidator.validate({ password1: 'foo', password2: 'foo' })).getValue() satisfies UserRegistration;

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
  - Basic validators are internally synchronous for better performance
- Fluent syntax
- Composability
- Supports object oriented inheritance and polymorphism where as
  - OpenAPI's inheritance and polymorpism mechanism is problematic if not broken alltogether
  - The latest draft of [JSON Schema (2019-09) doesn't support inheritance](https://github.com/json-schema-org/json-schema-org.github.io/issues/148)
- Effortless custom extension
  - All non-trivial use cases require some custom validation logic
  - Custom validators can be defined as simple functions
  - No need to register custom validators
- All the validators are effectively immutable
- Supports recursive types/validators (e.g. linked list)
- TypeScript native implementation
- Supports type inference that can be mixed with better readable custom types/interfaces

## <a name="pure-validation">Pure Validation</a>

As a matter of principle, `V` doesn't modify the value being validated. All conversions and normalizations return a new object or array. For pure validation,

1. check if `validationResult.isSuccess() === true` and use the original value or
2. wrap validation rules with `V.check(...)`.

Conversions are always applied internally as in validation rule combinations latter rules may depend on conversions applied earlier. E.g. checking if a date is in future relies on the value actually being a Date.

## <a name="next">Validator Chaining</a>

All validators can be chained using `Validator.next(...compositionOf: Validator[])` function. Next-validators are only run for successful results with the converted value. Often occurring pattern is to first verify/convert the type and then run the rest of the validations, e.g. validating a prime number between 1 and 1000:

```typescript
V.toInteger().next(V.min(1), V.max(1000), V.assertTrue(isPrime));
```
### Validator Chaining in Version >= 7

Version 7 offers shortcuts for most common validator chaining cases: 
```typescript
V.integer()
  .min(1)
  .max(1000)
  .between(1, 1000);

V.string()
  .notEmpty()
  .notBlank()
  .pattern(/.+/)
  .size(1, 10)
```
## Typing in Version >= 7

All built-in validators (except `V.schema`) have input and output types. Typed ObjectValidators can be built with `V.objectType()`.
Since inferred types tend to get quite long and hard to read, you can also combine them with hand-written types.

### Validator Type
Use `VType<typeof validator>` to get the result type of `validator`.

Use `VInheritableType<typeof objectValidator> to get the inheritable type of `objectValidator: ObjectValidator<LocalType, InheritableType>`.

LocalType and InheritableType will only differ when `localProperties` or `localNext` are used. The most obvious use case for this is a class hierarcy with discriminator property to denote a specific type.

*NOTE: `V.schema` doesn't yet support typing.*

### Type Guards

When using custom interfaces it's good to verify that the validator is in sync with the interface. The 
challenge is that TypeScript's generic `extends` only verifies type-compatibility and optional
properties do not count unless they are of conflicting type. For type/validator compatibility
we need to also consider optional properties and nested structure. For this there are a couple of helper
types:

1. `ComparableType<T>` converts all optional properties to mandatory `Optional<T>` recursively.
2. `EqualTypes<A, B>` verifies that `A extends B` and `B extends A` and resolves to `true` if there's no error.

These can be used with `assertType` to verify type equality:
```typescript
interface MyInterface {
  //...
}
const myInterfaceValidator = V.objectType()
  .properties({
    //...
  })
  .build();

// Use assertType function with EqualTypes and ComparableType to verify that myInterfaceValidator type is equal to MyInterface
assertType<EqualTypes<ComparableType<VType<typeof myInterfaceValidator>>, ComparableType<MyInterface>>>(true);
```
Why `assertType`? EqualTypes can also be used directly, but it needs to be tied to something (e.g. `type verified = Equaltypes<...>`),
but that something may then cause "is declared but never used" -error.

## Combining Validators

`V` supports

- All validators have [`Validator.next`](#next) function to chain validator rules. 
- `compositionOf` - validators are run one after another against the (current) converted value (a shortcut for [`Validator.next`](#next)).
- `allOf` - the input value must satisfy all the validators. Validators are run in parallel and must return the same value (deepEquals).
- `anyOf` - at least one of the validators must match.
- `oneOf` - exactly one validator must match while others should return false.

## <a name="object">V.object</a>

`V.object` allows defining hierarchical object models (see [Schema](#schema) about polymorphism). `ObjectModel` consists of

1. named properties as references to other validators,
2. rules defining what, if any, additional (unnamed) properties are allowed,
3. references to parent model(s),
4. local (non-inheritable) properties,
5. next validator for cross-property rules and
6. local next for non-inheritable mapping.

Note that `V.object` is essentially deprecated. Please use `V.objectType` to create properly typed object validators. 

### Named Properties

An object may have any named property defined in a parent `properties`, it's own `properties` or `localProperties`, which in turn are not inherited.

A child model may extend the validation rules of any inherited properties. In such a case inherited property validators are executed first and, if success, the converted value is validated against child's property validators. A child may only further restrict parent's property rules.

```typescript
  const vehicle = V.objectType()
  .properties({
    wheelCount: V.required(V.toInteger(), V.min(0)),
    ownerName: V.optionalStrict(V.string()),
  })
  .localProperties({
    // This rule is not inherited! "as const" for 'Vehicle' instead of string type
    type: V.hasValue('Vehicle' as const), 
  })
  .build();
  
  const bike = V.objectType()
  .extends(vehicle)
  .properties({
    wheelCount: V.allOf(V.min(1), V.max(3)), // Extend parent rules
    sideBags: V.boolean(), // Add a property
  })
  .localProperties({
    type: V.hasValue<'Bike'>('Bike'), // Another way of enforcing literal type
  })
  .build();
  
  const abike1 = { type: 'Bike', wheelCount: 2, sideBags: false } satisfies VType<typeof bike>;  
  (await bike.validate(abike1)).isSuccess();
  // true
 
  const abike2 = { type: 'Bike', wheelCount: 4, sideBags: false } satisfies VType<typeof bike>;
  (await bike.validate(abike2)).getValue();
  // ValidationError: [
  //   {
  //     "path": "$.wheelCount",
  //     "type": "Max",
  //     "invalidValue": 4,
  //     "max": 3,
  //     "inclusive": true
  //   }
  // ]
  
  (await vehicle.validate(abike1)).getValue();
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

### Next

An object may define inheritable cross-property rules with `ObjectModel.next` and non-inheritable validations or, e.g. mappings to corresponding a classes, using `localNext`. As `localProperties`, `localNext` is not inherited by extending validators.

`Next` validation rules are run after all the properties are validated successfully and `localNext`
is the last step in the validation chain. Inherited `next` rules are executed before child's own.

## <a name="array">Arrays</a>

Arrays are defined in terms of their element type:

```typescript
V.array(V.integer()).next(V.size(1, 100)); // An integer array of size 1 to 100
```

Note that basic validators do not handle polymoprhism even though they support inheritance. For example this definition would not validate elements against `bike` or `aircraft`:

```typescript
V.array(vehicle);
```

## <a name="schema">Schema</a>

Polymorphims requires that objects are somehow tagged with a type used to validate it. Since plain JSON/JavaScript objects do not have type information attached to them
one needs a _discriminator_ property or a function to infer object's type. This type is then used to actually validate the object.

Polymorphic schemas are recursive in nature: 1) a child needs to know it's parents so that it may extend them and 2) unless the type information is natively bound to
the object being validated, the parent needs to know it's children so that it may dispatch the validation to the correct child validator. As (direct) cyclic references are not possible, SchemaValidator is created with a callback function that supports referencing other models within the schema by name even before they are defined:

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

Recursive model/type has a cyclic reference to itself. While a model cannot reference itself before it's declared, 
we can wrap the call within a validator function. Type inference also cannot infer type from itself so we need 
to define the target interface separately.

```typescript
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

// Verify that validator matches RecursiveModel
assertType<EqualTypes<ComparableType<VType<typeof validator>>, ComparableType<RecursiveModel>>>(true);
```

Another option is to use [`V.schema`](#schema).

_NOTE, however that actually cyclic data is not supported._

## Map

`V` supports JavaScript Maps with a custom extension for JSON serialization.

```typescript
const keys = V.string();
const values = V.string();
const myMap = V.toMapType(keys, values, true); // keyValidator, valueValidator, jsonSafeMap
const map = await myMap.getValid([['key1', 'value1'], ['key2', 'value2']]) satisfies JsonMap<string, string>;

JSON.stringify(map);
// [["key1", "value1"], ["key2", "value2"]]

// Or plain Map without JSON serialization support:
V.mapType(keys, values, false);
```

## Set

`V` supports JavaScript Sets with a custom extension for JSON serialization.

```typescript
const values = V.string();
const setValidator = V.setType(values, true); // valueValidator, jsonSafeSet
const set = await setValidator.getValid(['value1', 'value2']) satisfies JsonSet<string>;

JSON.stringify(set);
// ["value1", "value2"]

// Or plain Set without JSON serialization support:
V.setType(values, false); // Validator<Set<string>>
```

## Validator Options

`V` supports contextual validation options which can be used to guide validation.
Options are passed to to `validate` function as optional second argument.

| Option                            | Description                                |
| --------------------------------- | ------------------------------------------ |
| ignoreUnknownProperties?: boolean | Unknown properties allowed by default\*    |
| ignoreUnknownEnumValues?: boolean | Unknown enum values allowed by default     |
| warnLogger?: WarnLogger           | A reporter function for ignored Violations |
| group?: Group                     | A group used to activate validation rules  |

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
// it can be defined as a simple anonymous function
V.fn((value: any, path: Path, ctx: ValidationContext): PromiseLike<ValidationResult> => {
  // return either successful or rejected Promise or throw an error
})


// 4) Full parametrizable validators extend Validator
class MyValidator extends Validator {
  // Validators should be immutable
  constructor(public readonly myParameter: any) {
    super();
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext) {
    if (isOK(value)) {
      return Promise.resolve(value);
    } else {
      return Promise.reject(new MyViolation(path, myParameter, value));
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

| V.                      | Arguments                                                        | Description                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| fn                      | fn: ValidatorFn, type?: string                                   | Function reference as a validator. A short cut for extending Validator class.                                                             |
| ignore                  |                                                                  | Converts any input value to undefined.                                                                                                    |
| any                     |                                                                  | Accepts any value, including undefined and null.                                                                                          |
| map                     | fn: MappingFn, error?: any                                       | Mapping function to convert a value. Catches and converts errors to Violations                                                            |
| compositionOf           | ...validators: Validator[]                                       | Runs given the validators one after another, chaining the result.                                                                         |
| check                   | ...validators: Validator[]                                       | Runs all the validators as `compositionOf` and, if successful, returns the original value discarding any conversions.                     |
| required                | ...validators: Validator[]                                       | A non-null and non-undefined valid `compositionOf` of validators.                                                                         |
| optional                | ...validators: Validator[]                                       | Null, undefined or valid `compositionOf` validators.                                                                                      |
| optionalStrict          | ...validators: Validator[]                                       | Undefined or valid `compositionOf` validators.                                                                                            |
| nullable                | ...validators: Validator[]                                       | Null or valid `compositionOf` validators.                                                                                                 |
| string                  |                                                                  | Requires string or String.                                                                                                                |
| toString                |                                                                  | Converts primitive values to (primitive) strings.                                                                                         |
| notNull                 |                                                                  | Requires non-null and non-undefined value.                                                                                                |
| nullOrUndefined         |                                                                  | Requires null or undefined value.                                                                                                         |
| notEmpty                |                                                                  | Requires non-null, non-undefined and not empty. Works with anything having numeric `length` property, e.g. string or array.               |
| notBlank                |                                                                  | Requires non-null, non-undefined and not blank (whitespace only string) values.                                                           |
| uuid                    | version?: number                                                 | Uses `uuid` package to validate input.                                                                                                    |
| pattern                 | pattern: string \| RegExp, flags?: string                        | Tests input against the pattern.                                                                                                          |
| toPattern               |                                                                  | Combines `toString` normalization with pattern validator.                                                                                 |
| boolean                 |                                                                  | Requires that input is primitive boolean.                                                                                                 |
| toBoolean               | truePattern?: RegExp, falsePattern?: RegExp                      | Converts strings and numbers to boolean. Patterns for true and false can be configured using regexp, defaults to true and false.          |
| number                  |                                                                  | Requires that input is either primitive number or Number and not NaN.                                                                     |
| toNumber                |                                                                  | Converts numeric strings to numbers.                                                                                                      |
| integer                 |                                                                  | Requires that input is integer.                                                                                                           |
| toInteger               |                                                                  | Converts numeric strings to integers.                                                                                                     |
| min                     | min: number, inclusive = true                                    | Asserts that numeric input is greater than or equal (if inclusive = true) than `min`.                                                     |
| max                     | max: number, inclusive = true                                    | Asserts that numeric input is less than or equal (if inclusive = true) than `max`.                                                        |
| jsonBigInt              |                                                                  | Converts bigints, integer numbers and strings to `JsonBigInt` wrapper for `BigInt` with `toJSON()` serialization as string.               |
| date                    |                                                                  | Reqruires a valid date. Converts string to Date.                                                                                          |
| enum                    | enumType: object, name: string                                   | Requires that the input is one of given enumType. Name of the enum provided for error message.                                            |
| assertTrue              | fn: AssertTrue, type: string = 'AssertTrue', path?: Path         | Requires that the input passes `fn`. Type can be provided for error messages and path to target a sub property                            |
| hasValue                | expectedValue: any                                               | Requires that the input matches `expectedValue`. Uses `node-deep-equal` library.                                                          |
| object                  | model: Model                                                     | Defines an [Object validator](#object) based on provided Model.                                                                           |
| toObject                | property: string                                                 | Converts a primitive value to object `{ property: 'value' }`. Undefined is passed on as such.                                             |
| schema                  | callback: (schema: SchemaValidator) => SchemaModel               | Defines a [SchemaValidator](#schema) for a discriminator and models.                                                                      |
| properties              | keys: Validator<Keys>, values: Validator<Values>                 | A shortcut for object with `additionalProperties`. Type: Record<Keys, Values>                                                             |
| optionalProperties      | keys: Validator<Keys>, values: Validator<Values>                 | A shortcut for object with `additionalProperties`. Type: Partial<Record<Keys, Values>>                                                    |
| mapType                 | keys: Validator, values: Validator, jsonSafeMap: boolean         | [Map validator](#map). JSON safe map (JsonMap) serializes into an array of [key, value]-arrays.                                           |
| toMapType(keys, values) | keys: Validator, values: Validator                               | Converts an array-of-arrays representation of a Map into a JsonMap instance.                                                              |
| setType                 | values: Validator, jsonSafeMap: boolean                          | [Set validator](#set). JSON safe set (JsonSet) serializes into an array of values.                                                        |
| array                   | ...items: Validator[]                                            | [Array validator](#array)                                                                                                                 |
| toArray                 | items: Validator                                                 | Converts undefined to an empty array and non-arrays to single-valued arrays.                                                              |
| size                    | min: number, max: number                                         | Asserts that input's numeric `length` property is between min and max (both inclusive).                                                   |
| allOf                   | ...validators: Validator[]                                       | Requires that all given validators match. Validators are run in parallel and must provide the same output.                                |
| anyOf                   | ...validators: Validator[]                                       | Requires minimum one of given validators matches. Validators are run in parallel and in case of failure, all violations will be returned. |
| oneOf                   | ...validators: Validator[]                                       | Requires that exactly one of the given validators match.                                                                                  |
| emptyToUndefined        |                                                                  | Converts null or empty string to undefined. Does not touch any other values.                                                              |
| emptyToNull             |                                                                  | Converts undefined or empty string to null. Does not touch any other values.                                                              |
| emptyTo                 | defaultValue: string                                             | Uses given `defaultValue` in place of null, undefined or empty string. Does not touch any other values.                                   |
| nullTo                  | defaultValue: string                                             | Uses given `defaultValue` in place of null. Does not touch any other values.                                                              |
| undefinedToNull         |                                                                  | Convets undefined to null. Does not touch any other values.                                                                               |
| if...elseif...else      | fn: AssertTrue, ...validators: Validator[]                       | Configures validators (`compositionOf`) to be executed for cases where if/elseif AssertTrue fn returns true.                              |
| whenGroup...otherwise   | group: GroupOrName, ...validators: Validator[]                   | Defines validation rules (`compositionOf`) to be executed for given `ValidatorOptions.group`.                                             |
| json                    | ...validators: Validator[]                                       | Parse JSON input and validate it against given validators.                                                                                |

## Violations

All `Violations` have following propertie in common:

| Property           | Description                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| path: Path         | Path is a wrapper for JSONPaths denoting violating element.                                                                                                                                          |
| type: string       | Type of error, e.g. NotNull.                                                                                                                                                                         |
| invalidValue?: any | The violating value. This is only used for primitive values. Note: This may not be the original value. In case of validator chaining it's the (converted) value passed on by the previous validator. |

`Violation` class can be directly used to report any violation that doesn't require extra parameters.

### Built-in Violations

| Class                  | Type                  | Properties                      | Description                                                                         |
| ---------------------- | --------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| TypeMismatch           | TypeMismatch          | expected: string                | Type mismatch: `expected` is a description of expected type.                        |
| EnumMismatch           | EnumMismatch          | enumType: string                | Invalid enum value: `enumType` is the name of the expected enumeration.             |
| ErrorViolation         | Error                 | error: any                      | An unspecified Error that was thrown and caught.                                    |
| HasValueViolation      | HasValue              | expectedValue: any              | Input does not match (deepEqual) expectedValue.                                     |
| PatternViolationi      | Pattern               | pattern: string                 | Input does not match the regular expression (pattern).                              |
| OneOfMismatch          | OneOf                 | matches: number                 | Input matches 0 or >= 2 of the configured validators.                               |
| MaxViolation           | Max                   | max: number, inclusive: boolean | Input is greater-than or greater-than-or-equal, if `inclusive=true`, than `max`.    |
| MinViolation           | Min                   | min: number, inclusive: boolean | Input is less-than or less-than-or-equal if inclusive=true than `min`.              |
| SizeViolation          | Size                  | min: number, max: number        | Input `length` (required numeric property) is less-than `min` or grater-than `max`. |
| Violation              | NotNull               |                                 | Input is `null` or `undefined`.                                                     |
| Violation              | NotEmpty              |                                 | Input is `null`, `undefined` or empty (i.e. input.length === 0).                    |
| Violation              | NotBlank              |                                 | Input (string) is `null`, `undefined` or empty when trimmed.                        |
| Violation              | UnknownProperty       |                                 | Additional property that is denied by default (see ignoreUnknownProperties).        |
| Violation              | UnknownPropertyDenied |                                 | Explicitly denied additional property.                                              |
| DiscriminatorViolation | Discriminator         | expectedOneOf: string[]         | Invalid discriminator value: `expectedOneOf` is a list of known types.              |
