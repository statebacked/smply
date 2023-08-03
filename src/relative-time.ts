// we "borrow" from jose: https://github.com/panva/jose/blob/main/src/lib/secs.ts

import { InvalidArgumentError } from "commander";

const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const year = day * 365.25;

const REGEX =
  /^([-]?\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)$/i;

const seconds = (str: string): number => {
  const matched = REGEX.exec(str);

  if (!matched) {
    throw new InvalidArgumentError("Invalid time period format");
  }

  const value = parseFloat(matched[1]);
  const unit = matched[2].toLowerCase();

  switch (unit) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      return Math.round(value);
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      return Math.round(value * minute);
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      return Math.round(value * hour);
    case "day":
    case "days":
    case "d":
      return Math.round(value * day);
    case "week":
    case "weeks":
    case "w":
      return Math.round(value * week);
    // years matched
    default:
      return Math.round(value * year);
  }
};

export const relativeTime = (str: string, base?: Date): Date => {
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  const ms = seconds(str) * 1000;
  const date = base ? new Date(base.getTime()) : new Date();
  date.setTime(date.getTime() + ms);
  return date;
};
