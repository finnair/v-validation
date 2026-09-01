/*
 * Benchmark driver. Runs every variant of a case in a fresh process, repeatedly, and reports
 * medians. See benchmark/README.md.
 *
 *   node benchmark/run.js <case> [--reps 3] [--shape rows|array] [--mode retain|discard] [--limit N] [--batch 1000] [--json]
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const positional = [];
const flags = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--json') flags.set('json', 'true');
  else if (arg.startsWith('--')) flags.set(arg.slice(2), process.argv[++i]);
  else positional.push(arg);
}

if (positional.length !== 1) {
  console.error('usage: node benchmark/run.js <case> [--reps 3] [--shape rows|array] [--mode retain|discard] [--limit N] [--batch 1000] [--json]');
  console.error('  <case> is a path to a case module, or a name under benchmark/cases/');
  process.exit(1);
}

const casePath = (() => {
  const direct = resolve(process.cwd(), positional[0]);
  if (existsSync(direct)) return direct;
  for (const candidate of [`${positional[0]}.js`, `${positional[0]}.mjs`, positional[0]]) {
    const inCases = resolve(here, 'cases', candidate);
    if (existsSync(inCases)) return inCases;
  }
  console.error(`case not found: ${positional[0]}`);
  process.exit(1);
})();

const reps = Number(flags.get('reps') ?? 3);
const mode = flags.get('mode') ?? 'retain';
const shape = flags.get('shape') ?? 'rows';
const asJson = flags.has('json');

if (!['rows', 'array'].includes(shape)) {
  console.error(`--shape must be "rows" or "array", got "${shape}"`);
  process.exit(1);
}

// Importing the case must be cheap - data() is only called inside the measured process.
const benchmarkCase = (await import(pathToFileURL(casePath).href)).default;
if (!benchmarkCase?.variants || typeof benchmarkCase.data !== 'function') {
  console.error(`${casePath} must default-export { name?, data(), variants: { [name]: () => validator } }`);
  process.exit(1);
}
const variantNames = Object.keys(benchmarkCase.variants);
if (variantNames.length === 0) {
  console.error(`${casePath} defines no variants`);
  process.exit(1);
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const results = [];
for (const variant of variantNames) {
  const runs = [];
  for (let rep = 0; rep < reps; rep++) {
    const argv = ['--expose-gc', resolve(here, 'measure.js'), '--case', casePath, '--variant', variant, '--mode', mode, '--shape', shape];
    if (flags.get('limit')) argv.push('--limit', flags.get('limit'));
    if (flags.get('batch')) argv.push('--batch', flags.get('batch'));
    let stdout;
    try {
      stdout = execFileSync(process.execPath, argv, { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'inherit'] });
    } catch {
      console.error(`\nvariant "${variant}" failed - see the error above`);
      process.exit(1);
    }
    runs.push(JSON.parse(stdout.trim().split('\n').pop()));
    if (!asJson) process.stderr.write('.');
  }
  results.push({
    variant,
    inputs: runs[0].inputs,
    failures: runs[0].failures,
    firstViolation: runs[0].firstViolation,
    ms: median(runs.map(r => r.ms)),
    opsPerSec: median(runs.map(r => r.opsPerSec)),
    peakHeapDeltaMb: median(runs.map(r => r.peakHeapDeltaMb)),
    peakRssMb: median(runs.map(r => r.peakRssMb)),
    retainedMb: median(runs.map(r => r.retainedMb)),
    gcRuns: median(runs.map(r => r.gcRuns)),
    gcMs: median(runs.map(r => r.gcMs)),
    msRuns: runs.map(r => r.ms),
  });
  if (!asJson) process.stderr.write(` ${variant}\n`);
}

if (asJson) {
  console.log(JSON.stringify({ case: benchmarkCase.name ?? casePath, mode, shape, reps, node: process.version, results }, null, 2));
  process.exit(0);
}

const first = results[0];
const columns = [
  { head: 'variant', width: Math.max(7, ...results.map(r => r.variant.length)), align: 'left', value: r => r.variant },
  { head: 'ms', width: 7, value: r => String(r.ms) },
  { head: 'ops/s', width: 10, value: r => r.opsPerSec.toLocaleString('en-US') },
  // Guard against a run too short to register a whole millisecond, which would divide by zero.
  { head: 'rel', width: 7, value: r => (first.ms > 0 && r.ms > 0 ? (first.ms / r.ms).toFixed(2) + 'x' : '-') },
  { head: 'peak heap', width: 10, value: r => r.peakHeapDeltaMb + ' MB' },
  { head: 'peak rss', width: 9, value: r => r.peakRssMb + ' MB' },
  // Only meaningful when results are kept; in discard mode it is noise around zero.
  { head: 'retained', width: 9, value: r => (mode === 'retain' ? r.retainedMb + ' MB' : 'n/a') },
  { head: 'gc', width: 5, value: r => String(r.gcRuns) },
  { head: 'gc ms', width: 6, value: r => String(r.gcMs) },
];
const cell = (text, col) => (col.align === 'left' ? String(text).padEnd(col.width) : String(text).padStart(col.width));

const shapeNote = shape === 'array' ? 'one V.array() call' : 'one validate() call per row';
console.log(`\n${benchmarkCase.name ?? casePath}  -  ${first.inputs.toLocaleString('en-US')} inputs, shape=${shape} (${shapeNote}), mode=${mode}, median of ${reps}, ${process.version}\n`);
console.log(columns.map(c => cell(c.head, c)).join('  '));
console.log('-'.repeat(columns.reduce((sum, c) => sum + c.width + 2, -2)));
for (const result of results) {
  console.log(columns.map(c => cell(c.value(result), c)).join('  '));
}
console.log(`\nraw ms: ${results.map(r => `${r.variant}=[${r.msRuns.join(', ')}]`).join('  ')}`);

const TOO_SHORT_MS = 20;
if (results.some(r => r.ms < TOO_SHORT_MS)) {
  console.log(
    `\nWARNING  a run finished in under ${TOO_SHORT_MS} ms, which is dominated by measurement noise - ` +
      'memory figures may even come out slightly negative. Use more inputs or raise --reps.',
  );
}

const failing = results.filter(r => r.failures > 0);
if (failing.length > 0) {
  console.log('');
  for (const result of failing) {
    console.log(`WARNING  ${result.variant}: ${result.failures} of ${result.inputs} inputs failed validation - first violation ${result.firstViolation}`);
  }
  console.log('Failing inputs take a different code path (violations are constructed), so the numbers above are not comparable to a clean run.');
}
console.log('');
