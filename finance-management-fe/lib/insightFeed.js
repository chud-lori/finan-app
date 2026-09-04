import { capitalizeFirst as cap } from './format';

export const MATERIALITY_FLOOR = {
  shareOfSpend: 0.02,
  denominator(explain) {
    return Math.max(
      explain?.rolling?.currentTotal ?? 0,
      explain?.rolling?.priorTotal ?? 0,
      explain?.totalOutcome ?? 0,
    );
  },
  of(explain) {
    return this.denominator(explain) * this.shareOfSpend;
  },
};

export const FEED_SIZE = 5;
export const ONE_OFF_MIN_PCT_OF_MONTH = 10;

const SEVERITY_ORDER = { danger: 0, warn: 1, good: 2, info: 3 };
const STABLE_BASELINE_CLASSES = new Set(['fixed', 'semi']);
const ALERT_EXPLAINS_SHARE = 0.5;

export const insightKey = (insight) =>
  `${insight?.kind ?? 'unknown'}:${String(insight?.subject ?? '').toLowerCase()}`;

export const listedAlerts = (anomaly, ml) =>
  (ml && !ml.unavailable ? ml.anomalies : anomaly?.anomalies) ?? [];

export const biggestAlertIn = (category, alerts) =>
  (alerts ?? [])
    .filter(a => (a.category ?? '').toLowerCase() === (category ?? '').toLowerCase())
    .reduce((biggest, a) => (biggest && (biggest.amount ?? 0) >= (a.amount ?? 0) ? biggest : a), null);

const windowTotalOf = (category) => category?.windowTotal ?? category?.total ?? 0;

export const moneyAtStake = (category) => {
  const baseline = category?.baseline;
  if (baseline == null || baseline <= 0) return 0;
  return Math.abs(Math.round(windowTotalOf(category) - baseline));
};

export function formatChange(category, formatAmount) {
  const baseline = category?.baseline;
  if (category?.delta == null || baseline == null || baseline <= 0) return null;
  const rolling = category.windowKind === 'rolling-30d';
  const change = Math.round(windowTotalOf(category) - baseline);
  const rising = change >= 0;
  return {
    amount: moneyAtStake(category),
    rising,
    pct: category.delta,
    badge: `${rising ? '+' : '−'}${formatAmount(Math.abs(change))}`,
    against: rolling ? 'vs the 30 days before' : 'vs last month',
    range: `${formatAmount(baseline)} → ${formatAmount(windowTotalOf(category))}`,
    pctSuffix: STABLE_BASELINE_CLASSES.has(category.volatility)
      ? ` (${rising ? '+' : '−'}${Math.abs(category.delta)}%)`
      : '',
    baseline: {
      value: baseline,
      kind: rolling ? 'previous-30-days' : 'previous-month',
      periods: rolling ? 1 : (category.baselineMonths ?? null),
      txCount: category.count ?? null,
    },
  };
}

const materialityBand = (amount, floor) =>
  floor > 0 && amount > 0 ? Math.floor(Math.log10(amount / floor)) : 0;

export const selectTopInsights = (insights, floor, limit = FEED_SIZE) =>
  (insights ?? [])
    .filter(i => Number.isFinite(i.amountAtStake) && i.amountAtStake >= floor)
    .sort((a, b) =>
      materialityBand(b.amountAtStake, floor) - materialityBand(a.amountAtStake, floor) ||
      (SEVERITY_ORDER[a.level] ?? 3) - (SEVERITY_ORDER[b.level] ?? 3) ||
      b.amountAtStake - a.amountAtStake)
    .slice(0, limit);

const monthlyBurn = (ttz) =>
  Math.max(Math.abs(ttz?.balance ?? 0), (ttz?.dailyBurnRate ?? 0) * 30);

const changeLine = (category, change) =>
  `${cap(category.category)} ${change.badge} ${change.against}: ${change.range}${change.pctSuffix}`;

const categoryBaseline = (category, kind) => ({
  value: category.prevTotal ?? null,
  kind,
  periods: category.baselineMonths ?? null,
  txCount: category.count ?? null,
});

