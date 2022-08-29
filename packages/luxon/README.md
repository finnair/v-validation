[![npm version](https://badge.fury.io/js/%40finnair%2Fv-validation-luxon.svg)](https://badge.fury.io/js/%40finnair%2Fv-validation-luxon)

# v-validation-luxon

`@finnair/v-validation-luxon` is an extension to `@finnair/v-validation`.

`Vluxon` extension provides custom wrapper types for Luxon DateTime to support full JSON roundtrip with strict validation.
Also plain DateTime validators are provided and custom formats are easy to define (see the code for examples).

[Documentation for `v-validation`](https://github.com/finnair/v-validation).

## Getting Started

Install v-validation using [`yarn`](https://yarnpkg.com/en/package/jest):

```bash
yarn add @finnair/v-validation-luxon
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/v-validation-luxon
```

## Vluxon

Vluxon contains both plain DateTime validators and also validators that return
DateTime wrappers that guarantee some normalizations (zone, date and/or time) and
especially JSON serialization in the given format. The wrappers are immutable and
they allow easy access to the DateTime instance for further processing.
`validateLuxon` function can be used to build custom DateTime validators/converters
by supplying a RegExp pattern and a parser function.

## Supported DateTime Wrapper Types

| Class                  | Description                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| LuxonDateTime          | Abstract base class for the wrappers.                                                                       |
| LocalDateLuxon         | Input and JSON output in `yyyy-MM-dd` format. Time normalized to midnight UTC.                              |
| LocalTimeLuxon         | Input and JSON output in `HH:mm:ss` format. Date normalized to 1970-01-01 UTC (Unix Epoch).                 |
| DateTimeLuxon          | Input and JSON output in `yyyy-MM-ddTHH:mm:ssZ` format in local/given/parsed zone with milliseconcs zeroed. |
| DateTimeUtcLuxon       | Input and JSON output in `yyyy-MM-ddTHH:mm:ssZ` format in UTC zone with milliseconcs zeroed.                |
| DateTimeMillisLuxon    | Input and JSON output in `yyyy-MM-ddTHH:mm:ss.SSSZ` format in local/given/parsed zone.                      |
| DateTimeMillisUtcLuxon | Input and JSON output in `yyyy-MM-ddTHH:mm:ss.SSSZ` format in UTC zone.                                     |

### Constructors

Wrapper types may be constructed with `new` from DateTime instance, but there are also shortcuts:

| Static Method                                                          | Description                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `now()`                                                                | Current time in `DateTime*` types                               |
| `nowUtc()`                                                             | Current UTC time in `Local*` types                              |
| `nowLocal(options?: DateTimeJSOptions)`                                | Current local time in `Local*` types (defaults to system zone). |
| `fromISO(value: string, options?: DateTimeOptions)`                    | Parse from ISO format (see Luxon `DateTime.fromISO`).           |
| `fromFormat(value: string, format: string, options?: DateTimeOptions)` | Parse from custom format (see Luxon `DateTime.fromFormat`).     |
| `fromJSDate(date: Date, options?: { zone?: string \| Zone })`          | From JavaScript Date object (see Luxon `DateTime.fromJSDate`).  |
| `fromMillis(millis: number, options?: DateTimeJSOptions)`              | From Unix millis timestamp (see Luxon `DateTime.fromMillis`).   |

### Instance Methods

Wrappers are meant to be as thin as possible with most of the DateTime functionality accessed directly from the wrapped
DateTime instance which is public readonly fiedl. However there are a few convenience methods for working with the wrapper types:

| Method                                       | Description                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `as(type)`                                   | Conversion to the given type that extends LuxonDateTime. Note that the conversion is not guaranted to be lossless. |
| `wrap(fn: (dateTime: DateTime) => DateTime)` | Executes the given function on the wrapped DateTime and rewraps the result.                                        |
| `apply<R>(fn: (dateTime: DateTime) => R): R` | Executes the given function on the wrapped DateTime and returns the result as it is.                               |
| `valueOf()`                                  | Conversion to millis. This allows comparing wrapper types directly using `==`, `<`, `>`, `<=` or `>=`.             |
| `equals(other: any)`                         | Type-aware equality.                                                                                               |
| `toJSON()`                                   | Type-specific serialization (string).                                                                              |

## Build-in Validators

| Vluxon.             | Format                     | Description                                               |
| ------------------- | -------------------------- | --------------------------------------------------------- |
| localDate           | `yyyy-MM-dd`               | Local date (time normalized to midninght UTC).            |
| localTime           | `HH:mm:ss`                 | Local time (date normalized to 1970-01-01).               |
| dateTime            | `yyyy-MM-ddTHH:mm:ssZ`     | Date and time in local (parsed) time zone.                |
| dateTimeUtc         | `yyyy-MM-ddTHH:mm:ssZ`     | Date and time in UTC time zone.                           |
| dateTimeMillis      | `yyyy-MM-ddTHH:mm:ss.SSSZ` | Date and time with millis in local (parsed) time zone.    |
| dateTimeMillisUtc   | `yyyy-MM-ddTHH:mm:ss.SSSZ` | Date and time with millis in UTC time zone.               |
| dateTimeFromISO     | Any ISO                    | Plain Luxon DateTime from ISO format.                     |
| dateTimeFromRFC2822 | RFC2822                    | Plain Luxon DateTime from RFC2822 format.                 |
| dateTimeFromHTTP    | HTTP date-time             | Plain Luxon DateTime from HTTP format.                    |
| dateTimeFromSQL     | SQL date-time              | Plain Luxon DateTime from SQL format.                     |
| dateTimeFromSeconds | Unix timestamp (number)    | Plain Luxon DateTime from Unix timestamp in seconds.      |
| dateTimeFromMillis  | Unix timestamp (number)    | Plain Luxon DateTime from Unix timestamp in milliseconds. |
| duration            | ISO 8601 Duration          | Luxon `Duration` with pattern validation.                 |
