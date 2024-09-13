[![npm version](https://badge.fury.io/js/%40finnair%2Fv-validation-moment.svg)](https://badge.fury.io/js/%40finnair%2Fv-validation-moment)

# v-validation-moment

`@finnair/v-validation-moment` is an extension to `@finnair/v-validation`.

`Vmoment` extension uses custom Moment extensions to support full JSON roundtrip with strict validation.

[Documentation for `v-validation`](https://github.com/finnair/v-validation).

## Getting Started

Install v-validation using [`yarn`](https://yarnpkg.com):

```bash
yarn add @finnair/v-validation-moment
```

Or [`npm`](https://www.npmjs.com/):

```bash
npm install @finnair/v-validation-moment
```

## Vmoment

`MomentValidator` can be used to build custom Moment validators/converters by supplying a parse function. However, Moment instances always serialize to JSON
in full date-time format. `V` supports Moment extensions that requires an exact input format and also serialize to JSON using that same format.

Time zone 00:00 is serialized as `Z`.

| Vmoment.          | Format                     | Description                                             |
| ----------------- | -------------------------- | ------------------------------------------------------- |
| date              | `YYYY-MM-DD`               | Local date.                                             |
| dateUtc           | `YYYY-MM-DD`               | Date in UTC time zone.                                  |
| dateTime          | `YYYY-MM-DDTHH:mm:ssZ`     | Date and time in local (parsed) time zone.              |
| dateTimeUtc       | `YYYY-MM-DDTHH:mm:ssZ`     | Date and time in UTC time zone.                         |
| dateTimeMillis    | `YYYY-MM-DDTHH:mm:ss.SSSZ` |  Date and time with millis in local (parsed) time zone. |
| dateTimeMillisUtc | `YYYY-MM-DDTHH:mm:ss.SSSZ` |  Date and time with millis in UTC time zone.            |
| time              | `HH:mm:ss`                 | Local time.                                             |
| duration          | ISO 8601 Duration          | `moment.duration` with pattern validation.              |
