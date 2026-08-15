// Payday Runway — forward-looking "safe to spend before your next income".
//
// Pure math. No model, nothing leaves the box. Given the current balance, the
// user's income history, the upcoming recurring bills (from services/ml/
// recurring.js — nextDue + typical amount) and a discretionary daily run-rate,
// it projects the balance forward and answers two questions:
//
//   1. How much is safe to spend before the next expected income lands?
//   2. On which day would the balance go negative at this pace (the "runway")?
//
// It is framed as a guide, not a guarantee: income timing is inferred, bills are
// projected, and the run-rate is a rolling average.
//
// Degradation: when income cadence can't be read (variable / gig income), it
// falls back to a plain rolling-30-day runway with no payday horizon.

const DAY_MS = 86400000;
const DEFAULT_HORIZON = 120; // days to simulate forward

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const mad = (xs, m) => median(xs.map((x) => Math.abs(x - m)));

const toDate = (iso) => new Date(iso + 'T00:00:00Z');
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);
const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Map a median gap (in days) to an income cadence label. Income posts weekly,
// biweekly, semi-monthly or monthly for most salaried users.
const cadenceLabel = (gap) => {
  if (gap >= 6 && gap <= 8) return 'weekly';
  if (gap >= 12 && gap <= 16) return 'biweekly';
  if (gap >= 26 && gap <= 35) return 'monthly';
  return 'irregular';
};

