/*
 * Measures one variant of one benchmark case, in its own process, and prints a single JSON line.
 * Driven by run.js - see benchmark/README.md. Requires --expose-gc.
 */
import { pathToFileURL } from 'node:url';
import { PerformanceObserver, constants } from 'node:perf_hooks';
import { V } from '@finnair/v-validation';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}

const casePath = args.get('case');
const variantName = args.get('variant');
const mode = args.get('mode') ?? 'retain';
const shape = args.get('shape') ?? 'rows';
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity;
const batch = Number(args.get('batch') ?? 1000);

if (typeof global.gc !== 'function') {
  console.error('measure.js requires --expose-gc');
  process.exit(1);
}

const GC_NAMES = {
  [constants.NODE_PERFORMANCE_GC_MINOR]: 'scavenge',
  [constants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb',
};
let gcRuns = 0;
let gcMs = 0;
const gcKinds = {};
new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    gcRuns++;
    gcMs += entry.duration;
    const kind = GC_NAMES[entry.detail?.kind] ?? String(entry.detail?.kind);
    gcKinds[kind] = (gcKinds[kind] ?? 0) + 1;
  }
}).observe({ entryTypes: ['gc'] });

const mb = bytes => Math.round((bytes / 1048576) * 10) / 10;
const settle = () => new Promise(resolve => setImmediate(resolve));

const benchmarkCase = (await import(pathToFileURL(casePath).href)).default;
const variant = benchmarkCase.variants[variantName];
if (!variant) {
  console.error(`unknown variant "${variantName}" in ${casePath}`);
  process.exit(1);
}

// Input is prepared and the validator built *before* the baseline, so neither is measured.
const all = await benchmarkCase.data();
const input = Number.isFinite(limit) ? all.slice(0, limit) : all;
const validator = await variant();

global.gc();
global.gc();
await settle();
global.gc();
const baseline = process.memoryUsage();
gcRuns = 0;
gcMs = 0;
for (const key of Object.keys(gcKinds)) delete gcKinds[key];

let peakHeap = baseline.heapUsed;
let peakRss = baseline.rss;
let retainedValues = [];
let failures = 0;
let firstViolation;

const sample = () => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > peakHeap) peakHeap = usage.heapUsed;
  if (usage.rss > peakRss) peakRss = usage.rss;
};

const start = process.hrtime.bigint();
if (shape === 'array') {
  // One validate() call for the whole dataset: a single awaited Promise rather than one per row,
  // which is what the internal architecture refactoring actually targets.
  const result = await V.array(validator).validate(input);
  if (result.isSuccess()) {
    if (mode === 'retain') retainedValues = result.getValue();
  } else {
    const violations = result.getViolations();
    failures = violations.length;
    firstViolation = JSON.stringify(violations[0]);
  }
} else {
  for (let i = 0; i < input.length; i += batch) {
    const end = Math.min(i + batch, input.length);
    for (let j = i; j < end; j++) {
      const result = await validator.validate(input[j]);
      if (!result.isSuccess()) {
        failures++;
        firstViolation ??= JSON.stringify(result.getViolations()[0]);
        continue;
      }
      if (mode === 'retain') retainedValues.push(result.getValue());
    }
    // Yield so timers and GC can run, and sample memory at a safe point.
    await settle();
    sample();
  }
}
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

sample();

// Retained: force GC while the converted values are still referenced.
global.gc();
global.gc();
await settle();
global.gc();
const retainedMb = mb(process.memoryUsage().heapUsed - baseline.heapUsed);
const retainedCount = retainedValues.length;

console.log(
  JSON.stringify({
    variant: variantName,
    mode,
    shape,
    inputs: input.length,
    failures,
    firstViolation,
    retainedCount,
    ms: Math.round(elapsedMs),
    opsPerSec: Math.round(input.length / (elapsedMs / 1000)),
    peakHeapDeltaMb: mb(peakHeap - baseline.heapUsed),
    peakRssMb: mb(peakRss),
    retainedMb,
    gcRuns,
    gcMs: Math.round(gcMs),
    gcKinds,
  }),
);
process.exit(0);
