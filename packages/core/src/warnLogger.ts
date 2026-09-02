import { Path } from '@finnair/path';
import { Violation, WarnLogger } from './validators.js';

/**
 * Returns `path` as a string with all array indices replaced by `*`, e.g.
 * `$.items[3].newProperty` becomes `$.items[*].newProperty`.
 *
 * Elements of an array share the same schema, so an ignored violation reported for one element is
 * the same finding as the one reported for every other element of that array.
 */
export function anyIndexPath(path: Path): string {
  let normalized = '$';
  for (const component of path) {
    normalized += typeof component === 'number' ? '[*]' : Path.componentToString(component);
  }
  return normalized;
}

/**
 * Default identity of an ignored `Violation`: what kind of finding it is and where in the schema
 * it is, with array indices normalized by `anyIndexPath`.
 *
 * `invalidValue` is part of the identity because each unknown enum value is a separate finding
 * (`EnumMismatch`). It is always `undefined` for `UnknownProperty`, where the path alone identifies
 * the new property.
 */
export function warnLoggerKey(violation: Violation): string {
  return `${violation.type} ${anyIndexPath(violation.path)} ${String(violation.invalidValue)}`;
}

/**
 * Wraps `logger` so that each distinct ignored violation is reported only once for the lifetime of
 * the returned function.
 *
 * `warnLogger` exists to tell you about backwards compatible changes in source data - a source
 * system that started sending a new property or a new enum value. That is a small, fixed set of
 * findings, but the same validator keeps meeting the same changed data on every request until the
 * validator is updated, so an undeduplicated logger reports the same finding indefinitely.
 *
 * Create it **once** and reuse it, so that deduplication spans validations:
 *
 * ```typescript
 * const warnLogger = dedupWarnLogger(violation => console.warn('Source data changed:', violation));
 *
 * // per request
 * await validator.validate(input, { ignoreUnknownProperties: true, warnLogger });
 * ```
 *
 * Creating it per validation only deduplicates within that single run, which is rarely the
 * interesting part.
 *
 * The set of reported keys is retained for the lifetime of the returned function. It is bounded by
 * the schema (violation type x normalized path x enum value), not by the amount of data validated.
 * Pass `keyOf` to use a different identity - for example if a custom `ValidationContext` ignores
 * violation types whose `invalidValue` is unbounded.
 *
 * @param logger the logger to forward first occurrences to
 * @param keyOf identity of a violation, `warnLoggerKey` by default
 */
export function dedupWarnLogger(logger: WarnLogger, keyOf: (violation: Violation) => string = warnLoggerKey): WarnLogger {
  const reported = new Set<string>();
  return (violation, options) => {
    const key = keyOf(violation);
    if (!reported.has(key)) {
      reported.add(key);
      logger(violation, options);
    }
  };
}
