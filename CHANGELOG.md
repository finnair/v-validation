# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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

**Note:** Version bump only for package v-validation

# [6.1.0](https://github.com/finnair/v-validation/compare/v6.0.2...v6.1.0) (2024-10-21)

### Bug Fixes

- yarn clean script ([5f3411b](https://github.com/finnair/v-validation/commit/5f3411b1beb323abb3dd8f634415b43ca0ad4eef))

### Features

- UUID v7 support ([#115](https://github.com/finnair/v-validation/issues/115)) ([2312c94](https://github.com/finnair/v-validation/commit/2312c943d3362fc85a242903381654c4db7dd5c6))
- validation result as unknown instead of any ([#116](https://github.com/finnair/v-validation/issues/116)) ([124f14e](https://github.com/finnair/v-validation/commit/124f14ef949f4b9a11143d49d6554efdc8b955f4))

## [6.0.2](https://github.com/finnair/v-validation/compare/v6.0.1...v6.0.2) (2024-09-17)

### Bug Fixes

- add missing index.ts ([886bff3](https://github.com/finnair/v-validation/commit/886bff312f2abb081e1683e8d3481ac045cfeee1))

## [6.0.1](https://github.com/finnair/v-validation/compare/v6.0.0...v6.0.1) (2024-09-16)

**Note:** Version bump only for package v-validation

# [6.0.0](https://github.com/finnair/v-validation/compare/v5.4.0...v6.0.0) (2024-09-16)

### Features

- @finnair/diff package with Diff and VersionInfo ([#111](https://github.com/finnair/v-validation/issues/111)) ([3b26d49](https://github.com/finnair/v-validation/commit/3b26d49b63851fbcfce9b15efc53ad5418ae4de4))

### BREAKING CHANGES

- More general and efficient PathMatcher API.

# [5.4.0](https://github.com/finnair/v-validation/compare/v5.3.0...v5.4.0) (2024-05-08)

### Features

- Set-validation with JSON-safe extension ([#108](https://github.com/finnair/v-validation/issues/108)) ([91129df](https://github.com/finnair/v-validation/commit/91129df42978c44e9494ba41376db3c549d2c919))

# [5.3.0](https://github.com/finnair/v-validation/compare/v5.2.0...v5.3.0) (2024-03-20)

### Bug Fixes

- do not create intermediate properties when unsetting a nested value ([#105](https://github.com/finnair/v-validation/issues/105)) ([58d635f](https://github.com/finnair/v-validation/commit/58d635f44baf6d59192fb3254bc76488ade6715e))

# [5.2.0](https://github.com/finnair/v-validation/compare/v5.1.0...v5.2.0) (2024-02-14)

### Bug Fixes

- use peerDependencies to other v-validation packages to avoid duplicate dependencies ([#101](https://github.com/finnair/v-validation/issues/101)) ([ae1def0](https://github.com/finnair/v-validation/commit/ae1def01e10d3491949424a76c986caa82e7a4d2))

# [5.1.0](https://github.com/finnair/v-validation/compare/v5.0.1...v5.1.0) (2023-11-16)

### Features

- support both ESM and CommonJS ([#96](https://github.com/finnair/v-validation/issues/96)) ([c32a104](https://github.com/finnair/v-validation/commit/c32a1040cd2e0412005cf9e6ff869569ab194950))

## [5.0.1](https://github.com/finnair/v-validation/compare/v5.0.0...v5.0.1) (2023-10-13)

### Bug Fixes

- moo import ([a866737](https://github.com/finnair/v-validation/commit/a8667371515fd2fe92fa2e32b382ccc55612b704))
- npm ignore node_modules for published packages ([9690faf](https://github.com/finnair/v-validation/commit/9690fafb8289e6448dbbeb6274054a8f2b01907a))
- revert npm ignore node_modules for published packages ([53acd31](https://github.com/finnair/v-validation/commit/53acd312441e823d507152f371ecca0367412c18))

**Note:** Version bump only for package v-validation

## [5.0.1](https://github.com/finnair/v-validation/compare/v5.0.0...v5.0.1) (2023-10-13)

### Bug Fixes

- moo import ([a866737](https://github.com/finnair/v-validation/commit/a8667371515fd2fe92fa2e32b382ccc55612b704))
- npm ignore node_modules for published packages ([9690faf](https://github.com/finnair/v-validation/commit/9690fafb8289e6448dbbeb6274054a8f2b01907a))
- revert npm ignore node_modules for published packages ([53acd31](https://github.com/finnair/v-validation/commit/53acd312441e823d507152f371ecca0367412c18))

# [5.0.0](https://github.com/finnair/v-validation/compare/v4.3.0...v5.0.0) (2023-10-13)

### Features

- use ECMAScript modules (ESM) instead of CommonJS ([#95](https://github.com/finnair/v-validation/issues/95)) ([92e9118](https://github.com/finnair/v-validation/commit/92e9118235957ec4bc2bcf2de73e195ea940378c))

# [5.0.0](https://github.com/finnair/v-validation/compare/v4.3.0...v5.0.0) (2023-10-13)

### Features

- use ECMAScript modules (ESM) instead of CommonJS ([#95](https://github.com/finnair/v-validation/issues/95)) ([92e9118](https://github.com/finnair/v-validation/commit/92e9118235957ec4bc2bcf2de73e195ea940378c))

- drop support for node 14 and 16

# [4.3.0](https://github.com/finnair/v-validation/compare/v4.2.0...v4.3.0) (2023-10-03)

### Bug Fixes

- ESM compatible export of V ([#94](https://github.com/finnair/v-validation/issues/94)) ([4dfe9d4](https://github.com/finnair/v-validation/commit/4dfe9d4087a625b04c844b0e6f9fda94d3ca9fb7))

# [4.2.0](https://github.com/finnair/v-validation/compare/v4.1.0...v4.2.0) (2023-01-24)

### Features

- Support ISO 8601 time string as Duration ([#89](https://github.com/finnair/v-validation/issues/89)) ([75fb154](https://github.com/finnair/v-validation/commit/75fb154fa5283e7a51d3301097c7ed759beeabd8))

# [4.1.0](https://github.com/finnair/v-validation/compare/v4.0.0...v4.1.0) (2022-11-22)

### Bug Fixes

- V.nullTo cannot support objects as defaultValue ([#86](https://github.com/finnair/v-validation/issues/86)) ([662b431](https://github.com/finnair/v-validation/commit/662b4315b1ae1b59e4e663581d7ff96bf26ab3c1))

# [4.0.0](https://github.com/finnair/v-validation/compare/v3.2.0...v4.0.0) (2022-11-07)

**Note:** Version bump only for package v-validation

# [3.2.0](https://github.com/finnair/v-validation/compare/v3.1.0...v3.2.0) (2022-10-25)

### Features

- setZone method for date-time types ([#84](https://github.com/finnair/v-validation/issues/84)) ([2c01855](https://github.com/finnair/v-validation/commit/2c01855c1541ecd7ad7ea5f8174b2d757400bd15))

# [3.1.0](https://github.com/finnair/v-validation/compare/v3.0.0...v3.1.0) (2022-10-24)

### Features

- LocalDateTimeLuxon (a date-time without timezone) ([#83](https://github.com/finnair/v-validation/issues/83)) ([1517c6e](https://github.com/finnair/v-validation/commit/1517c6ec8af835cb928cd6cf228b9bdc9f0cda3e))

# [3.0.0](https://github.com/finnair/v-validation/compare/v2.0.0...v3.0.0) (2022-10-03)

**Note:** Version bump only for package v-validation

# [3.0.0-alpha.2](https://github.com/finnair/v-validation/compare/v2.0.0...v3.0.0-alpha.2) (2022-09-28)

### Features

- Use SyncPromise also in schema and luxon ([792fbb4](https://github.com/finnair/v-validation/commit/792fbb4c78d07ea085d669312fef5e44e7a397fd))

### Performance Improvements

- Optimize CompositionValidator by using async/await instead of nested callbacks ([026f2c3](https://github.com/finnair/v-validation/commit/026f2c3d23d4dbb644338d3d127e83dfbee3bd9c))
- Optimize loops ([8c5c915](https://github.com/finnair/v-validation/commit/8c5c915794fb39ab6fd41ec7d3ac4e4f028ed7fa))
- Optimize NextValidator by removing unnecessary callback ([4599c04](https://github.com/finnair/v-validation/commit/4599c04c435871ec6eda5fdf3167267256fd5808))

# [3.0.0-alpha.1](https://github.com/finnair/v-validation/compare/v2.0.0...v3.0.0-alpha.1) (2022-09-26)

### Features

- Use SyncPromise also in schema and luxon ([792fbb4](https://github.com/finnair/v-validation/commit/792fbb4c78d07ea085d669312fef5e44e7a397fd))

### Performance Improvements

- Optimize loops ([8c5c915](https://github.com/finnair/v-validation/commit/8c5c915794fb39ab6fd41ec7d3ac4e4f028ed7fa))

# [3.0.0-alpha.0](https://github.com/finnair/v-validation/compare/v2.0.0...v3.0.0-alpha.0) (2022-09-26)

### Features

- Use SyncPromise also in schema and luxon ([e8590b8](https://github.com/finnair/v-validation/commit/e8590b8c2a44ad28fde88f8682f53628ecf74a0f))

### Performance Improvements

- Optimize loops ([6bb3477](https://github.com/finnair/v-validation/commit/6bb34776bb39f0798cc1444fe224b752f9ba86d4))

# [2.0.0](https://github.com/finnair/v-validation/compare/v1.1.0...v2.0.0) (2022-09-08)

- Upgrade All Dependencies (#80) ([fb6309c](https://github.com/finnair/v-validation/commit/fb6309cc1d9fd90f3e8c5ba79798fae1450b66a6)), closes [#80](https://github.com/finnair/v-validation/issues/80)

### Features

- Implement toString in Luxon wrapper types ([#79](https://github.com/finnair/v-validation/issues/79)) ([3f3f3e8](https://github.com/finnair/v-validation/commit/3f3f3e8a4172c7803a7be4809f06aba554f7090f))

### BREAKING CHANGES

- Drop Node 12 support
- Add .nvmrc
- Introduce CI build for Node 18
- Upgrade All Dependencies

# [1.1.0](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0) (2022-08-29)

### Features

- Support for Luxon ([94b3806](https://github.com/finnair/v-validation/commit/94b38060e07feeb0abb8c81659d8bda537a4d9aa))

# [1.1.0-alpha.9](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.8...v1.1.0-alpha.9) (2022-08-19)

**Note:** Version bump only for package v-validation

# [1.1.0-alpha.8](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.7...v1.1.0-alpha.8) (2022-08-19)

**Note:** Version bump only for package v-validation

# [1.1.0-alpha.7](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.6...v1.1.0-alpha.7) (2022-08-18)

**Note:** Version bump only for package v-validation

# [1.1.0-alpha.6](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.6) (2022-08-17)

### Bug Fixes

- Fix exports ([b9eacb6](https://github.com/finnair/v-validation/commit/b9eacb6e98a05a07049eb0a8f97b7e6b4958973a))

### Features

- fromISO helper for Luxon wrapper construction ([e3b8f24](https://github.com/finnair/v-validation/commit/e3b8f247b3a9bfef8ad474688f995862fdd810e3))
- Support for Luxon ([00d0a8e](https://github.com/finnair/v-validation/commit/00d0a8e8c8de46bfeb3502f51bb8cd5a3627070e))

# [1.1.0-alpha.5](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.5) (2022-08-16)

### Bug Fixes

- Fix exports ([904e63c](https://github.com/finnair/v-validation/commit/904e63c4a40e65d274349ae0f5ea80c697c5c8ce))

### Features

- fromISO helper for Luxon wrapper construction ([81d5b2e](https://github.com/finnair/v-validation/commit/81d5b2eb08f360ab56ec0c6caece392a0e6eb1a1))
- Support for Luxon ([6a243f0](https://github.com/finnair/v-validation/commit/6a243f043db2ca6700180eb758a08d8edfe1e538))

# [1.1.0-alpha.4](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.3...v1.1.0-alpha.4) (2022-08-15)

**Note:** Version bump only for package v-validation

# [1.1.0-alpha.3](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.2...v1.1.0-alpha.3) (2022-08-15)

**Note:** Version bump only for package v-validation

# [1.1.0-alpha.2](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.1...v1.1.0-alpha.2) (2022-08-12)

### Bug Fixes

- Fix exports ([c4c42f7](https://github.com/finnair/v-validation/commit/c4c42f715e8c52b29b76f7f07753f632528a69ab))

# [1.1.0-alpha.1](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.0...v1.1.0-alpha.1) (2022-08-12)

### Features

- fromISO helper for Luxon wrapper construction ([187796e](https://github.com/finnair/v-validation/commit/187796e707f44033d94943ef64d48626317b4d80))

# [1.1.0-alpha.0](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.0) (2022-08-12)

### Features

- Support for Luxon ([6f982df](https://github.com/finnair/v-validation/commit/6f982df9b55395e953069914c93fef677dec171e))

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

**Note:** Version bump only for package v-validation

# [0.8.0](https://github.com/finnair/v-validation/compare/v0.7.0...v0.8.0) (2020-09-09)

**Note:** Version bump only for package v-validation

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

- Update Moment.js
- Path utilities:
  - `Path` - concrete JSON paths used to locate, read or write a of an object.
  - `PathMatcher` - a JsonPath like query processor.
  - `Projection` - PathMatcher based include/exclude mapper for providing partial results from e.g. an API.
- Parser for Path and PathMatcher

BREAKING CHANGES:

- Move Path into `@finnair/path` package
- Rename package `@finnair/v-validation-core` to `v-validation`

# [0.5.0](https://github.com/finnair/v-validation/compare/v0.4.0...v0.5.0) (2020-05-19)

Publish failed.

# [0.4.0](https://github.com/finnair/v-validation/compare/v0.3.0...v0.4.0) (2020-04-21)

### Features

- Property order ([8aea400](https://github.com/finnair/v-validation/commit/8aea400440aede0b4602aa7d00bd93827f0acec8)), closes [#26](https://github.com/finnair/v-validation/issues/26)

# [0.3.0](https://github.com/finnair/v-validation/compare/v0.2.0...v0.3.0) (2020-04-16)

**Note:** Version bump only for package v-validation

# [0.2.0](https://github.com/finnair/v-validation/compare/v0.1.4...v0.2.0) (2020-04-15)

**Note:** Version bump only for package v-validation

## [0.1.4](https://github.com/finnair/v-validation/compare/v0.1.3...v0.1.4) (2020-04-01)

**Note:** Version bump only for package v-validation
