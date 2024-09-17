# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
