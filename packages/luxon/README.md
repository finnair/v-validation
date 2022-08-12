[![npm version](https://badge.fury.io/js/%40finnair%2Fv-validation-luxon.svg)](https://badge.fury.io/js/%40finnair%2Fv-validation-luxon)

# v-validation-luxon

`@finnair/v-validation-luxon` is an extension to `@finnair/v-validation`.

`Vluxon` extension uses custom wrapper types for Luxon DateTime to support full JSON roundtrip with strict validation.

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

`validateLuxon` functions can be used to build custom DateTime validators/converters
by supplying a RegExp pattern and a wrapper class (subclass of LuxonDateTime).
The wrapper class should guarantee proper `toJSON()` and other required properties
for the type (e.g. timezone handling).

Time zone 00:00 is serialized as `Z`.

| Vluxon .          | Format                     | Description                                            |
| ----------------- | -------------------------- | ------------------------------------------------------ |
| date              | `YYYY-MM-DD`               | Local date.                                            |
| dateUtc           | `YYYY-MM-DD`               | Date in UTC time zone.                                 |
| dateTime          | `YYYY-MM-DDTHH:mm:ssZ`     | Date and time in local (parsed) time zone.             |
| dateTimeUtc       | `YYYY-MM-DDTHH:mm:ssZ`     | Date and time in UTC time zone.                        |
| dateTimeMillis    | `YYYY-MM-DDTHH:mm:ss.SSSZ` | Date and time with millis in local (parsed) time zone. |
| dateTimeMillisUtc | `YYYY-MM-DDTHH:mm:ss.SSSZ` | Date and time with millis in UTC time zone.            |
| time              | `HH:mm:ss`                 | Local time.                                            |
| duration          | ISO 8601 Duration          | Luxon `Duration` with pattern validation.              |
