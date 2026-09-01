/*
 * Worked example. Generates its own synthetic data, so it runs with no setup:
 *
 *   yarn bench example
 *
 * The point of this case is to show how much the gain depends on the data. Most of the
 * `propertyOrder` win comes from optional properties being *absent*, so vary the presence rate
 * and watch `rel` move:
 *
 *   OPTIONAL_PRESENCE=0.1 yarn bench example    # sparse  - propertyOrder pays off most
 *   OPTIONAL_PRESENCE=0.9 yarn bench example    # dense   - little left to skip
 *
 * Copy this file to make your own case: point `data()` at your real inputs and `variants` at the
 * validators you want to compare.
 */
import { V } from '@finnair/v-validation';

const COUNT = Number(process.env.COUNT ?? 100_000);
const OPTIONAL_PRESENCE = Number(process.env.OPTIONAL_PRESENCE ?? 0.35);

const Status = { ACTIVE: 'ACTIVE', PENDING: 'PENDING', CLOSED: 'CLOSED' };
const Category = { A: 'A', B: 'B', C: 'C', D: 'D' };

const REQUIRED = ['id', 'name', 'status', 'category'];
const OPTIONAL_STRINGS = ['ref1', 'ref2', 'ref3', 'ref4', 'ref5', 'ref6', 'ref7', 'ref8'];
const OPTIONAL_NUMBERS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
const OPTIONAL_ENUMS = ['e1', 'e2', 'e3'];
const OPTIONAL_PATTERNS = ['p1', 'p2', 'p3'];

const properties = () => {
  const model = {
    id: V.string(),
    name: V.string(),
    status: V.enum(Status, 'Status'),
    category: V.enum(Category, 'Category'),
  };
  for (const key of OPTIONAL_STRINGS) model[key] = V.optionalStrict(V.string());
  for (const key of OPTIONAL_NUMBERS) model[key] = V.optionalStrict(V.number());
  for (const key of OPTIONAL_ENUMS) model[key] = V.optionalStrict(V.enum(Category, 'Category'));
  for (const key of OPTIONAL_PATTERNS) model[key] = V.optionalStrict(V.pattern(/^\d{4}-\d{2}$/));
  return model;
};

/** Deterministic PRNG - every repetition must see byte-identical input. */
const prng = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export default {
  name: `example (${COUNT.toLocaleString('en-US')} records, optional presence ${OPTIONAL_PRESENCE})`,

  data() {
    const statuses = Object.keys(Status);
    const categories = Object.keys(Category);
    const records = [];
    for (let i = 0; i < COUNT; i++) {
      const random = prng(i * 2654435761);
      const record = {
        id: `id-${i}`,
        name: `name-${i}`,
        status: statuses[i % statuses.length],
        category: categories[i % categories.length],
      };
      for (const key of OPTIONAL_STRINGS) if (random() < OPTIONAL_PRESENCE) record[key] = `${key}-${i}`;
      for (const key of OPTIONAL_NUMBERS) if (random() < OPTIONAL_PRESENCE) record[key] = i % 1000;
      for (const key of OPTIONAL_ENUMS) if (random() < OPTIONAL_PRESENCE) record[key] = categories[i % categories.length];
      for (const key of OPTIONAL_PATTERNS) if (random() < OPTIONAL_PRESENCE) record[key] = '2026-05';
      records.push(record);
    }
    return records;
  },

  variants: {
    'no propertyOrder': () => V.objectType().properties(properties()).build(),

    'propertyOrder([])': () => V.objectType().properties(properties()).propertyOrder([]).build(),

    // Required properties first, optional ones left out, so missing optionals are skipped
    // while the output keeps a stable, declared order.
    'propertyOrder(required)': () => V.objectType().properties(properties()).propertyOrder(REQUIRED).build(),
  },
};
