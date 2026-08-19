// Unreadable income cadence (variable / gig) degrades to a rolling-30-day runway with no payday horizon.

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

const cadenceLabel = (gap) => {
  if (gap >= 6 && gap <= 8) return 'weekly';
  if (gap >= 12 && gap <= 16) return 'biweekly';
  if (gap >= 26 && gap <= 35) return 'monthly';
  return 'irregular';
};

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
  const amounts = evs.map((e) => Number(e.amount));
  const typicalIncome = Math.round(median(amounts));

  const last = evs[evs.length - 1];
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

const computeRunway = (input = {}) => {
  const asOf = input.asOf || new Date().toISOString().slice(0, 10);
  const balance = Number(input.balance) || 0;
  const discretionaryDaily = Math.max(0, Math.round(Number(input.discretionaryDaily) || 0));
  const horizon = input.horizonDays || DEFAULT_HORIZON;

  const upcomingBills = (input.bills || [])
    .filter((b) => b && b.dueDate && daysBetween(asOf, b.dueDate) >= 0 && Number(b.amount) > 0)
    .map((b) => ({ merchant: b.merchant, dueDate: b.dueDate, amount: Math.round(Number(b.amount)) }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  const cad = detectIncomeCadence(input.incomeEvents, asOf);
  const mode = cad.regular ? 'payday' : 'rolling';

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
    // Spendable today while still reaching payday non-negative after bills and run-rate.
    safeToSpend = Math.round(balance - billsTotal - discretionaryDaily * daysUntilIncome);
    safeToSpendPerDay = daysUntilIncome > 0 ? Math.round(safeToSpend / daysUntilIncome) : safeToSpend;
  } else {
    // No payday horizon: safe-to-spend is just the runway cushion.
    billsBeforeIncome = upcomingBills.slice(0, 8);
    billsTotal = billsBeforeIncome.reduce((s, b) => s + b.amount, 0);
    safeToSpend = Math.round(balance - billsTotal);
  }

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
