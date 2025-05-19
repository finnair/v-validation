# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [9.1.0](https://github.com/finnair/v-validation/compare/v9.0.0...v9.1.0) (2025-05-19)

**Note:** Version bump only for package @finnair/v-validation

# [9.0.0](https://github.com/finnair/v-validation/compare/v8.0.0...v9.0.0) (2025-03-13)

### Bug Fixes

- date instantiation in tests ([#134](https://github.com/finnair/v-validation/issues/134)) ([276954a](https://github.com/finnair/v-validation/commit/276954a4d4a0b397364109b4411fdd7e3c13a133))

# [8.0.0](https://github.com/finnair/v-validation/compare/v7.3.0...v8.0.0) (2025-02-03)

### BREAKING CHANGES

- drop (partial) support for cyclic data validation ([#131](https://github.com/finnair/v-validation/pull/131)) ([553d0de](https://github.com/finnair/v-validation/commit/553d0de557e9301823a2d687fef4b7f356da21bd))

# [7.3.0](https://github.com/finnair/v-validation/compare/v7.2.0...v7.3.0) (2025-01-31)

### Features

- `V.oneOf`reports all results in case of error + fixed cycle detection ([#130](https://github.com/finnair/v-validation/issues/130)) ([c1a2148](https://github.com/finnair/v-validation/commit/c1a214885a9ea0b438b19df7994bf59174b246a0))

# [7.2.0](https://github.com/finnair/v-validation/compare/v7.1.0...v7.2.0) (2025-01-29)

**Note:** Version bump only for package @finnair/v-validation

# [7.1.0](https://github.com/finnair/v-validation/compare/v7.0.0...v7.1.0) (2025-01-23)

### Features

- JsonBigInt constructor supports string and number inputs ([#127](https://github.com/finnair/v-validation/issues/127)) ([0b67fb1](https://github.com/finnair/v-validation/commit/0b67fb18c2189d2520ac34abb7107663f51f18ad))

# [7.0.0](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.9...v7.0.0) (2025-01-07)

### Features

- **Typing**: Validators may have a specific input and especially output type.
- `V.objectType()` builder can be used to build an ObjectValidator with inferred type.
- Validator (output/result) type can be acquired with `VType<typeof validator>`.
- Direct, chainable support for most used "next" validation rules, e.g. `V.number().min(1).max(2)`:
  - `V.string()` supports `notEmpty`, `notBlank`, `pattern` and `size`,
  - `V.number()` supports `min`, `max` and `between`.
- Use `Validator#getValid(input)` to get valid a valid value or an exception directly.
- New strictly typed "optional" validators:
  - `V.optionalStrict<T>(validator: Validator<T>)`: `undefined | T` - `V.optional` allows also null,
  - `V.nullable<T>(validator: Validator<T>)`: `null | T`,
  - `V.optionalProperties<K, V>(keys: Validator<K>, values: Validator<V>)`: `Partial<Record<Key, Value>>`.
- V.jsonBigInt() validator for JSON-safe JsonBigInt wrapper for BigInt ([#125](https://github.com/finnair/v-validation/issues/125)) ([b6ae653](https://github.com/finnair/v-validation/commit/b6ae65374d41436577d4e4b6c5ee148f8ad8635c))

### BREAKING CHANGES

- `V.string()` and some other validators do not support String object as input any more.
  `isString()` function doesn't support String object any more.
- `V.number()` does not support Number object as input any more.
- `V.allOf()` requires that all results match.
- Validators that accept multiple subvalidators (`V.optional`, `V.required`, `V.check`, `V.if`, `V.whenGroup`, `V.json` and `ObjectModel#next`) are combined using `V.compositionOf` instead of `V.allOf` as composition makes more sense in general. However, if there are multiple parents with next validators, those are still combined with `V.allOf` as they are not aware of each other.
- `V.if` does not support "fall through" any more but rejects with NoMatchingCondition if no condition matches. Use `.else(V.any())` if "fall through" is desirable.
- `V.whenGroup` does not support "fall through" any more but rejects with NoMatchingGroup if no condition matches. Use `.otherwise(V.any())` if "fall through" is desirable.
- More straightforward internal architecture:
  - internal Validator#validatePath returns now a Promise of valid value or reject of Violation(s) directly instead of ValidationResult,
  - custom SyncPromise is removed in favor of Promise.resolve and reject,
  - `ValidatorContext` no longer has `success`, `successPromise`, `failurePromise` and `promise` functions - use `Promise.resolve(value)` or `Promise.reject(new Violation(...))` with single violation or an array of violations.
- `V.mapType`, `V.toMapType` and `V.setType` now require `jsonSafe` boolean parameter for typing: JsonMap/JsonSet (true) or plain Map/Set (false).

# [7.0.0-alpha.9](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.8...v7.0.0-alpha.9) (2024-12-11)

### Features

- V.mapType, V.toMapType and V.setType typing ([#123](https://github.com/finnair/v-validation/issues/123)) ([ed7780c](https://github.com/finnair/v-validation/commit/ed7780c284fb8d41157cf33fa54f6984275c6283))

# [7.0.0-alpha.8](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.7...v7.0.0-alpha.8) (2024-11-21)

### Bug Fixes

- SchemaValidator export ([987f88c](https://github.com/finnair/v-validation/commit/987f88ccb7a5f0bc90c54d0a83b2fba901375d5f))

# [7.0.0-alpha.7](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.6...v7.0.0-alpha.7) (2024-11-21)

### Bug Fixes

- package.json exports ([7edf1ee](https://github.com/finnair/v-validation/commit/7edf1ee0b2295c7659802aab10963a0579869e5a))

# [7.0.0-alpha.6](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.5...v7.0.0-alpha.6) (2024-11-18)

### Bug Fixes

- some validators throwing instead of returning Promise.reject ([c00876d](https://github.com/finnair/v-validation/commit/c00876ddb77d8deefcf38c8e9a05749b8c7f1cff))
- V.emptyTo typing ([c5a81f4](https://github.com/finnair/v-validation/commit/c5a81f4e5354570d0b331e31a8367fdb52464505))

# [7.0.0-alpha.5](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.4...v7.0.0-alpha.5) (2024-11-14)

### Features

- V.optionalProperties for optional enum keys ([59efa2d](https://github.com/finnair/v-validation/commit/59efa2da4def123178bf85dd584ad758e06f57f4))

# [7.0.0-alpha.4](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.3...v7.0.0-alpha.4) (2024-11-14)

### Features

- type guards to verify validator and existing type equality ([#119](https://github.com/finnair/v-validation/issues/119)) ([92699e7](https://github.com/finnair/v-validation/commit/92699e7c87e89246f92b24627278dfc57b9a128d))

# [7.0.0-alpha.3](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.2...v7.0.0-alpha.3) (2024-11-11)

### Bug Fixes

- objectType: infer optional properties for next and localNext ([3c41da9](https://github.com/finnair/v-validation/commit/3c41da9a3fd0f04f2de801736f2ceeaf46a0453e))

# [7.0.0-alpha.2](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.1...v7.0.0-alpha.2) (2024-11-08)

### Features

- string size and number between validator chaining ([507f171](https://github.com/finnair/v-validation/commit/507f17124b28e295ecc7f1eef0359729b523076a))

# [7.0.0-alpha.1](https://github.com/finnair/v-validation/compare/v7.0.0-alpha.0...v7.0.0-alpha.1) (2024-11-08)

### Bug Fixes

- enum validator typing ([d39f2d4](https://github.com/finnair/v-validation/commit/d39f2d4c0d692882f8b263f5e2473b61bd9eb961))
- V.properties typing ([757b676](https://github.com/finnair/v-validation/commit/757b6762b9191790b29b5634c92078b25af294cb))

# [7.0.0-alpha.0](https://github.com/finnair/v-validation/compare/v6.1.0...v7.0.0-alpha.0) (2024-11-08)

**Note:** Version bump only for package @finnair/v-validation

# [6.1.0](https://github.com/finnair/v-validation/compare/v6.0.2...v6.1.0) (2024-10-21)

### Features

- UUID v7 support ([#115](https://github.com/finnair/v-validation/issues/115)) ([2312c94](https://github.com/finnair/v-validation/commit/2312c943d3362fc85a242903381654c4db7dd5c6))
- validation result as unknown instead of any ([#116](https://github.com/finnair/v-validation/issues/116)) ([124f14e](https://github.com/finnair/v-validation/commit/124f14ef949f4b9a11143d49d6554efdc8b955f4))

## [6.0.2](https://github.com/finnair/v-validation/compare/v6.0.1...v6.0.2) (2024-09-17)

**Note:** Version bump only for package @finnair/v-validation

## [6.0.1](https://github.com/finnair/v-validation/compare/v6.0.0...v6.0.1) (2024-09-16)

**Note:** Version bump only for package @finnair/v-validation

# [6.0.0](https://github.com/finnair/v-validation/compare/v5.4.0...v6.0.0) (2024-09-16)

### Features

- @finnair/diff package with Diff and VersionInfo ([#111](https://github.com/finnair/v-validation/issues/111)) ([3b26d49](https://github.com/finnair/v-validation/commit/3b26d49b63851fbcfce9b15efc53ad5418ae4de4))

### BREAKING CHANGES

- More general and efficient PathMatcher API.

# [5.4.0](https://github.com/finnair/v-validation/compare/v5.3.0...v5.4.0) (2024-05-08)

### Features

- Set-validation with JSON-safe extension ([#108](https://github.com/finnair/v-validation/issues/108)) ([91129df](https://github.com/finnair/v-validation/commit/91129df42978c44e9494ba41376db3c549d2c919))

# [5.3.0](https://github.com/finnair/v-validation/compare/v5.2.0...v5.3.0) (2024-03-20)

**Note:** Version bump only for package @finnair/v-validation

# [5.2.0](https://github.com/finnair/v-validation/compare/v5.1.0...v5.2.0) (2024-02-14)

### Bug Fixes

- use peerDependencies to other v-validation packages to avoid duplicate dependencies ([#101](https://github.com/finnair/v-validation/issues/101)) ([ae1def0](https://github.com/finnair/v-validation/commit/ae1def01e10d3491949424a76c986caa82e7a4d2))

# [5.1.0](https://github.com/finnair/v-validation/compare/v5.0.1...v5.1.0) (2023-11-16)

### Features

- support both ESM and CommonJS ([#96](https://github.com/finnair/v-validation/issues/96)) ([c32a104](https://github.com/finnair/v-validation/commit/c32a1040cd2e0412005cf9e6ff869569ab194950))

## [5.0.1](https://github.com/finnair/v-validation/compare/v5.0.0...v5.0.1) (2023-10-13)

### Bug Fixes

- npm ignore node_modules for published packages ([9690faf](https://github.com/finnair/v-validation/commit/9690fafb8289e6448dbbeb6274054a8f2b01907a))
- revert npm ignore node_modules for published packages ([53acd31](https://github.com/finnair/v-validation/commit/53acd312441e823d507152f371ecca0367412c18))

**Note:** Version bump only for package @finnair/v-validation

# [5.0.0](https://github.com/finnair/v-validation/compare/v4.3.0...v5.0.0) (2023-10-13)

### Features

- use ECMAScript modules (ESM) instead of CommonJS ([#95](https://github.com/finnair/v-validation/issues/95)) ([92e9118](https://github.com/finnair/v-validation/commit/92e9118235957ec4bc2bcf2de73e195ea940378c))

# [5.0.0](https://github.com/finnair/v-validation/compare/v4.3.0...v5.0.0) (2023-10-13)

### Features

- use ECMAScript modules (ESM) instead of CommonJS ([#95](https://github.com/finnair/v-validation/issues/95)) ([92e9118](https://github.com/finnair/v-validation/commit/92e9118235957ec4bc2bcf2de73e195ea940378c))

# [4.3.0](https://github.com/finnair/v-validation/compare/v4.2.0...v4.3.0) (2023-10-03)

### Bug Fixes

- ESM compatible export of V ([#94](https://github.com/finnair/v-validation/issues/94)) ([4dfe9d4](https://github.com/finnair/v-validation/commit/4dfe9d4087a625b04c844b0e6f9fda94d3ca9fb7))

# [4.1.0](https://github.com/finnair/v-validation/compare/v4.0.0...v4.1.0) (2022-11-22)

### Bug Fixes

- V.nullTo cannot support objects as defaultValue ([#86](https://github.com/finnair/v-validation/issues/86)) ([662b431](https://github.com/finnair/v-validation/commit/662b4315b1ae1b59e4e663581d7ff96bf26ab3c1))

# [4.0.0](https://github.com/finnair/v-validation/compare/v3.2.0...v4.0.0) (2022-11-07)

**Note:** Version bump only for package @finnair/v-validation

# [3.1.0](https://github.com/finnair/v-validation/compare/v3.0.0...v3.1.0) (2022-10-24)

**Note:** Version bump only for package @finnair/v-validation

# [3.0.0](https://github.com/finnair/v-validation/compare/v2.0.0...v3.0.0) (2022-10-03)

### Features

- Optimized performance (~2-4 times faster) and memory usage (~2.5 times better).
- Use Object.freeze to ensure Validator immutability.
- Update dependencies.
- Use peerDependencies for Moment and Luxon.

### Performance Improvements

- Execute synchronous validators with effectively synchronous PromiseLike objects
- Optimize CompositionValidator by using async/await instead of nested callbacks ([026f2c3](https://github.com/finnair/v-validation/commit/026f2c3d23d4dbb644338d3d127e83dfbee3bd9c))
- Optimize loops ([8c5c915](https://github.com/finnair/v-validation/commit/8c5c915794fb39ab6fd41ec7d3ac4e4f028ed7fa))
- Optimize NextValidator by removing unnecessary callback ([4599c04](https://github.com/finnair/v-validation/commit/4599c04c435871ec6eda5fdf3167267256fd5808))

### BREAKING CHANGES

- Drop ObjectValidator.withProperty function - use deferred reference to self with `V.fn` instead.
- Map validation error paths by entry indexes (index 0 for key and 1 for value) instead key and value properties.

# [2.0.0](https://github.com/finnair/v-validation/compare/v1.1.0...v2.0.0) (2022-09-08)

**Note:** Version bump only for package @finnair/v-validation

# [1.1.0](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0) (2022-08-29)

### Features

- Support for Luxon ([94b3806](https://github.com/finnair/v-validation/commit/94b38060e07feeb0abb8c81659d8bda537a4d9aa))

# [1.1.0-alpha.6](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.6) (2022-08-17)

**Note:** Version bump only for package @finnair/v-validation

# [1.1.0-alpha.5](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.5) (2022-08-16)

**Note:** Version bump only for package @finnair/v-validation

# [1.1.0-alpha.0](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.0) (2022-08-12)

**Note:** Version bump only for package @finnair/v-validation

## [1.0.1](https://github.com/finnair/v-validation/compare/v0.9.1...v1.0.1) (2022-01-20)

### Features

- Add support for Node v14 and v16
- Update Jest and Lerna
- Update other vulnerable packages

### BREAKING CHANGES

- Drop support for Node v10

## [0.9.1](https://github.com/finnair/v-validation/compare/v0.9.0...v0.9.1) (2020-12-07)

### Bug Fixes

- Bumped deep-equal from 2.0.3 to 2.0.5 ([#54](https://github.com/finnair/v-validation/issues/54)) ([159fd62](https://github.com/finnair/v-validation/commit/159fd62fd3efc09d11903fcaa1f01e7123f56f35))

# [0.9.0](https://github.com/finnair/v-validation/compare/v0.8.0...v0.9.0) (2020-09-23)

### Features

- V.json - parse and validate JSON input
- V.anyOf - match if one or more of given validators match

# [0.8.0](https://github.com/finnair/v-validation/compare/v0.7.0...v0.8.0) (2020-09-09)

### Bug Fixes

- Fix losing context in arrow functions ([5c27b10283](https://github.com/finnair/v-validation/commit/5c27b10283e560b90a6f9ff9b4db8dcb87c99dbc))

- Fix TypeScript target and pin node engine ([dd85776](https://github.com/finnair/v-validation/commit/dd85776364e3ace78cc4b4d2cdbbe73485517daf))

# [0.7.0](https://github.com/finnair/v-validation/compare/v0.6.2...v0.7.0) (2020-08-26)

### Features

- refactor "then" to "next" ([9b02d2c](https://github.com/finnair/v-validation/commit/9b02d2c6cca8f6a5e44633b6dad2df2ecec28af2))

### BREAKING CHANGES

- Validator:
  - then -> next
  - thenMap -> nextMap

ObjectModel & ClassModel:

- then -> next
- localThen -> localNext

Signed-off-by: Samppa Saarela <samppa.saarela@iki.fi>

## [0.6.2](https://github.com/finnair/v-validation/compare/v0.6.1...v0.6.2) (2020-05-22)

### Bug Fixes

- Update Moment.js and fix dependencies ([2e9a16d](https://github.com/finnair/v-validation/commit/2e9a16d297994a557133a853ed6556d16552c21a))

## [0.6.1](https://github.com/finnair/v-validation/compare/v0.6.0...v0.6.1) (2020-05-22)

### Bug Fixes

- NPM ignore node_modules ([9f1264f](https://github.com/finnair/v-validation/commit/9f1264f5086e406d30f94f5a47aa3fb6956d725a))

# [0.6.0](https://github.com/finnair/v-validation/compare/v0.5.0...v0.6.0) (2020-05-19)

## BREAKING CHANGES:

- Move Path into `@finnair/path` package
- Rename package `@finnair/v-validation-core` to `v-validation`

# [0.5.0](https://github.com/finnair/v-validation/compare/v0.4.0...v0.5.0) (2020-05-19)

Publish failed.

# [0.4.0](https://github.com/finnair/v-validation/compare/v0.3.0...v0.4.0) (2020-04-21)

### Features

- Property order ([8aea400](https://github.com/finnair/v-validation/commit/8aea400440aede0b4602aa7d00bd93827f0acec8)), closes [#26](https://github.com/finnair/v-validation/issues/26)

# [0.3.0](https://github.com/finnair/v-validation/compare/v0.2.0...v0.3.0) (2020-04-16)

**Note:** Version bump only for package @finnair/v-validation-core

# [0.2.0](https://github.com/finnair/v-validation/compare/v0.1.4...v0.2.0) (2020-04-15)

**Note:** Version bump only for package @finnair/v-validation-core

## [0.1.4](https://github.com/finnair/v-validation/compare/v0.1.3...v0.1.4) (2020-04-01)

**Note:** Version bump only for package @finnair/v-validation-core
