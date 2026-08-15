// Money Recap — a rule-based, fully in-process monthly "wrapped".
//
// Pure math. No model, no LLM, nothing leaves the box. It stitches a plain-
// language narrative plus a set of stat tiles out of signals the app already
// computes: the monthly income/expense Snapshot (this month vs the one before),
// the Financial Health Score, the logging streak, the net-worth reading, the
// ML anomaly count, and the per-category spend that drives the Spending Mix.
//
// Currency discipline: narrative lines never bake in a formatted amount — they
// speak in percentages, counts, category names and month labels so they read
// correctly in any currency. Raw amounts ride only on the `tiles`, which the
// frontend formats with the user's currency via useFormatAmount().

const round = (n) => Math.round(n);

// Percentage change from `prev` to `cur`, or null when there is no baseline.
const pctChange = (cur, prev) => {
  if (!(prev > 0)) return null;
  return round(((cur - prev) / prev) * 100);
};

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);

// Biggest category increase this month vs last — the "top mover". Returns the
// category with the largest positive delta that has a real prior baseline, so a
// brand-new category (no baseline) doesn't masquerade as a spike.
const topMover = (curByCat, priorByCat) => {
  const prior = new Map((priorByCat || []).map((c) => [c.category, c.total]));
  let best = null;
  for (const c of curByCat || []) {
    const prev = prior.get(c.category) || 0;
    if (!(prev > 0)) continue;
    const delta = c.total - prev;
    const pct = pctChange(c.total, prev);
    if (delta > 0 && pct != null && (!best || pct > best.pct)) {
      best = { category: c.category, pct, from: round(prev), to: round(c.total) };
    }
  }
  return best;
};

/**
 * @param {{
 *   month: string,            // 'YYYY-MM'
 *   monthLabel: string,       // e.g. 'July 2026'
 *   current: { income:number, expense:number, txCount:number, byCategory:Array<{category,total,count}> } | null,
 *   prior:   { income:number, expense:number, byCategory:Array } | null,
 *   netWorth?: { current:number|null, prior:number|null },
 *   streak?:  { current:number, longest:number },
 *   health?:  { score:number|null } | null,
 *   anomalyCount?: number | null,
 * }} input
 * @returns {{ available:boolean, month:string, monthLabel:string, reason?:string, narrative:string[], tiles:Array }}
 */
const buildRecap = (input = {}) => {
  const { month = null, monthLabel = '', current, prior } = input;
  const netWorth = input.netWorth || { current: null, prior: null };
  const streak = input.streak || { current: 0, longest: 0 };
  const health = input.health || null;
  const anomalyCount = input.anomalyCount == null ? null : input.anomalyCount;

  // Recap needs the month itself AND at least one full prior month to compare
  // against — otherwise every "vs last month" line is meaningless.
  if (!current || !prior) {
    return {
      available: false,
      month,
      monthLabel,
      reason: 'Not enough history yet — a recap needs at least one full prior month to compare against.',
      narrative: [],
      tiles: [],
    };
  }

  const income = round(current.income || 0);
  const expense = round(current.expense || 0);
  const net = income - expense;
  const savingsRate = income > 0 ? round((net / income) * 100) : null;
  const expenseDelta = pctChange(expense, prior.expense || 0);

  const byCat = [...(current.byCategory || [])].sort((a, b) => b.total - a.total);
  const top = byCat[0] || null;
  const topPct = top && expense > 0 ? round((top.total / expense) * 100) : null;
  const mover = topMover(current.byCategory, prior.byCategory);

  const nwDelta = pctChange(netWorth.current, netWorth.prior);

  // ── Narrative (currency-free) ───────────────────────────────────────────────
  const narrative = [];
  const label = monthLabel || month || 'this month';

  if (net >= 0) {
    narrative.push(
      savingsRate != null
        ? `In ${label} you came out ahead — you kept ${savingsRate}% of what you earned.`
        : `In ${label} your income covered your spending.`
    );
  } else {
    narrative.push(`In ${label} you spent more than you earned — worth a closer look next month.`);
  }

  if (expenseDelta != null) {
    if (expenseDelta > 0) narrative.push(`You spent ${expenseDelta}% more than the month before.`);
    else if (expenseDelta < 0) narrative.push(`You spent ${Math.abs(expenseDelta)}% less than the month before — nice restraint.`);
    else narrative.push(`Your spending held steady versus the month before.`);
  }

  if (top && topPct != null) {
    narrative.push(`${cap(top.category)} was your biggest category at ${topPct}% of everything you spent.`);
  }

  if (mover) {
    narrative.push(`${cap(mover.category)} jumped ${mover.pct}% over the previous month.`);
  }

  if (streak.current > 1) {
    narrative.push(`You kept a ${streak.current}-day logging streak going.`);
  }

  if (nwDelta != null) {
    if (nwDelta > 0) narrative.push(`Your net worth grew ${nwDelta}% across the month.`);
    else if (nwDelta < 0) narrative.push(`Your net worth slipped ${Math.abs(nwDelta)}% across the month.`);
  } else if ((netWorth.prior == null || netWorth.prior === 0) && netWorth.current > 0) {
    narrative.push(`You started tracking your net worth — future recaps will show how it moves.`);
  }

  if (anomalyCount != null && anomalyCount > 0) {
    narrative.push(`We flagged ${anomalyCount} unusual purchase${anomalyCount > 1 ? 's' : ''} worth a second look.`);
  }

  narrative.push(`Altogether you logged ${current.txCount || 0} transaction${(current.txCount || 0) === 1 ? '' : 's'} in ${label}.`);

  // ── Tiles (raw numbers — the FE formats currency ones) ──────────────────────
  const tiles = [
    { key: 'net', label: net >= 0 ? 'Net saved' : 'Net shortfall', value: net, format: 'currency', tone: net >= 0 ? 'positive' : 'negative' },
    { key: 'income', label: 'Income', value: income, format: 'currency', tone: 'neutral' },
    {
      key: 'expense', label: 'Spent', value: expense, format: 'currency',
      delta: expenseDelta, deltaFormat: 'percent',
      tone: expenseDelta == null ? 'neutral' : expenseDelta <= 0 ? 'positive' : 'negative',
    },
  ];

  if (savingsRate != null) {
    tiles.push({ key: 'savingsRate', label: 'Savings rate', value: savingsRate, format: 'percent', tone: savingsRate >= 0 ? 'positive' : 'negative' });
  }
  if (top && topPct != null) {
    tiles.push({ key: 'topCategory', label: 'Top category', text: cap(top.category), value: topPct, format: 'percent', tone: 'neutral' });
  }
  if (netWorth.current != null) {
    tiles.push({ key: 'netWorth', label: 'Net worth', value: round(netWorth.current), format: 'currency', delta: nwDelta, deltaFormat: 'percent', tone: nwDelta == null ? 'neutral' : nwDelta >= 0 ? 'positive' : 'negative' });
  }
  if (health && health.score != null) {
    tiles.push({ key: 'health', label: 'Health score', value: health.score, format: 'number', max: 100, tone: 'neutral' });
  }
  tiles.push({ key: 'streak', label: 'Longest streak', value: streak.longest || 0, format: 'number', unit: 'days', tone: 'neutral' });

  if (anomalyCount != null) {
    tiles.push({ key: 'anomalies', label: 'Flagged', value: anomalyCount, format: 'number', tone: anomalyCount > 0 ? 'negative' : 'positive' });
  }

  return { available: true, month, monthLabel, narrative, tiles };
};

module.exports = { buildRecap, pctChange, topMover };
