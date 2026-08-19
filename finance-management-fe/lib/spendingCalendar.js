// Day-level spend for a single month, derived client-side from that month's
// transactions. Pure — no React, no fetch — so the bucketing, the savings
// exclusion and the intensity scale can be unit-tested.

const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const weekdayLabels = (weekStartsOn = 'monday') =>
  weekStartsOn === 'sunday' ? WEEKDAYS_SUN : [...WEEKDAYS_SUN.slice(1), WEEKDAYS_SUN[0]];

const pad = (n) => String(n).padStart(2, '0');

const fmtCache = new Map();
const dateFormatter = (tz) => {
  const key = tz || '';
  if (fmtCache.has(key)) return fmtCache.get(key);
  const opts = { year: 'numeric', month: '2-digit', day: '2-digit' };
  let f;
  try {
    f = new Intl.DateTimeFormat('en-US', tz ? { ...opts, timeZone: tz } : opts);
  } catch {
    f = new Intl.DateTimeFormat('en-US', opts);
  }
  fmtCache.set(key, f);
  return f;
};

// 'YYYY-MM-DD' as the clock in `tz` saw it — a 23:40 charge must not slide into
// the next day. Falls back to the browser zone when tz is absent or unknown.
export const dayKey = (time, tz) => {
  const d = time instanceof Date ? time : new Date(time);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(dateFormatter(tz).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

// Cells for a 7-column month grid: leading/trailing nulls pad the weeks.
export const buildMonthGrid = (year, month, weekStartsOn = 'monday') => {
  const dow  = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  const lead = weekStartsOn === 'sunday' ? dow : (dow + 6) % 7;
  const days = new Date(year, month, 0).getDate();

  const cells = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push({ day: d, key: `${year}-${pad(month)}-${pad(d)}` });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

// Expense per day, excluding savings-group outflow (moving cash to savings is
// not spending). `yearMonth` drops anything that lands outside the month once
// bucketed in its own zone.
export const buildDailySpend = (transactions = [], { yearMonth, savingsCategories = [] } = {}) => {
  const savings = new Set([...savingsCategories].map((c) => String(c).toLowerCase()));
  const byDay = {};
  let total = 0;

  for (const t of transactions) {
    if (!t || t.type !== 'expense') continue;
    if (savings.has(String(t.category ?? '').toLowerCase())) continue;
    const key = dayKey(t.time, t.transaction_timezone);
    if (!key) continue;
    if (yearMonth && key.slice(0, 7) !== yearMonth) continue;
    const amount = Number(t.amount) || 0;
    byDay[key] = (byDay[key] ?? 0) + amount;
    total += amount;
  }

  const values = Object.values(byDay);
  return {
    byDay,
    total,
    max: values.reduce((m, v) => (v > m ? v : m), 0),
    activeDays: values.filter((v) => v > 0).length,
  };
};

// Every transaction of the day, income included — the drill-down shows the day
// as it happened, not just what fed the heat.
export const groupTransactionsByDay = (transactions = []) => {
  const byDay = {};
  for (const t of transactions) {
    if (!t) continue;
    const key = dayKey(t.time, t.transaction_timezone);
    if (!key) continue;
    (byDay[key] ??= []).push(t);
  }
  for (const list of Object.values(byDay)) list.sort((a, b) => new Date(a.time) - new Date(b.time));
  return byDay;
};

// 0 = no spend (rendered empty), 1-4 = quartiles of the month's own maximum.
export const intensityLevel = (amount, max) => {
  if (!(amount > 0) || !(max > 0)) return 0;
  const ratio = amount / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5)  return 2;
  if (ratio <= 0.75) return 3;
  return 4;
};

// The server bounds the range in the *browser's* zone while rows are bucketed
// in their own transaction_timezone, so a boundary row can fall outside both
// months. Pad each end by two days (max zone spread is 26h) — buildDailySpend
// still drops anything outside `yearMonth`, so nothing leaks into the grid.
const PAD_DAYS = 2;
const DAY_MS = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export const monthFetchRange = (year, month) => ({
  start: isoDay(Date.UTC(year, month - 1, 1) - PAD_DAYS * DAY_MS),
  end:   isoDay(Date.UTC(year, month, 0) + PAD_DAYS * DAY_MS),
});

// Both requests have to land. Without the savings-group list the calendar
// cannot keep its "savings is not spending" promise, so it refuses to show
// numbers rather than quietly painting a transfer as the month's darkest day.
export const resolveCalendarState = (rangeResult, groupResult) => {
  if (rangeResult?.status !== 'fulfilled') {
    return { txns: [], savings: [], error: rangeResult?.reason?.message || 'Could not load daily spending.' };
  }
  if (groupResult?.status !== 'fulfilled') {
    return {
      txns: [], savings: [],
      error: 'Could not load your savings categories — daily totals would count transfers to savings as spending.',
    };
  }
  const groups  = groupResult.value?.data?.groups ?? [];
  const savings = groups.find((g) => g.group === 'savings');
  return {
    txns:    rangeResult.value?.data?.transactions ?? [],
    savings: (savings?.categories ?? []).map((c) => c.name),
    error:   '',
  };
};