// Infer the income rhythm from dated income events. Returns a cadence read plus
// the projected next pay date, or { regular:false } when it can't be trusted.
const detectIncomeCadence = (incomeEvents, asOf) => {
  const evs = (incomeEvents || [])
    .filter((e) => e && e.date && Number(e.amount) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (evs.length < 3) return { regular: false, cadence: 'irregular' };

  const gaps = [];
  for (let i = 1; i < evs.length; i++) gaps.push(daysBetween(evs[i - 1].date, evs[i].date));
  const medGap = median(gaps);
  if (medGap <= 0) return { regular: false, cadence: 'irregular' };

  const label = cadenceLabel(medGap);
  const jitter = mad(gaps, medGap) / medGap; // schedule tightness
  // Amounts don't have to be identical (overtime, bonuses) but must be positive.
  const amounts = evs.map((e) => Number(e.amount));
  const typicalIncome = Math.round(median(amounts));

  const last = evs[evs.length - 1];
  // Roll the next-pay estimate forward until it lands strictly after `asOf`.
  let next = addDays(last.date, Math.round(medGap));
  let guard = 0;
  while (daysBetween(asOf, next) <= 0 && guard < 24) { next = addDays(next, Math.round(medGap)); guard++; }

  const regular = label !== 'irregular' && jitter <= 0.35;
  return {
    regular,
    cadence: regular ? label : 'irregular',
    medGap: Math.round(medGap),
    jitter: Math.round(jitter * 100) / 100,
    typicalIncome,
    nextIncomeDate: regular ? next : null,
    lastIncomeDate: last.date,
  };
};

/**
 * @param {{
 *   asOf: string,                 // 'YYYY-MM-DD'
 *   balance: number,
 *   incomeEvents?: Array<{date:string, amount:number}>,
 *   bills?: Array<{merchant:string, dueDate:string, amount:number}>,  // upcoming recurring charges
 *   discretionaryDaily?: number,  // rolling everyday run-rate, recurring already netted out
 *   horizonDays?: number,
 * }} input
 */
const computeRunway = (input = {}) => {
  const asOf = input.asOf || new Date().toISOString().slice(0, 10);
  const balance = Number(input.balance) || 0;
  const discretionaryDaily = Math.max(0, Math.round(Number(input.discretionaryDaily) || 0));
  const horizon = input.horizonDays || DEFAULT_HORIZON;

  // Only bills strictly ahead of us matter for a forward projection.
  const upcomingBills = (input.bills || [])
    .filter((b) => b && b.dueDate && daysBetween(asOf, b.dueDate) >= 0 && Number(b.amount) > 0)
    .map((b) => ({ merchant: b.merchant, dueDate: b.dueDate, amount: Math.round(Number(b.amount)) }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  const cad = detectIncomeCadence(input.incomeEvents, asOf);
  const mode = cad.regular ? 'payday' : 'rolling';

  // Projected pay dates within the horizon (payday mode only).
  const payDates = [];
  if (cad.regular && cad.nextIncomeDate) {
    let d = cad.nextIncomeDate;
    let guard = 0;
    while (daysBetween(asOf, d) <= horizon && guard < 60) {
      payDates.push(d);
      d = addDays(d, cad.medGap);
      guard++;
    }
  }
  const payDateSet = new Map(payDates.map((d) => [d, cad.typicalIncome]));
  const billByDate = new Map();
  for (const b of upcomingBills) billByDate.set(b.dueDate, (billByDate.get(b.dueDate) || 0) + b.amount);

  // ── Forward simulation ──────────────────────────────────────────────────────
  // Walk day by day: subtract the discretionary run-rate every day, subtract a
  // bill on its due date, add projected income on a pay date. The first day the
  // balance dips below zero is the runway.
  let running = balance;
  let runwayDays = null;
  let runwayDate = null;
  for (let day = 1; day <= horizon; day++) {
    const date = addDays(asOf, day);
    if (payDateSet.has(date)) running += payDateSet.get(date);
    if (billByDate.has(date)) running -= billByDate.get(date);
    running -= discretionaryDaily;
    if (running < 0 && runwayDays === null) {
      runwayDays = day;
      runwayDate = date;
      break;
    }
  }

  // ── Safe-to-spend before next income (payday mode) ──────────────────────────
  let daysUntilIncome = null;
  let nextIncomeDate = null;
  let expectedIncome = null;
  let billsBeforeIncome = [];
  let billsTotal = 0;
  let safeToSpend = null;
  let safeToSpendPerDay = null;

  if (mode === 'payday') {
    nextIncomeDate = cad.nextIncomeDate;
    daysUntilIncome = Math.max(0, daysBetween(asOf, nextIncomeDate));
    expectedIncome = cad.typicalIncome;
    billsBeforeIncome = upcomingBills.filter((b) => daysBetween(asOf, b.dueDate) <= daysUntilIncome);
    billsTotal = billsBeforeIncome.reduce((s, b) => s + b.amount, 0);
    // What you could spend today and still reach payday non-negative, after the
    // bills that fall due before then and the everyday run-rate until then.
    safeToSpend = Math.round(balance - billsTotal - discretionaryDaily * daysUntilIncome);
    safeToSpendPerDay = daysUntilIncome > 0 ? Math.round(safeToSpend / daysUntilIncome) : safeToSpend;
  } else {
    // Rolling fallback: no payday horizon. Everything ahead in the window is
    // "before income", and safe-to-spend is simply the runway cushion.
    billsBeforeIncome = upcomingBills.slice(0, 8);
    billsTotal = billsBeforeIncome.reduce((s, b) => s + b.amount, 0);
    safeToSpend = Math.round(balance - billsTotal);
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  let status;
  if (mode === 'payday') {
    if (safeToSpend < 0) status = 'negative';          // won't reach payday without going under
    else if (runwayDays !== null && runwayDays <= daysUntilIncome) status = 'tight';
    else status = 'healthy';
  } else {
    if (balance <= 0) status = 'negative';
    else if (runwayDays !== null && runwayDays <= 14) status = 'negative';
    else if (runwayDays !== null && runwayDays <= 30) status = 'tight';
    else status = 'healthy';
  }

  return {
    mode,
    asOf,
    currentBalance: Math.round(balance),
    cadence: cad.cadence,
    regularIncome: !!cad.regular,
    nextIncomeDate,
    daysUntilIncome,
    expectedIncome,
    discretionaryDaily,
    billsBeforeIncome,
    billsTotal,
    safeToSpend,
    safeToSpendPerDay,
    runwayDays,
    runwayDate,
    horizonDays: horizon,
    status,
    note: 'A guide, not a guarantee — income timing and bills are estimated.',
  };
};

module.exports = { computeRunway, detectIncomeCadence };
