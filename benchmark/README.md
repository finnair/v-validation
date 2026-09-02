# Benchmark scaffold

Measures validation throughput and memory for validators and data **you** supply. Nothing in here
carries a dataset: a case file names your model and points at your inputs, and both can be kept out
of version control.

Build first, since cases import the published entry points rather than `src`:

```bash
yarn build
yarn bench example
```

## Why measure your own data

The gain from v11, and from `propertyOrder` in particular, depends heavily on the shape of your data
and rules. `propertyOrder` skips validation of optional properties that are *absent*, so the payoff
is roughly proportional to how many of them actually are. The bundled example makes this visible -
same validator, same record count, only the share of optional properties present changes:

| optional presence | `propertyOrder([])` vs none |
| ----------------- | --------------------------- |
| 0.10              | 3.70x                       |
| 0.50              | 2.03x                       |
| 0.95              | 1.07x                       |

```bash
OPTIONAL_PRESENCE=0.1  yarn bench example
OPTIONAL_PRESENCE=0.95 yarn bench example
```

Anything that converts rather than checks - date parsing, custom mappers - is largely unchanged
between versions, so the more of your time goes there, the smaller the ratio you will see.

## Writing a case

A case default-exports a `data()` function and a map of named validator variants:

```js
// benchmark/cases/my-rules.local.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { V } from '@finnair/v-validation';

const caseDir = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.MY_DATA ?? resolve(caseDir, 'my-rules.jsonl');

const properties = () => ({ /* ...your model... */ });

export default {
  name: 'my-rules',

  // Called inside the measured process, before the clock and the memory baseline.
  // Return (or resolve) an array of inputs.
  data() {
    let raw;
    try {
      raw = readFileSync(DATA, 'utf8');
    } catch (error) {
      throw new Error(`could not read ${DATA} - set MY_DATA to its location (${error.message})`);
    }
    return raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  },

  // Each variant is a factory, so the validator is built inside the measured process too.
  variants: {
    'no propertyOrder': () => V.objectType().properties(properties()).build(),
    'propertyOrder([])': () => V.objectType().properties(properties()).propertyOrder([]).build(),
  },
};
```

```bash
yarn bench my-rules.local                          # data beside the case
MY_DATA=/data/rules.jsonl yarn bench my-rules.local # or anywhere else
```

`yarn bench <case>` resolves `<case>` as a path first, then as a name under `benchmark/cases/`.

### Where the files go

**The case file has to live under `benchmark/cases/`.** This is a module-resolution constraint, not a
preference: Node looks for `node_modules` upwards from the case file's own location, so a case parked
elsewhere on disk cannot `import { V } from '@finnair/v-validation'` and dies with
`ERR_MODULE_NOT_FOUND`.

**The data can live wherever you like, including right beside the case.** Resolving it relative to
the case file (as above) makes `yarn bench my-rules.local` work with no environment variable, and an
env override lets a shared dataset live outside the repo if you prefer.

**Nothing in `benchmark/cases/` is committed unless it is explicitly allowed.** That directory has
its own `.gitignore` which ignores everything and then re-admits only `example.js`, so a model or a
dataset dropped there is invisible to git whatever it is called or however it is encoded - no
reliance on getting a suffix right. To commit a case that is genuinely shareable, add a matching
`!my-case.js` line to `benchmark/cases/.gitignore`.

The `.local` suffix in `my-rules.local.js` is therefore a readability convention, not the safety
mechanism: it marks at a glance which cases are private. `git check-ignore -v <file>` confirms any
individual file if you want to be sure.

Keep `data()` deterministic. Every repetition runs in a fresh process and calls it again, so
`Math.random()` without a fixed seed makes repetitions incomparable - see the seeded PRNG in
`cases/example.js`.

## Options

| Flag             | Default  | Meaning                                                              |
| ---------------- | -------- | -------------------------------------------------------------------- |
| `--reps N`       | `3`      | Repetitions per variant, each in a fresh process. Tables show medians |
| `--shape rows`   | `rows`   | One `validate()` call per input                                      |
| `--shape array`  |          | One `V.array(validator).validate(inputs)` call for the whole dataset  |
| `--mode retain`  | `retain` | Keep every converted value, so `retained` measures what output costs  |
| `--mode discard` |          | Drop results - isolates transient allocation from output size         |
| `--limit N`      | all      | Use only the first N inputs                                          |
| `--batch N`      | `1000`   | Inputs per event-loop yield (`--shape rows` only)                    |
| `--json`         | off      | Machine-readable output, including every repetition                   |

