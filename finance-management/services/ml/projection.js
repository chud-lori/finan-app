// Balance walked forward one day at a time: the everyday pace every day, each bill on its due date, income on its pay dates.

const DAY_MS = 86400000;
const CHECKPOINT_DAYS = [30, 60, 90];

const toDate = (iso) => new Date(iso + 'T00:00:00Z');
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);
const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Dates from `first` stepping by `intervalDays`, kept when they fall in [asOf, asOf + horizon]; no interval means one date.
const occurrences = (first, intervalDays, asOf, horizon) => {
  const out = [];
  if (!first) return out;
  const step = Math.round(Number(intervalDays) || 0);
  let date = first;
  for (let guard = 0; guard < 400 && daysBetween(asOf, date) <= horizon; guard++) {
    if (daysBetween(asOf, date) >= 0) out.push(date);
    if (step <= 0) break;
    date = addDays(date, step);
  }
  return out;
};

/**
 * @param {{ asOf:'YYYY-MM-DD', balance:number, dailyPace:number,
 *           bills?: Array<{merchant, dueDate, amount, intervalDays?}>,
 *           income?: {nextDate, intervalDays, amount} | null, horizonDays?: number }} input
 */
const projectBalance = ({ asOf, balance, dailyPace, bills = [], income = null, horizonDays = 90 }) => {
  const start = Math.round(Number(balance) || 0);
  const pace = Math.max(0, Math.round(Number(dailyPace) || 0));
  const deltaByDay = new Map();
  // Something due today has not moved the balance yet, so it lands in the first step rather than on day 0.
  const dayOf = (date) => Math.max(1, daysBetween(asOf, date));
  const book = (date, amount) => deltaByDay.set(dayOf(date), (deltaByDay.get(dayOf(date)) || 0) + amount);

  const billEvents = [];
  for (const b of bills || []) {
    const amount = Math.round(Number(b && b.amount));
    if (!(amount > 0)) continue;
    for (const date of occurrences(b.dueDate, b.intervalDays, asOf, horizonDays)) {
      billEvents.push({ merchant: b.merchant, date, amount });
      book(date, -amount);
    }
  }
  billEvents.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const incomeEvents = [];
  const incomeAmount = Math.round(Number(income && income.amount) || 0);
  if (income && incomeAmount > 0) {
    for (const date of occurrences(income.nextDate, income.intervalDays, asOf, horizonDays)) {
      incomeEvents.push({ date, amount: incomeAmount });
      book(date, incomeAmount);
    }
  }

  const points = [{ date: asOf, balance: start }];
  let running = start;
  let lowest = { day: 0, date: asOf, balance: start };
  let runsOut = null;
  for (let day = 1; day <= horizonDays; day++) {
    running += (deltaByDay.get(day) || 0) - pace;
    const date = addDays(asOf, day);
    points.push({ date, balance: running });
    if (running < lowest.balance) lowest = { day, date, balance: running };
    if (running < 0 && !runsOut) runsOut = { day, date };
  }

  const checkpoints = CHECKPOINT_DAYS
    .filter((d) => d <= horizonDays)
    .map((day) => ({ day, date: points[day].date, balance: points[day].balance }));

  return { asOf, horizonDays, startBalance: start, dailyPace: pace, points, checkpoints, bills: billEvents, income: incomeEvents, lowest, runsOut };
};

module.exports = { projectBalance, occurrences, daysBetween, addDays };
