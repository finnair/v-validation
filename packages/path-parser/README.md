# Path Parser

`@finnair/path-parser` contains [nearley.js](https://nearley.js.org/) based parsers for `Path` and `PathMatcher`.

See [`@finnair/path`](../path/README.md) or instructions on how to use `Path` and `PathMatcher`.

## Getting Started

Install v-validation using [`yarn`](https://yarnpkg.com/en/package/jest):

```bash
yarn add @finnair/path-parser
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/path-parser
```

## Parsing Paths

```typescript
import { parsePath } from '@finnair/path-parser';

parsePath(`$.array[1]["\\"property\\" with spaces and 'quotes'"]`); // JSON string encoded in brackets!
// Path.of('array', 1, `"property" with spaces and 'quotes'`);

// Single quotes also work, but encoding is still JSON string so the value cannot contain ' character
parsePath(`$['single quotes']`); // Path.of('single quotes')
parsePath(`$['single\'quote']`); // Fail!

// ...without using unicode escape
parsePath(`$['\\u0027']`); // Path.of("'");
```

## Parsing PathMatchers

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
