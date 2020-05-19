import { Validator, ValidationContext, ValidationResult, isNullOrUndefined, defaultViolations, isString, TypeMismatch } from '@finnair/v-validation';
import { Path } from '@finnair/path';
import moment, { Moment, MomentInput } from 'moment';

export class MomentValidator extends Validator {
  constructor(public readonly type: string, public readonly parse: (value?: MomentInput | Moment) => Moment) {
    super();
  }
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if (isString(value) || moment.isMoment(value)) {
      const convertedValue = this.parse(value);
      if (convertedValue.isValid()) {
        return ctx.success(convertedValue);
      }
    }
    return ctx.failure(defaultViolations.date(value, path, this.type), value);
  }
}

const durationPattern = /^P(?!$)(\d+(?:\.\d+)?Y)?(\d+(?:\.\d+)?M)?(\d+(?:\.\d+)?W)?(\d+(?:\.\d+)?D)?(T(?=\d)(\d+(?:\.\d+)?H)?(\d+(?:\.\d+)?M)?(\d+(?:\.\d+)?S)?)?$/;
export class DurationValidator extends Validator {
  async validatePath(value: any, path: Path, ctx: ValidationContext): Promise<ValidationResult> {
    if (isNullOrUndefined(value)) {
      return ctx.failure(defaultViolations.notNull(path), value);
    }
    if ((isString(value) && durationPattern.test(value)) || moment.isDuration(value)) {
      value = moment.duration(value);
      if (value.isValid()) {
        return ctx.success(value);
      }
    }
    return ctx.failure(new TypeMismatch(path, 'Duration', value), value);
  }
}

function maybeDateFormat(value?: MomentInput | Moment, dateFormat?: string) {
  return isString(value) ? dateFormat : undefined;
}

const dateFormat = 'YYYY-MM-DD';
export function dateMoment(value?: MomentInput | Moment) {
  return Object.setPrototypeOf(moment(value, maybeDateFormat(value, dateFormat), true), dateMoment.prototype);
}
Object.setPrototypeOf(dateMoment.prototype, moment.prototype);
Object.setPrototypeOf(dateMoment, moment);
dateMoment.prototype.toJSON = function toJSON() {
  return this.format(dateFormat);
};
dateMoment.prototype.clone = function clone() {
  return dateMoment(this);
};

export function dateUtcMoment(value?: MomentInput | Moment) {
  return Object.setPrototypeOf(moment.utc(value, maybeDateFormat(value, dateFormat), true), dateUtcMoment.prototype);
}
Object.setPrototypeOf(dateUtcMoment.prototype, moment.prototype);
Object.setPrototypeOf(dateUtcMoment, moment);
dateUtcMoment.prototype.toJSON = function toJSON() {
  return this.format(dateFormat);
};
dateUtcMoment.prototype.clone = function clone() {
  return dateUtcMoment(this);
};

const dateTimeFormat = 'YYYY-MM-DDTHH:mm:ss';
const dateTimeFormatTz = dateTimeFormat + 'Z';
export function dateTimeMoment(value?: MomentInput | Moment) {
  return Object.setPrototypeOf(moment.parseZone(value, maybeDateFormat(value, dateTimeFormatTz), true), dateTimeMoment.prototype);
}
Object.setPrototypeOf(dateTimeMoment.prototype, moment.prototype);
Object.setPrototypeOf(dateTimeMoment, moment);
dateTimeMoment.prototype.toJSON = function toJSON() {
  if (this.utcOffset() === 0) {
    return this.format(dateTimeFormat) + 'Z';
  }
  return this.format(dateTimeFormatTz);
};
dateTimeMoment.prototype.clone = function clone() {
  return dateTimeMoment(this);
};

