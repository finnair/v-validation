# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [7.0.0-alpha.0](https://github.com/finnair/v-validation/compare/v6.1.0...v7.0.0-alpha.0) (2024-11-08)

**Note:** Version bump only for package @finnair/v-validation-luxon

# [6.1.0](https://github.com/finnair/v-validation/compare/v6.0.2...v6.1.0) (2024-10-21)

**Note:** Version bump only for package @finnair/v-validation-luxon

## [6.0.2](https://github.com/finnair/v-validation/compare/v6.0.1...v6.0.2) (2024-09-17)

**Note:** Version bump only for package @finnair/v-validation-luxon

## [6.0.1](https://github.com/finnair/v-validation/compare/v6.0.0...v6.0.1) (2024-09-16)

**Note:** Version bump only for package @finnair/v-validation-luxon

# [6.0.0](https://github.com/finnair/v-validation/compare/v5.4.0...v6.0.0) (2024-09-16)

### Features

- @finnair/diff package with Diff and VersionInfo ([#111](https://github.com/finnair/v-validation/issues/111)) ([3b26d49](https://github.com/finnair/v-validation/commit/3b26d49b63851fbcfce9b15efc53ad5418ae4de4))

### BREAKING CHANGES

- More general and efficient PathMatcher API.

# [5.4.0](https://github.com/finnair/v-validation/compare/v5.3.0...v5.4.0) (2024-05-08)

**Note:** Version bump only for package @finnair/v-validation-luxon

# [5.3.0](https://github.com/finnair/v-validation/compare/v5.2.0...v5.3.0) (2024-03-20)

**Note:** Version bump only for package @finnair/v-validation-luxon

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

**Note:** Version bump only for package @finnair/v-validation-luxon

# [5.0.0](https://github.com/finnair/v-validation/compare/v4.3.0...v5.0.0) (2023-10-13)

### Features

- use ECMAScript modules (ESM) instead of CommonJS ([#95](https://github.com/finnair/v-validation/issues/95)) ([92e9118](https://github.com/finnair/v-validation/commit/92e9118235957ec4bc2bcf2de73e195ea940378c))

# [5.0.0](https://github.com/finnair/v-validation/compare/v4.3.0...v5.0.0) (2023-10-13)

### Features

- use ECMAScript modules (ESM) instead of CommonJS ([#95](https://github.com/finnair/v-validation/issues/95)) ([92e9118](https://github.com/finnair/v-validation/commit/92e9118235957ec4bc2bcf2de73e195ea940378c))

# [4.3.0](https://github.com/finnair/v-validation/compare/v4.2.0...v4.3.0) (2023-10-03)

**Note:** Version bump only for package @finnair/v-validation-luxon

# [4.2.0](https://github.com/finnair/v-validation/compare/v4.1.0...v4.2.0) (2023-01-24)

### Features

- Support ISO 8601 time string as Duration ([#89](https://github.com/finnair/v-validation/issues/89)) ([75fb154](https://github.com/finnair/v-validation/commit/75fb154fa5283e7a51d3301097c7ed759beeabd8))

# [4.1.0](https://github.com/finnair/v-validation/compare/v4.0.0...v4.1.0) (2022-11-22)

**Note:** Version bump only for package @finnair/v-validation-luxon

# [4.0.0](https://github.com/finnair/v-validation/compare/v3.2.0...v4.0.0) (2022-11-07)

**Note:** Version bump only for package @finnair/v-validation-luxon

# [3.2.0](https://github.com/finnair/v-validation/compare/v3.1.0...v3.2.0) (2022-10-25)

### Features

- setZone method for date-time types ([#84](https://github.com/finnair/v-validation/issues/84)) ([2c01855](https://github.com/finnair/v-validation/commit/2c01855c1541ecd7ad7ea5f8174b2d757400bd15))

# [3.1.0](https://github.com/finnair/v-validation/compare/v3.0.0...v3.1.0) (2022-10-24)

### Features

- LocalDateTimeLuxon (a date-time without timezone) ([#83](https://github.com/finnair/v-validation/issues/83)) ([1517c6e](https://github.com/finnair/v-validation/commit/1517c6ec8af835cb928cd6cf228b9bdc9f0cda3e))

# [3.0.0](https://github.com/finnair/v-validation/compare/v2.0.0...v3.0.0) (2022-10-03)

### Features

- Optimize performance.
- Use Object.freeze to ensure Validator immutability.

### BREAKING CHANGES

- LuxonValidator class instead of validateLuxon function.

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

**Note:** Version bump only for package @finnair/v-validation-luxon

# [1.1.0-alpha.8](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.7...v1.1.0-alpha.8) (2022-08-19)

**Note:** Version bump only for package @finnair/v-validation-luxon

# [1.1.0-alpha.7](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.6...v1.1.0-alpha.7) (2022-08-18)

**Note:** Version bump only for package @finnair/v-validation-luxon

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

**Note:** Version bump only for package @finnair/v-validation-luxon

# [1.1.0-alpha.3](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.2...v1.1.0-alpha.3) (2022-08-15)

**Note:** Version bump only for package @finnair/v-validation-luxon

# [1.1.0-alpha.2](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.1...v1.1.0-alpha.2) (2022-08-12)

### Bug Fixes

- Fix exports ([c4c42f7](https://github.com/finnair/v-validation/commit/c4c42f715e8c52b29b76f7f07753f632528a69ab))

# [1.1.0-alpha.1](https://github.com/finnair/v-validation/compare/v1.1.0-alpha.0...v1.1.0-alpha.1) (2022-08-12)

### Features

- fromISO helper for Luxon wrapper construction ([187796e](https://github.com/finnair/v-validation/commit/187796e707f44033d94943ef64d48626317b4d80))

# [1.1.0-alpha.0](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.0) (2022-08-12)

### Features

- Support for Luxon ([6f982df](https://github.com/finnair/v-validation/commit/6f982df9b55395e953069914c93fef677dec171e))
