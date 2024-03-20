# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [5.3.0](https://github.com/finnair/v-validation/compare/v5.2.0...v5.3.0) (2024-03-20)

**Note:** Version bump only for package @finnair/v-validation-moment

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

**Note:** Version bump only for package @finnair/v-validation-moment

# [5.0.0](https://github.com/finnair/v-validation/compare/v4.3.0...v5.0.0) (2023-10-13)

### Features

- use ECMAScript modules (ESM) instead of CommonJS ([#95](https://github.com/finnair/v-validation/issues/95)) ([92e9118](https://github.com/finnair/v-validation/commit/92e9118235957ec4bc2bcf2de73e195ea940378c))

# [5.0.0](https://github.com/finnair/v-validation/compare/v4.3.0...v5.0.0) (2023-10-13)

### Features

- use ECMAScript modules (ESM) instead of CommonJS ([#95](https://github.com/finnair/v-validation/issues/95)) ([92e9118](https://github.com/finnair/v-validation/commit/92e9118235957ec4bc2bcf2de73e195ea940378c))

# [4.3.0](https://github.com/finnair/v-validation/compare/v4.2.0...v4.3.0) (2023-10-03)

**Note:** Version bump only for package @finnair/v-validation-moment

# [4.1.0](https://github.com/finnair/v-validation/compare/v4.0.0...v4.1.0) (2022-11-22)

**Note:** Version bump only for package @finnair/v-validation-moment

# [4.0.0](https://github.com/finnair/v-validation/compare/v3.2.0...v4.0.0) (2022-11-07)

**Note:** Version bump only for package @finnair/v-validation-moment

# [3.1.0](https://github.com/finnair/v-validation/compare/v3.0.0...v3.1.0) (2022-10-24)

**Note:** Version bump only for package @finnair/v-validation-moment

# [3.0.0](https://github.com/finnair/v-validation/compare/v2.0.0...v3.0.0) (2022-10-03)

### Features

- Use Object.freeze to ensure Validator immutability.

# [2.0.0](https://github.com/finnair/v-validation/compare/v1.1.0...v2.0.0) (2022-09-08)

**Note:** Version bump only for package @finnair/v-validation-moment

# [1.1.0](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0) (2022-08-29)

### Features

- Support for Luxon ([94b3806](https://github.com/finnair/v-validation/commit/94b38060e07feeb0abb8c81659d8bda537a4d9aa))

# [1.1.0-alpha.6](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.6) (2022-08-17)

### Features

- Support for Luxon ([00d0a8e](https://github.com/finnair/v-validation/commit/00d0a8e8c8de46bfeb3502f51bb8cd5a3627070e))

# [1.1.0-alpha.5](https://github.com/finnair/v-validation/compare/v1.0.1...v1.1.0-alpha.5) (2022-08-16)

### Features

- Support for Luxon ([6a243f0](https://github.com/finnair/v-validation/commit/6a243f043db2ca6700180eb758a08d8edfe1e538))

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

**Note:** Version bump only for package @finnair/v-validation-moment

# [0.9.0](https://github.com/finnair/v-validation/compare/v0.8.0...v0.9.0) (2020-09-23)

**Note:** Version bump only for package @finnair/v-validation-moment

# [0.8.0](https://github.com/finnair/v-validation/compare/v0.7.0...v0.8.0) (2020-09-09)

**Note:** Version bump only for package @finnair/v-validation-moment

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

# [0.5.0](https://github.com/finnair/v-validation/compare/v0.4.0...v0.5.0) (2020-05-19)

Publish failed.

# [0.4.0](https://github.com/finnair/v-validation/compare/v0.3.0...v0.4.0) (2020-04-21)

**Note:** Version bump only for package @finnair/v-validation-moment

# [0.3.0](https://github.com/finnair/v-validation/compare/v0.2.0...v0.3.0) (2020-04-16)

**Note:** Version bump only for package @finnair/v-validation-moment

# [0.2.0](https://github.com/finnair/v-validation/compare/v0.1.4...v0.2.0) (2020-04-15)

**Note:** Version bump only for package @finnair/v-validation-moment

## [0.1.4](https://github.com/finnair/v-validation/compare/v0.1.3...v0.1.4) (2020-04-01)

**Note:** Version bump only for package @finnair/v-validation-moment
