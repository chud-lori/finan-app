export const MONTH_TURN_DAYS = 7;

// Day of the month on the viewer's calendar, not UTC's, so the slot turns over at their midnight.
export function dayOfMonthIn(now, timeZone) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric' }).format(now));
}

export function isMonthTurn(now, timeZone, days = MONTH_TURN_DAYS) {
  return dayOfMonthIn(now, timeZone) <= days;
}
