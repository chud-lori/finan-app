// Narrative lines must stay currency-free; raw amounts ride only on `tiles`, which the FE formats.

const { materialityFloor, isMaterial } = require('../../helpers/materiality');

const round = (n) => Math.round(n);

const pctChange = (cur, prev) => {
  if (!(prev > 0)) return null;
  return round(((cur - prev) / prev) * 100);
};

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);

const topMover = (curByCat, priorByCat, floor = 0) => {
  const prior = new Map((priorByCat || []).map((c) => [c.category, c.total]));
  let best = null;
  for (const c of curByCat || []) {
    const prev = prior.get(c.category) || 0;
    if (!(prev > 0)) continue;
    const change = c.total - prev;
    if (change <= 0 || !isMaterial(change, floor)) continue;
    if (best && change <= best.change) continue;
    best = {
      category: c.category,
      change: round(change),
      from: round(prev),
      to: round(c.total),
      count: c.count == null ? null : c.count,
      pct: isMaterial(prev, floor) ? pctChange(c.total, prev) : null,
    };
  }
  return best;
};

const buildRecap = (input = {}) => {
  const { month = null, monthLabel = '', current, prior } = input;
  const netWorth = input.netWorth || { current: null, prior: null };
  const streak = input.streak || { current: 0, longest: 0 };
  const health = input.health || null;
  const anomalyCount = input.anomalyCount == null ? null : input.anomalyCount;

  // Needs a full prior month, or every "vs last month" line is meaningless.
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
  const priorExpense = round(prior.expense || 0);
  const net = income - expense;
  const savingsRate = income > 0 ? round((net / income) * 100) : null;

  const floor = materialityFloor(expense, priorExpense);
  const spendChange = expense - priorExpense;
  const spendMoved = isMaterial(spendChange, floor);
  const spendPct = spendMoved && isMaterial(priorExpense, floor) ? pctChange(expense, priorExpense) : null;

  const byCat = [...(current.byCategory || [])].sort((a, b) => b.total - a.total);
  const top = byCat[0] || null;
  const topPct = top && expense > 0 ? round((top.total / expense) * 100) : null;
  const mover = topMover(current.byCategory, prior.byCategory, floor);

  const nwDelta = pctChange(netWorth.current, netWorth.prior);

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

  if (!spendMoved) {
    narrative.push('Your spending held steady versus the month before.');
  } else if (spendChange > 0) {
    narrative.push(spendPct != null
      ? `You spent ${spendPct}% more than the month before.`
      : 'You spent more than the month before.');
  } else {
    narrative.push(spendPct != null
      ? `You spent ${Math.abs(spendPct)}% less than the month before — nice restraint.`
      : 'You spent less than the month before — nice restraint.');
  }

  if (top && topPct != null) {
    narrative.push(`${cap(top.category)} was your biggest category at ${topPct}% of everything you spent.`);
  }

  if (mover) {
    narrative.push(mover.count === 1
      ? `${cap(mover.category)} was your biggest increase — one purchase, not a new habit.`
      : `${cap(mover.category)} was your biggest increase over the month before.`);
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

  const tiles = [
    { key: 'net', label: net >= 0 ? 'Net saved' : 'Net shortfall', value: net, format: 'currency', tone: net >= 0 ? 'positive' : 'negative' },
    { key: 'income', label: 'Income', value: income, format: 'currency', tone: 'neutral' },
    {
      key: 'expense', label: 'Spent', value: expense, format: 'currency', baseline: priorExpense,
      tone: !spendMoved ? 'neutral' : spendChange < 0 ? 'positive' : 'negative',
    },
  ];

  if (savingsRate != null) {
    tiles.push({ key: 'savingsRate', label: 'Savings rate', value: savingsRate, format: 'percent', tone: savingsRate >= 0 ? 'positive' : 'negative' });
  }
  if (top && topPct != null) {
    tiles.push({ key: 'topCategory', label: 'Top category', text: cap(top.category), value: topPct, format: 'percent', tone: 'neutral' });
  }
  if (mover) {
    tiles.push({ key: 'topMover', label: 'Biggest increase', text: cap(mover.category), value: mover.to, baseline: mover.from, count: mover.count, format: 'currency', tone: 'negative' });
  }
  if (netWorth.current != null) {
    tiles.push({ key: 'netWorth', label: 'Net worth', value: round(netWorth.current), format: 'currency', baseline: netWorth.prior == null ? null : round(netWorth.prior), tone: nwDelta == null ? 'neutral' : nwDelta >= 0 ? 'positive' : 'negative' });
  }
  if (health && health.score != null) {
    tiles.push({ key: 'health', label: 'Health score', value: health.score, format: 'number', max: 100, tone: 'neutral' });
  }
  tiles.push({ key: 'streak', label: 'Longest streak', value: streak.longest || 0, format: 'number', unit: 'days', tone: 'neutral' });

  if (anomalyCount != null) {
    tiles.push({ key: 'anomalies', label: 'Flagged', value: anomalyCount, format: 'number', tone: anomalyCount > 0 ? 'negative' : 'positive' });
  }

  return { available: true, month, monthLabel, materialityFloor: round(floor), narrative, tiles };
};

module.exports = { buildRecap, pctChange, topMover };