export function dateTimeUtcMoment(value?: MomentInput | Moment) {
  return Object.setPrototypeOf(moment.utc(value, maybeDateFormat(value, dateTimeFormatTz), true), dateTimeUtcMoment.prototype);
}
Object.setPrototypeOf(dateTimeUtcMoment.prototype, moment.prototype);
Object.setPrototypeOf(dateTimeUtcMoment, moment);
dateTimeUtcMoment.prototype.toJSON = function toJSON() {
  return this.format(dateTimeFormat) + 'Z';
};
dateTimeUtcMoment.prototype.clone = function clone() {
  return dateTimeUtcMoment(this);
};
dateTimeUtcMoment.prototype.utcOffset = function utcOffset(offset?: number) {
  if (offset === undefined) {
    return moment.prototype.utcOffset.call(this);
  }
  const copy = dateTimeMoment(this);
  copy.utcOffset(offset);
  return copy;
};

const dateTimeMillisFormat = 'YYYY-MM-DDTHH:mm:ss.SSS';
const dateTimeMillisFormatTz = dateTimeMillisFormat + 'Z';
export function dateTimeMillisMoment(value?: MomentInput | Moment) {
  return Object.setPrototypeOf(moment.parseZone(value, maybeDateFormat(value, dateTimeMillisFormatTz), true), dateTimeMillisMoment.prototype);
}
Object.setPrototypeOf(dateTimeMillisMoment.prototype, moment.prototype);
Object.setPrototypeOf(dateTimeMillisMoment, moment);
dateTimeMillisMoment.prototype.toJSON = function toJSON() {
  if (this.utcOffset() === 0) {
    return this.format(dateTimeMillisFormat) + 'Z';
  }
  return this.format(dateTimeMillisFormatTz);
};
dateTimeMillisMoment.prototype.clone = function clone() {
  return dateTimeMillisMoment(this);
};

export function dateTimeMillisUtcMoment(value?: MomentInput | Moment) {
  return Object.setPrototypeOf(moment.utc(value, maybeDateFormat(value, dateTimeMillisFormatTz), true), dateTimeMillisUtcMoment.prototype);
}
Object.setPrototypeOf(dateTimeMillisUtcMoment.prototype, moment.prototype);
Object.setPrototypeOf(dateTimeMillisUtcMoment, moment);
dateTimeMillisUtcMoment.prototype.toJSON = function toJSON() {
  return this.format(dateTimeMillisFormat) + 'Z';
};
dateTimeMillisUtcMoment.prototype.clone = function clone() {
  return dateTimeMillisUtcMoment(this);
};
dateTimeMillisUtcMoment.prototype.utcOffset = function utcOffset(offset?: number) {
  if (offset === undefined) {
    return moment.prototype.utcOffset.call(this);
  }
  const copy = dateTimeMillisMoment(this);
  copy.utcOffset(offset);
  return copy;
};

const timeFormat = 'HH:mm:ss';
export function timeMoment(value?: MomentInput | Moment) {
  return Object.setPrototypeOf(moment.parseZone(value, maybeDateFormat(value, timeFormat), true), timeMoment.prototype);
}
Object.setPrototypeOf(timeMoment.prototype, moment.prototype);
Object.setPrototypeOf(timeMoment, moment);
timeMoment.prototype.toJSON = function toJSON() {
  return this.format(timeFormat);
};
timeMoment.prototype.clone = function clone() {
  return timeMoment(this);
};

const dateValidator = new MomentValidator('Date', dateMoment),
  dateUtcValidator = new MomentValidator('Date', dateUtcMoment),
  dateTimeValidator = new MomentValidator('DateTime', dateTimeMoment),
  dateTimeUtcValidator = new MomentValidator('DateTime', dateTimeUtcMoment),
  dateTimeMillisValidator = new MomentValidator('DateTimeMillis', dateTimeMillisMoment),
  dateTimeMillisUtcValidator = new MomentValidator('DateTimeMillis', dateTimeMillisUtcMoment),
  timeValidator = new MomentValidator('Time', timeMoment),
  durationValidator = new DurationValidator();

export const Vmoment = {
  date: () => dateValidator,
  dateUtc: () => dateUtcValidator,
  dateTime: () => dateTimeValidator,
  dateTimeUtc: () => dateTimeUtcValidator,
  dateTimeMillis: () => dateTimeMillisValidator,
  dateTimeMillisUtc: () => dateTimeMillisUtcValidator,
  time: () => timeValidator,
  duration: () => durationValidator,
};