export function buildInsights(explain, ttz, anomaly, ml, recurring, formatAmount) {
  const insights = [];
  const daysElapsed = new Date().getDate();
  const alerts = listedAlerts(anomaly, ml);
  const add = (insight) => insights.push({ ...insight, key: insightKey(insight) });

  const miss = recurring?.alerts?.find(a => a.type === 'missing');
  if (miss) {
    add({
      kind: 'recurring-missing', subject: miss.merchant, level: 'warn', icon: '⏰',
      amountAtStake: miss.expected ?? recurring.monthlyTotal ?? 0,
      baseline: { value: miss.expected ?? null, kind: 'recurring-charge', periods: 1, txCount: null },
      text: `${cap(miss.merchant)} usually charges about ${formatAmount(miss.expected)} around now but nothing has posted — check it didn't fail`,
      anchor: 'recurring', cta: 'See recurring',
    });
  }
  if (recurring?.count > 0) {
    add({
      kind: 'recurring-total', subject: 'subscriptions', level: 'info', icon: '🔁',
      amountAtStake: recurring.monthlyTotal ?? 0,
      baseline: { value: recurring.monthlyTotal ?? null, kind: 'recurring-total', periods: 1, txCount: recurring.count },
      text: `You have ${recurring.count} recurring charge${recurring.count > 1 ? 's' : ''} totalling about ${formatAmount(recurring.monthlyTotal)} a month`,
      anchor: 'recurring', cta: 'See recurring',
    });
  }

  if (ttz) {
    const burn = monthlyBurn(ttz);
    const runway = {
      kind: 'runway', subject: 'balance', amountAtStake: burn,
      baseline: { value: ttz.dailyBurnRate ?? null, kind: 'daily-burn', periods: 30, txCount: null },
      anchor: 'runway', cta: 'See runway',
    };
    if (ttz.status === 'critical') {
      add({ ...runway, level: 'danger', icon: '🔥', text: `You're on track to overspend — balance runs out in ${ttz.daysToZero} days at ${formatAmount(ttz.dailyBurnRate)} a day` });
    } else if (ttz.status === 'already_zero') {
      add({ ...runway, level: 'danger', icon: '🔥', text: `Your balance is already at zero — stop all discretionary spending immediately` });
    } else if (ttz.status === 'warning') {
      add({ ...runway, level: 'warn', icon: '⚡', text: `Balance runway is ${ttz.daysToZero} days at ${formatAmount(ttz.dailyBurnRate)} a day — consider cutting back` });
    } else if (ttz.status === 'safe' && ttz.daysToZero > 90) {
      add({ ...runway, level: 'good', icon: '✅', cta: 'See details', text: `Your balance can last ${ttz.daysToZero} days at current pace — you're in solid shape` });
    }
  }

  if (ml?.forecast?.available) {
    const f = ml.forecast;
    const forecast = {
      kind: 'forecast', subject: 'month',
      baseline: { value: f.budget ?? null, kind: 'budget', periods: 1, txCount: null },
      anchor: 'forecast', cta: 'See forecast',
    };
    if (f.over_budget) {
      add({ ...forecast, level: 'danger', icon: '📊', amountAtStake: Math.abs(f.variance ?? 0), text: `You're on pace to overspend your budget by ${formatAmount(Math.abs(f.variance ?? 0))} this month` });
    } else if (f.pct_of_budget >= 85) {
      add({ ...forecast, level: 'warn', icon: '📊', amountAtStake: f.forecast ?? 0, text: `You'll spend about ${formatAmount(f.forecast)} — ${f.pct_of_budget}% of your monthly budget — at this rate` });
    } else if (f.trend === 'accelerating') {
      add({ ...forecast, level: 'warn', icon: '📈', amountAtStake: f.forecast ?? 0, text: `Your spending is accelerating — you're heading for about ${formatAmount(f.forecast)} this month` });
    } else if (f.trend === 'decelerating') {
      add({ ...forecast, level: 'good', icon: '📉', amountAtStake: f.forecast ?? 0, text: `Your spending is slowing down — you're heading for about ${formatAmount(f.forecast)} this month` });
    }
  }

  if (alerts.length > 0) {
    const flagged = alerts.reduce((sum, a) => sum + (a.amount ?? 0), 0);
    add({
      kind: 'anomaly-count', subject: 'month', level: 'warn', icon: '🚨',
      amountAtStake: flagged,
      baseline: { value: flagged, kind: 'flagged-transactions', periods: 1, txCount: alerts.length },
      text: `${alerts.length} unusual transaction${alerts.length > 1 ? 's' : ''} this month, ${formatAmount(flagged)} in total — outside your normal pattern`,
      anchor: 'spending-alerts', cta: 'See transactions',
    });
  }

  (explain?.topCategories ?? []).forEach(c => {
    const fixed = c.volatility === 'fixed';
    const change = formatChange(c, formatAmount);
    const alert = biggestAlertIn(c.category, alerts);

    if (!fixed && c.pct >= 35) {
      add({
        kind: 'category-concentration', subject: c.category, level: 'warn', icon: '⚠️',
        amountAtStake: c.total, baseline: categoryBaseline(c, 'month-total'),
        text: `${formatAmount(c.total)} of this month went to ${cap(c.category)} — ${c.pct}% on a single category`,
        anchor: 'where-its-going', cta: 'See breakdown',
      });
    } else if (fixed && c.pct >= 40) {
      add({
        kind: 'category-fixed-base', subject: c.category, level: 'info', icon: '🏠',
        amountAtStake: c.total, baseline: categoryBaseline(c, 'month-total'),
        text: `${cap(c.category)} is ${formatAmount(c.total)}, ${c.pct}% of your spending — your fixed monthly base`,
        anchor: 'where-its-going', cta: 'See breakdown',
      });
    }

    const alreadyInSpendingAlerts = change && alert && (alert.amount ?? 0) >= ALERT_EXPLAINS_SHARE * change.amount;
    if (change && !alreadyInSpendingAlerts) {
      const move = {
        kind: 'category-change', subject: c.category, amountAtStake: change.amount,
        baseline: change.baseline, anchor: 'where-its-going', cta: 'See breakdown',
      };
      if (fixed) {
        if (Math.abs(c.delta) >= 10) add({ ...move, level: 'info', icon: '🏠', text: `${changeLine(c, change)} — new baseline?` });
      } else if (c.delta >= 40) {
        add({ ...move, level: 'danger', icon: '📈', text: `${changeLine(c, change)} — a place you can trim` });
      } else if (c.delta >= 25) {
        add({ ...move, level: 'warn', icon: '📈', text: `${changeLine(c, change)} — worth watching` });
      } else if (c.delta <= -25) {
        add({ ...move, level: 'good', icon: '📉', text: `${changeLine(c, change)} — great progress` });
      }
    }

    if (c.lumpy && c.count === 1 && c.pct >= ONE_OFF_MIN_PCT_OF_MONTH) {
      add({
        kind: 'category-one-off', subject: c.category, level: 'info', icon: '🧾',
        amountAtStake: c.total, baseline: categoryBaseline(c, 'none'),
        text: `${cap(c.category)} is ${formatAmount(c.total)} this month, all from one purchase — a one-off, not a new habit`,
        anchor: alert ? 'spending-alerts' : 'where-its-going',
        cta: alert ? 'See the transaction' : 'See breakdown',
      });
    }

    if (c.count >= 10) {
      add({
        kind: 'category-frequency', subject: c.category, level: 'info', icon: '🔁',
        amountAtStake: c.total, baseline: categoryBaseline(c, 'month-total'),
        text: `${c.count} ${cap(c.category)} transactions this month totalling ${formatAmount(c.total)} — avg ${(c.count / daysElapsed).toFixed(1)}/day`,
        anchor: 'where-its-going', cta: 'See breakdown',
      });
    }
    if (!fixed && c.pct >= 20 && c.pct < 35 && (!change || Math.abs(c.delta) < 25)) {
      add({
        kind: 'category-top-expense', subject: c.category, level: 'info', icon: '📊',
        amountAtStake: c.total, baseline: categoryBaseline(c, 'month-total'),
        text: `${cap(c.category)} is your top expense at ${formatAmount(c.total)}, ${c.pct}% of total spending`,
        anchor: 'where-its-going', cta: 'See breakdown',
      });
    }
  });

  return insights;
}
