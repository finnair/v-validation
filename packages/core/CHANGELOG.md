# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.0.0](https://github.com/finnair/v-validation/compare/v0.9.1...v1.0.0) (2022-01-20)

**Note:** Version bump only for package @finnair/v-validation





## [0.9.1](https://github.com/finnair/v-validation/compare/v0.9.0...v0.9.1) (2020-12-07)


### Bug Fixes

* Bumped deep-equal from 2.0.3 to 2.0.5 ([#54](https://github.com/finnair/v-validation/issues/54)) ([159fd62](https://github.com/finnair/v-validation/commit/159fd62fd3efc09d11903fcaa1f01e7123f56f35))





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
