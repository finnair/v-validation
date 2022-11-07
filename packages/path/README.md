# Path

`@finnair/path` contains partly `JsonPath` compatible path utilities:

- `Path` - concrete JSON paths used to locate, read or write a of an object.
- `PathMatcher` - a JsonPath like query processor.
- `Projection` - PathMatcher based include/exclude mapper for providing partial results from e.g. an API.

Parsers for Path and PathMatcher are available in a separate package [`@finnair/path-parser`](../path-parser/README.md).

## Getting Started

Install v-validation using [`yarn`](https://yarnpkg.com/en/package/jest):

```bash
yarn add @finnair/path
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/path
```

## Use Case Examples

### Report Validation Errors

Path can be used to point a location of invalid value (see [`v-validation`](../core/README.md). Path's immutability and fluent API makes it easy and safe to use.

### Analyze Changes

Path can be used to report changes made to an object:

```typescript
// NOTE: This is pseudocode!
const originalValue = fetchResource(); // No need for long lasting, e.g. optimistic, locking
const updatedValue = await doUpdate(originalValue); // Edit in e.g. UI

// Map from Path to new value
const changes: Map<Path, any> = analyzeChanges(updatedValue, originalValue);
// analyzeChanges implementation is not in this library's scope
```

### Detect Interesting Changes

In message based systems, consumers may be interested only in specific changes. Once a change is analyzed, `PathMatcher` can be used to check if it's of interest to a particular consumer.

```typescript
const subscription = [PathMatcher.of('interestingProperty'), PathMatcher.of('interestingArray', AnyIndex, 'someProperty')];
const isInteresting = Array.from(changes.keys()).some(path => subscription.some(pathMatcher => pathMatcher.prefixMatch(path)));
```

### Apply Changes (Patch)

Changes can also be applied to another (newer) version of the same object safely. This is important in systems where there

```typescript
// Fetch and lock (pessimistic or optimistic) latest value for the duration of the actual update
const latestValue = fetchAndLockResource();
changes.forEach((newValue, path) => {
  path.set(latestValue, newValue); // Unsets value if newValue is undefined
});
updateResource(latestValue);
```

NOTE: Updating an array with `Path.set` will truncate possible undefined values from the end of the array. This allows
removing trailing elements without leaving undefined elements in place.

### Include/Exclude Projection

While GraphQL is all about projections, something similar can also be implemented in a REST API with include/exclude parameters. `Projection` and `parsePathMatcher` function provides means to process results safely based on such a user input. This is, of course, very simplified projection compared to what GraphQL has to offer, but it's also... well, simpler.

Projection can also be used to optimize fetching expensive relations as it also supports matching Paths and not just mapping actual values:

```typescript
const resource = fetchResult(request);
const projection = Projection.of(parseIncludes(request), parseExcludes(request));
const result = {
  ...resource,
  veryExpensiveRelation: projection.match(Path.of('veryExpensiveRelation')) ? fetchVeryExpensiveRelation(resource) : undefined,
};
return projection.map(result);
```

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

// Setting Path value of an object
Path.of('array', 1).set({}, 'foo'); // { array: [undefined, 'foo'] }
Path.of('parent', 'child', 'name').set({}, 'child name'); // { parent: { child: { name: 'child name' } } }

// Unsetting Path value of an object
Path.of('array', 1).unset({ array: [1, 2, 3] }); // { array: [1, undefined, 3] }
// ...but unsetting a value doesn't create intermediate objects
Path.of('array', 1).unset({}); // {}

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
PathMatcher.of(AnyProperty, 'length'); // $.*.length
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
PathMatcher.of(AnyProperty).findValues(array)); // [1, 2, 'stupid thing to do']
PathMatcher.of(AnyIndex).findValues(array); // [1, 2]

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
| `$.*`                               | Any property matcher, wildcard (matches also array indexes)           |
| `$[*]`                              | Any index matcher, wildcard (matches only array indexes)              |
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

`Projection.map` does _not_ modify it's input, but returns a "JSON clone" - except in a case when there are neither includes nor excludes, in which case it returns the input object directly.

JSON clone is also essential for security reasons as it prevent's a malicious user from accessing internals of an object (e.g. `Moment`).

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
