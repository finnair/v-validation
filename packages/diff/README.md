![CI](https://github.com/finnair/v-validation/workflows/CI/badge.svg?branch=master)
[![codecov](https://codecov.io/gh/finnair/v-validation/branch/master/graph/badge.svg)](https://codecov.io/gh/finnair/v-validation)
[![npm version](https://badge.fury.io/js/%40finnair%2Fv-validation.svg)](https://badge.fury.io/js/%40finnair%2Fv-validation)

# Diff & VersionInfo

`@finnair/diff` library offers paths and values (Map<Path, any>) based configurable object difference utility. Use `Diff` class to analyze differences of two objects, or `Versioninfo` to compare and transform two versions of the same object. 

`Diff` supports only primitive, array and plain object values.

JSON serialization of `VersionInfo` offers nice representation of the new version (`current`) with `changedPaths` and configurable set of old values (`previous`). Old values are useful for example in cases where natural identifier of an object changes and the old identifier is needed for targeting an update. `VersionInfo` is great for change based triggers configurable by a [`PathMatcher`](../path/README.md).

## Getting Started

Install v-validation using [`yarn`](https://yarnpkg.com):

```bash
yarn add @finnair/diff
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/diff
```

## Features

### Changeset 

`Diff.changeset<T>(a:T, b: T)` analyzes changes between `a` and `b` and returns a Map<string, Change> of changed paths to `Change` objects. A `Change` object contains a `path` (as Path), `oldValue` and `newValue`. Changeset can be used to patch/revert changes with `Path.set`: 
```ts
const diff = new Diff();
const a = {...};
const b = {...};
// patch a into b - for revert, use set change.oldValue
diff.changeset(a, b).forEach((change) => change.path.set(a, change.newValue));
```

### Change Triggering

`VersionInfo.matches` and `matchesAny` can be used to trigger functionality based on what has changed. Use `PathMatcher` to specify paths of interest. 

### Filtering

`Diff` has a configurable filter that can be used to include/exclude properties/values. This can be used to for example exclude metadata fields from changeset. The default filter excludes `undefined` values. 

### Mapping/Transforming 

`VersionInfo` supports both sync and async transformations. Both old and new values are transformed and the resulting `VersionInfo` reflects the changes of transformed objects. This helps in conversions from internal to external model. 

### Nice JSON

`VersionInfo` is designed to be serialized as JSON. It contains the `current` value, `changedPaths` and configurable old values as `previous`. Only matching previous values are included and only if they have changed.
