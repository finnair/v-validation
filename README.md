![CI](https://github.com/finnair/v-validation/workflows/CI/badge.svg?branch=master)
[![codecov](https://codecov.io/gh/finnair/v-validation/branch/master/graph/badge.svg)](https://codecov.io/gh/finnair/v-validation)
[![npm version](https://badge.fury.io/js/%40finnair%2Fv-validation.svg)](https://badge.fury.io/js/%40finnair%2Fv-validation)

# Packages

## V

V stands for Validation.

`V` rules define how input is to be converted, normalized and validated to
conform to the expected model.

[`@finnair/v-validation` README](./packages/core/README.md)

## Vmoment

`Vmoment` contains `v-validation` extensions for [Moment.js](https://momentjs.com/).

[`@finnair/v-validation-moment` README](./packages/moment/README.md)

## Path

`@finnair/path` contains partly `JsonPath` compatible path utilities:

- `Path` - concrete JSON paths used to locate, read or write a of an object.
- `PathMatcher` - a JsonPath like query processor.
- `Projection` - PathMatcher based include/exclude mapper for providing partial results from e.g. an API.

[`@finnair/path` README](./packages/path/README.md)

## Path Parsers

`@finnair/path-parser` contains [nearley.js](https://nearley.js.org/) based parsers for `Path` and `PathMatcher`.

[`@finnair/path-parser` README](./packages/path-parser/README.md)

# Getting Started

Install desired packages using [`yarn`](https://yarnpkg.com/en/package/jest):

```bash
yarn add @finnair/v-validation
yarn add @finnair/v-validation-moment
yarn add @finnair/path
yarn add @finnair/path-parser
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/v-validation
npm install @finnair/v-validation-moment
npm install @finnair/path
npm install @finnair/path-parser
```

## Development

See [Contributing Guildelines](./.github/CONTRIBUTING.md).