### `--shape` matters more than anything else

Pick the shape that matches how you actually call the library, because the two are not small
variations on each other.

With `--shape rows` every input costs one `validate()` call, so one Promise and one `await` turn per
input. That overhead is identical in every version, and on a fast validator it is a large share of
the total - which flattens differences between versions and between variants.

With `--shape array` the whole dataset goes through a single `V.array(...)` call: one Promise for
the lot. This is what the v11 callback architecture targets, and it is where the difference shows.
On ~126K MCT rules, v10.2.1 vs v11 measured 1.4x row-by-row but 3.4x as an array; peak heap went
from 2.3 GB to 157 MB, because the old architecture kept a Promise per property alive for every
row simultaneously.

Two things not to read across shapes:

- **`peak heap`** in `--shape array` is a lower bound. The single call blocks the event loop, so
  memory cannot be sampled during it and the figure is taken immediately afterwards.
- **`gc` counts** are not comparable between shapes at all. A blocked event loop yields roughly the
  same small number of collections whatever the version, so `gc` only tells you something within a
  shape - it is a useful churn signal in `--shape rows` and near-meaningless in `--shape array`.

`retained` is unaffected: the same validated values are produced either way.

## Reading the output

```
variant                       ms       ops/s      rel   peak heap   peak rss   retained     gc   gc ms
------------------------------------------------------------------------------------------------------
no propertyOrder             212      94,272    1.00x     42.5 MB   135.3 MB       7 MB     29      30
propertyOrder([])             92     216,399    2.30x     17.1 MB   105.3 MB     6.4 MB     22      27
```

- **rel** - relative to the first variant, which is the intended baseline. Order your variants
  accordingly. It compares variants within one run, so unless a case deliberately imports two
  releases (see below) this is not a version comparison.
- **retained** - heap still held after a forced GC with the converted values referenced. In
  `--mode retain` this is what your validated output costs to keep; in `--mode discard` nothing is
  kept, so it reads `n/a`.
- **peak heap** - highest `heapUsed` above the post-baseline reading. In `--shape rows` it is
  sampled at batch boundaries; in `--shape array` see the note above. Read it together with **gc**:
  fewer collections let the young generation fill further, so a slightly higher peak alongside far
  fewer GCs means less pressure, not more demand.
- **gc / gc ms** - collections and total pause time during the run, mostly scavenges.

Validation failures are reported as a warning and make the numbers incomparable - failing inputs
take a different path, constructing violations - so fix the case or the data before reading them.

## What is and is not measured

Loading and parsing input, and building the validator, both happen before the clock starts and
before the memory baseline is taken. Only `validate()` calls are timed - one per input in
`--shape rows`, exactly one in `--shape array`. Everything goes through the public API, and the
calling pattern is identical for every variant in a run.

Each repetition is a fresh process, so JIT state and heap growth do not leak between variants.
Medians are reported; the raw per-repetition timings are printed underneath, and a wide spread there
is your signal that the machine was too noisy to trust the run.

## Comparing against a different release

The scaffold compares variants inside one process, so a cross-version comparison needs both releases
importable at once. Install the old one under an alias:

```bash
npm install --no-save "v10@npm:@finnair/v-validation@10.2.1"
```

```js
import { V as V11 } from '@finnair/v-validation';
import { V as V10 } from 'v10';
```

Note the `<alias>@npm:<package>@<version>` form - `v10:@finnair/...` is rejected as an invalid
package name. Be aware this adds a dependency to the workspace root, which is why the measurements
quoted above were taken differently: two throwaway directories outside the repo, one with
`@finnair/v-validation@10.2.1` from npm and one with `yarn pack` tarballs of the local packages, each
running the same script. That keeps the workspace untouched and guarantees the two builds cannot
share hoisted dependencies.

Whichever way you do it, a validator built with a different release of a companion package (for
example `@finnair/v-validation-luxon`) brings that package's changes into the comparison too. To
attribute a difference to core alone, substitute a plain `V.string()` for such converting validators
in both variants - `cases/example.js` has no such dependency, and the MCT case does this behind
`DATES=string`.
