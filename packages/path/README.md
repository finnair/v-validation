# Path

`@finnair/path` contains partly `JsonPath` compatible path utilities:

- `Path` - concrete JSON paths used to locate, read or write a of an object.
- `PathMatcher` - a JsonPath like query processor.
- `Projection` - PathMatcher based include/exclude mapper for providing partial results from e.g. an API.

Parsers for Path and PathMatcher are available in a separate package [`@finnair/path-parser`](../path-parser/README.md).

## Getting Started

Install v-validation using [`yarn`](https://yarnpkg.com):

```bash
yarn add @finnair/path
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/path
```

## New in Version 13

Paths, PathMatchers and Projection follow JSON types consistently, Projection is considerably faster, and `jsonClone` matches `JSON.stringify` more closely.

### Path

* BREAKING CHANGE: `get`, `set` and `unset` follow JSON types: string components access only (non-array) objects and numeric components only arrays. `get` returns `undefined` and `unset` does nothing on a type mismatch. `set` replaces any value along the path that cannot hold the next component (e.g. an array where an object is needed) instead of writing an index into an object or a property into an array. Use the return value of `set`, as the root may be replaced too.
* BREAKING CHANGE: `equals` and `startsWith` compare components strictly, e.g. `Path.of('a', 0)` and `Path.of('a', '0')` are different paths.
* `get`, `set` and `unset` handle `null` like other primitive values instead of throwing: `set` replaces it with a new object or array.
* Fixed `unset` deleting a property of the wrong object when an intermediate value was missing or a primitive.

### PathMatcher

* BREAKING CHANGE: PathMatchers follow JSON types. Property matchers (`.name`, `["name"]` and string components of a union) match only properties of (non-array) objects, and index matchers (`[0]`, `[*]` and numeric components of a union) match only array elements. Earlier e.g. `$.array.length` and `$.array["0"]` matched arrays.
* BREAKING CHANGE: `.*` returns array elements with numeric indexes and no other properties of an array.
* BREAKING CHANGE: `match`, `prefixMatch` and `partialMatch` are type-strict too, e.g. `PathMatcher.of('1')` doesn't match `Path.of(1)`.
* BREAKING CHANGE: Property matchers match the same properties as `.*`, i.e. those listed by `for..in`: own and inherited enumerable properties. Earlier they matched only own properties, including non-enumerable ones.
* Root matcher (`$`) finds the root also when it's an object or an array, and matchers handle `null` values instead of throwing.
* `PathMatcher.expressions` is public (read-only).

### Projection

* BREAKING CHANGE: Projection keeps arrays as arrays, as it uses PathMatchers that follow JSON types. Earlier e.g. `$.array.*` turned an array into an object.
* BREAKING CHANGE: `always` paths are read from the JSON clone of the input like includes: values are converted to JSON and the `replacer` is applied. The output doesn't share objects with the input anymore, and Projection never modifies its input.
* BREAKING CHANGE: Projection converts to JSON only the parts of the input that may end up in the result (see [Using Projection](#using-projection)): `toJSON`, the `replacer` and the `BigInt` check are not applied to parts outside includes or inside excludes.
* BREAKING CHANGE: Output keys are in the order of the input, not in the order of includes and always paths.
* BREAKING CHANGE: Objects and arrays that are not included themselves are in the output only if something below them is, e.g. include `$.a.b` with exclude `$.a.b` results in `{}`, not `{ "a": {} }`. Included objects and arrays are kept even if excludes empty them.
* Root matcher (`$`) is supported in includes, excludes and always paths. Excluding the root results in `null`.
* Projection accepts any input that has a JSON value, not only objects. A primitive input results in the value itself if it's included, and otherwise in `null`.
* `Projection.match` matches also ancestors of always paths, i.e. all paths of which some part may be in the output.
* Projecting a small part of a large input, or excluding large parts of it, is many times faster.

### JSON Clone

These apply to Projection as well.

* BREAKING CHANGE: Like `JSON.stringify`, only own enumerable properties are cloned. Earlier inherited enumerable properties were included.
* BREAKING CHANGE: `NaN` and `Infinity` are converted to `null`, boxed primitives (e.g. `new String('a')`) are unwrapped, `toJSON` is called only on objects and BigInts, and a circular structure throws a `TypeError` instead of overflowing the stack.
* BREAKING CHANGE: Input that has no JSON representation (`undefined`, a function or a symbol) throws a `TypeError`, where `JSON.stringify` returns `undefined`. Earlier `jsonClone` returned `undefined`.

## New in Version 9

* BREAKING CHANGE: Projection will always return JSON-compliant clone of the input, not the input itself even if there are no include/exclude/always
* Projection supports also "always" paths to specify which paths should be always included regardless of includes and excludes
* Projection supports a replacer function as specified by `JSON.stringify`
* New `jsonClone` method to create a JSON compliant clone of the input

## Use Case Examples

### Validation 

Path can be used to point a location of invalid value (see [`v-validation`](../core/README.md). Path's immutability and fluent API makes it easy and safe to use.

### Diff, Versioning & Patching

Analyze changes and trigger logic based on what has changed (see [`diff`](../diff/README.md).

### Include/Exclude Projection

While GraphQL is all about projections, something similar can also be implemented in a REST API with include, exclude and always parameters. `Projection` and `parsePathMatcher` function provides means to process results safely based on such a user input. This is, of course, very simplified projection compared to what GraphQL has to offer, but it's also... well, simpler.

Projection can also be used to optimize fetching expensive relations as it also supports matching Paths and not just mapping actual values:

```typescript
const resource = fetchResult(request);
const projection = Projection.of(
  parseIncludes(request), 
  parseExcludes(request), 
  [PathMatcher.of('id')], // id is always included
  replacer // optional JSON.stringify replacer function
);
const result = {
  ...resource,
  veryExpensiveRelation: projection.match(Path.of('veryExpensiveRelation')) 
    ? fetchVeryExpensiveRelation(resource) 
    : undefined,
};
return projection.map(result);
```

NOTE: Projection cannot be used to access anything that is not visible to JSON. Input is always converted to JSON compliant model before any processing. 

### JSON Clone

As safe include/exclude requires JSON conversion, this library also contains a handy `jsonClone` method that can be used to e.g. normalize input. This method results in same as `JSON.parse(JSON.stringify(input))` but without actual serialization and parsing involved. It respects `toJSON` methods and supports `replacer` function. Unlike `JSON.stringify`, it throws a `TypeError` instead of returning `undefined` when the input has no JSON representation (`undefined`, a function or a symbol), as that is most likely a bug.

## Using Path

`Path` is an immutable representation of a concrete JsonPath, consisting of strings (properties) and numbers (indexes).

```typescript
import { Path } from '@finnair/path';

// Constructing Paths
Path.of(); // Root object $ - also Path.ROOT
Path.of('array', 1, 'property'); // $.array[1].property

// Constructing with fluent syntax
Path.of().property('array').index(0); // $.array[0]

// Concatenating Paths
Path.of('parent').concat(Path.of('child', 'name')); // $.parent.child.name
// Or the other way around
Path.of('child', 'name').connectTo(Path.of('parent')); // $.parent.child.name

// Accessing Path components
Array.from(Path.of(1, 2, 3)); // [1, 2, 3] - Path is an Iterable
Path.of('parent', 'child').length; // 2
Path.of('array', 3).componentAt(0); // 'array'
Path.of('array', 3).componentAt(1); // 3

// Getting Path value from an object
Path.of('array', 1).get({ array: [1, 2, 3] }); // 2
// ...properties are accessible only on objects and indexes only on arrays
Path.of('array', 'length').get({ array: [1, 2, 3] }); // undefined
// ...inherited properties and getters are readable, like for validators, except inherited __proto__
Path.of('name').get(Object.create({ name: 'inherited' })); // 'inherited'

// Setting Path value of an object
Path.of('array', 1).set({}, 'foo'); // { array: [undefined, 'foo'] }
Path.of('parent', 'child', 'name').set({}, 'child name'); // { parent: { child: { name: 'child name' } } }
// ...values that cannot hold the next component are replaced
Path.of('parent', 'name').set({ parent: null }, 'name'); // { parent: { name: 'name' } }
Path.of('array', 'name').set({ array: [] }, 'name'); // { array: { name: 'name' } }
// ...including the root, so always use the return value
Path.of(0).set({}, 'first'); // ['first']
// ...only own properties are written: inherited values are shadowed and objects reached through a prototype are never modified
Path.of('name').set(Object.create({ name: 'inherited' }), 'own'); // { name: 'own' } with the prototype unchanged

// Unsetting Path value of an object
Path.of('array', 1).unset({ array: [1, 2, 3] }); // { array: [1, undefined, 3] }
// ...but unsetting a value doesn't create intermediate objects
Path.of('array', 1).unset({}); // {}
// ...and deletes only own properties, so an inherited value may still be visible to get

// Trailing undefined elements will be removed from an array (i.e. array is resized)
Path.of('array', 2).set({ array: [1, undefined, 3] }, undefined); // { array: [1] } where array.length === 1

// toJSON() returns JsonPath compatible serialization
Path.of('array', 0, 'property with spaces').toJSON(); // $.array[0]["property with spaces"]
```

### Parsing Paths

```typescript
import { parsePath } from '@finnair/path-parser';

parsePath(`$.array[1]["\\"property\\" with spaces and 'quotes'"]`); // JSON string encoded in brackets!
// Path.of('array', 1, `"property" with spaces and 'quotes'`);

// Single quotes also work, but encoding is still JSON string so the value cannot contain ' character
parsePath(`$['single quotes']`); // Path.of('single quotes')
parsePath(`$['single\'quote']`); // Fail!

// ...without using unicode escape
parsePath(`$['\\u0027']`); // Path.of("\'");
```

## Using PathMatcher

`PathMatcher` is constructed from `PathExpression[]`. Each `PathExpression` is capable of handling one path component, find matching values, testing if a (concrete) Path component is a match and serialize the expression to string. As `PathExpression` is just a simple interface, it is possible also to implement custom `PathExpressions`, however, the default parser cannot handle them of course.

### Constructing PathMatcher

```typescript
import { PathMatcher, AnyIndex, AnyProperty, UnionMatcher } from '@finnair/path';

// Constructing using static creator - string is shorcut for PropertyMathcer and number for IndexMatcher
PathMatcher.of('array', AnyIndex, 'name'); // $.array[*].name
PathMatcher.of(AnyProperty, 'name'); // $.*.name
PathMatcher.of('child', UnionMatcher.of('name', 'value')); // $.child['name','value']
```

### Finding values

`find` returns Nodes of path and value

```typescript
PathMatcher.of('array', AnyIndex).find({ array: [1, 2], other: 'property' }); // $.array[*]
// [ { path: Path.of('array', 0), value: 1 }, { path: Path.of('array', 1), value: 2 } ]
```

`findValues` returns actual values

```typescript
let array: any = [1, 2];
array.property = 'stupid thing to do';
PathMatcher.of(AnyProperty).findValues(array)); // [1, 2]
PathMatcher.of(AnyIndex).findValues(array); // [1, 2]
PathMatcher.of('property').findValues(array); // [] - only objects have properties
PathMatcher.of('length').findValues(array); // []

// ...also undefined array elements
array = [];
array[2] = 'first actual value';
PathMatcher.of(AnyIndex).findValues(array); // [undefined, undefined, 'first actual value']
```

Finding first match and value is also directly supported

```typescript
// Finding first, possibly undefined, match
PathMatcher.of(AnyIndex).findFirst([undefined, 2, 3]);
// [ { path: Path.of(0) } ]

// Finding first value doesn't make difference between "nothing found" and "found undefined value"
PathMatcher.of(AnyIndex).findFirst([undefined, 2, 3]); // undefined
PathMatcher.of(4).findFirst([]); // undefined
```

### Matching Paths

Sometimes it's usefull to be able to also match Paths directly against a PathMatcher...

```typescript
// Exact match
PathMatcher.of(AnyProperty).match(Path.of('parent')); // true
PathMatcher.of(AnyProperty).match(Path.of('parent', 'child')); // false
PathMatcher.of(AnyProperty).match(Path.of()); // false

// Prefix match
PathMatcher.of(AnyProperty).prefixMatch(Path.of('parent')); // true
PathMatcher.of(AnyProperty).prefixMatch(Path.of('parent', child)); // true
PathMatcher.of(AnyProperty).prefixMatch(Path.of()); // false

// Partial match - prefix of suffix
PathMatcher.of(AnyProperty).partialMatch(Path.of('parent')); // true
PathMatcher.of(AnyProperty).partialMatch(Path.of('parent', child)); // true
PathMatcher.of(AnyProperty).partialMatch(Path.of()); // true
PathMatcher.of('parent', 'one').partialMatch(Path.of('parent', 'two')); // false
```

### toJSON

`PathMatcher.toJSON()` returns `JsonPath` like representation of the matcher. Main difference is that _bracket–notation_ (when required) uses JSON string encoding.

### Parsing PathMatchers

`parsePathMatcher` parses simple JsonPath like expressions. Supported expressions are

| Expression                          | Description                                                           |
| ----------------------------------- | --------------------------------------------------------------------- |
| `$.property`                        | Identifiers matching RegExp `/^[a-zA-Z_][a-zA-Z0-9_]*$/`              |
| `$[0]`                              | Index match                                                           |
| `$.*`                               | Any property matcher, wildcard (matches also array elements)          |
| `$[*]`                              | Any index matcher, wildcard (matches only array elements)             |
| `$["JSON string encoded property"]` | Property as JSON encoded string                                       |
| `$['JSON string encoded property']` | Property as single quoted, but otherwise JSON encoded, string(\*)     |
| `$[union,"of",4,'components']`      | Union matcher that also supports identifiers and JSON encoded strings |

\*) This is the official way of `JsonPath`, but the specification is a bit unclear on the encoding. In this library we prefer proper JSON string encoding with double quotes.

```typescript
import { parsePathMatcher } from '@finnair/path-parser';

parsePathMatcher(`$.array[0][*].*['union',"of",properties,1]`);
// PathMatcher.of(
//   'array',
//    0,
//   AnyIndex,
//   AnyProperty,
//   UnionMatcher.of('union', 'of', 'properties', 1)
// )
```

## Using Projection

`Projection` is a collection of include and exclude `PathMatchers`. It's main use is to map a projection of it's input based on the include/exclude configuration. It also allows matching `Path` instances directly.

```typescript
const example = {
  name: 'name',
  array: [
    { name: 'one', value: 1 },
    { name: 'two', value: 2 },
  ],
};

// Only includes
Projection.of([PathMatcher.of('array')]).map(example);
// { array: [ { name: 'one', value: 1 }, { name: 'two', value: 2 } ] }

// Only excludes
Projection.of([], [PathMatcher.of('array')]).map(example);
// { name: 'name' }

// Includes and excludes
Projection.of([PathMatcher.of('array')], [PathMatcher.of('array', AnyIndex, 'name')]).map(example);
// { array: [{ value: 1 }, { value: 2 }] }

// With "compression" of arrays
Projection.of([PathMatcher.of('array', 1, 'name')]);
// { array: [{ name: 'two' }] }
```

`Projection.map` does _not_ modify it's input, but always returns a "JSON clone" of it.

JSON clone is also essential for security reasons as it prevent's a malicious user from accessing internals of an object (e.g. `Moment`).

NOTE: While this library guards against causing prototype pollution (e.g. `__proto__` is always handled as an own property), it assumes that `Object.prototype` has no enumerable properties. If it has been polluted, PathMatchers and validators will also see the polluted properties.

Only the parts of the input that may end up in the result are converted to JSON: `toJSON`, the `replacer` and the `BigInt` check are not applied to subtrees outside includes or inside excludes (unless an always path selects something in them). This makes projecting a small part of a large input, or excluding large parts of it, proportionally cheaper. Custom `PathExpression`s must implement `test` consistently with `find`, i.e. `test` must accept every component that `find` visits.

`Projection` can also match `Path` instances directly, which can be used for example as an optimization for skipping fetching of an expensive relation.

```typescript
if (projection.match(Path.of('array', AnyIndex, 'name'))) {
  fetchNamesFor(result.array):
}
```

## Why Yet Another "JsonPath" Library?

Gave up trying to find a library that satisfies all our requirements ¯\\_(ツ)_/¯

- Security: `JsonPath` contains parts that are strictly NOT safe for handling untrusted user input (e.g. [static-eval#security](https://github.com/browserify/static-eval#security))
- Encoding of _bracket notation_ properties
  - Bracket notation property encoding is not defined by the [JsonPath specification](https://goessner.net/articles/JsonPath/)
  - JSON string encoding seems a logical choice, but that conflicts with single quote being the selected quote type for property names as there is no escape sequence for single quote in JSON string encoding
  - While parser also supports single quotes, this library uses JSON string encoding with double quotes by default
- Clear separation of concrete paths and matchers
  - Concrete paths are required by `v-validation` to point to a location of an invalid value
  - Matchers are required for example by an API for include/exclude functionality
- Clear separation of logic and data sturctures from parsers
- Functions are especially designed to fit our use cases
