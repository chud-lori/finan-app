import { describe, it, expect } from 'vitest';
import {
  buildInsights,
  formatChange,
  insightKey,
  moneyAtStake,
  selectTopInsights,
  MATERIALITY_FLOOR,
} from './insightFeed';

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmt = (v) => `${v < 0 ? '−' : ''}¤${group(Math.round(Math.abs(v)))}`;

const category = (over) => ({
  category: 'widgets',
  total: 100_000,
  count: 4,
  pct: 10,
  prevTotal: 100_000,
  windowKind: 'rolling-30d',
  windowTotal: 100_000,
  baseline: 100_000,
  baselineMonths: 4,
  delta: 0,
  lumpy: false,
  volatility: 'flexible',
  ...over,
});

const explainWith = (categories, spend) => ({
  totalOutcome: spend,
  summary: '',
  topCategories: categories,
  rolling: { days: 30, currentTotal: spend, priorTotal: spend },
});

const youngMonth = (categories) => ({
  totalOutcome: 67_800,
  summary: '',
  topCategories: categories,
  rolling: { days: 30, currentTotal: 3_000_000, priorTotal: 3_200_000 },
});

describe('insightFeed — MATERIALITY_FLOOR', () => {
  it('takes its denominator from the trailing thirty days, so day 3 does not shrink it', () => {
    expect(MATERIALITY_FLOOR.of(youngMonth([]))).to.equal(3_200_000 * MATERIALITY_FLOOR.shareOfSpend);
    expect(MATERIALITY_FLOOR.denominator(youngMonth([]))).to.equal(3_200_000);
  });

  it('hides a trivial line in a month whose spend so far is tiny', () => {
    const coffee = category({
      category: 'coffee', total: 7_800, windowTotal: 7_800, count: 1, pct: 11,
      prevTotal: 40_000, baseline: 39_000, delta: -80,
    });
    const explain = youngMonth([coffee]);
    const insights = buildInsights(explain, null, null, null, null, fmt);

    expect(insights.some(i => i.text.includes('great progress'))).to.equal(true);
    expect(selectTopInsights(insights, MATERIALITY_FLOOR.of(explain)).some(i => i.kind === 'category-change')).to.equal(false);
  });

  it('keeps a genuine uptrend that clears the floor', () => {
    const rising = category({
      category: 'widgets', total: 785_357, windowTotal: 785_357, count: 8, pct: 26,
      prevTotal: 500_000, baseline: 500_000, delta: 57,
    });
    const explain = youngMonth([rising]);
    const top = selectTopInsights(buildInsights(explain, null, null, null, null, fmt), MATERIALITY_FLOOR.of(explain));

    expect(moneyAtStake(rising)).to.equal(285_357);
    expect(top.some(i => i.kind === 'category-change')).to.equal(true);
  });

  it('is zero when there is nothing to compare against', () => {
    expect(MATERIALITY_FLOOR.of(null)).to.equal(0);
  });
});

describe('insightFeed — moneyAtStake', () => {
  it('measures the current window against its own baseline, not a full prior month', () => {
    const c = category({ total: 900_000, windowTotal: 620_000, prevTotal: 1_000_000, baseline: 500_000, delta: 24 });
    expect(moneyAtStake(c)).to.equal(120_000);
  });

  it('is zero when the category has no baseline to be measured against', () => {
    expect(moneyAtStake(category({ baseline: null, delta: null, lumpy: true }))).to.equal(0);
  });
});

describe('insightFeed — selectTopInsights', () => {
  const floor = 20_000;

  it('ranks a warn about a large amount above a danger about a trivial one', () => {
    const top = selectTopInsights([
      { level: 'danger', amountAtStake: 25_000, text: 'trivial danger' },
      { level: 'warn', amountAtStake: 2_500_000, text: 'rent moved' },
    ], floor);
    expect(top.map(i => i.text)).to.deep.equal(['rent moved', 'trivial danger']);
  });

  it('lets severity decide between insights about comparable amounts', () => {
    const top = selectTopInsights([
      { level: 'info', amountAtStake: 900_000, text: 'info' },
      { level: 'danger', amountAtStake: 400_000, text: 'danger' },
      { level: 'warn', amountAtStake: 800_000, text: 'warn' },
    ], floor);
    expect(top.map(i => i.text)).to.deep.equal(['danger', 'warn', 'info']);
  });

  it('drops anything below the floor and caps the feed at five', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ level: 'info', amountAtStake: 100_000 + i, text: `big ${i}` }));
    const top = selectTopInsights([...many, { level: 'danger', amountAtStake: 5_000, text: 'noise' }], floor);
    expect(top).to.have.length(5);
    expect(top.some(i => i.text === 'noise')).to.equal(false);
  });
});

describe('insightFeed — formatChange', () => {
  it('leads with the change in money and renders both sides of the comparison', () => {
    const d = formatChange(category({ total: 549_000, windowTotal: 549_000, baseline: 68_000, delta: 707 }), fmt);
    expect(d.badge).to.equal('+¤481,000');
    expect(d.range).to.equal('¤68,000 → ¤549,000');
    expect(d.amount).to.equal(481_000);
    expect(d.rising).to.equal(true);
  });

  it('keeps the percentage only where the baseline is stable', () => {
    const flexible = formatChange(category({ total: 549_000, windowTotal: 549_000, baseline: 68_000, delta: 707 }), fmt);
    const fixed = formatChange(category({ total: 3_300_000, windowTotal: 3_300_000, baseline: 3_000_000, delta: 10, volatility: 'fixed', windowKind: 'calendar-month' }), fmt);
    expect(flexible.pctSuffix).to.equal('');
    expect(fixed.pctSuffix).to.equal(' (+10%)');
    expect(fixed.against).to.equal('vs last month');
  });

  it('has nothing to say without a baseline', () => {
    expect(formatChange(category({ baseline: null, delta: null, lumpy: true }), fmt)).to.equal(null);
  });
});

describe('insightFeed — buildInsights', () => {
  it('never states a pace for a category with no pace, and calls a single purchase what it is', () => {
    const chair = category({
      category: 'furniture', total: 550_000, windowTotal: 550_000, count: 1, pct: 25,
      prevTotal: 68_000, baseline: null, delta: null, lumpy: true,
    });
    const insights = buildInsights(explainWith([chair], 2_200_000), null, null, null, null, fmt);

    expect(insights.some(i => i.text.includes('pace'))).to.equal(false);
    const oneOff = insights.find(i => i.text.includes('one-off'));
    expect(oneOff.level).to.equal('info');
    expect(oneOff.text).to.contain('¤550,000');
    expect(oneOff.amountAtStake).to.equal(550_000);
  });

  it('does not praise a drop too small to change the month', () => {
    const coffee = category({
      category: 'coffee', total: 7_800, windowTotal: 7_800, count: 1, pct: 1,
      prevTotal: 40_000, baseline: 39_000, delta: -80,
    });
    const explain = explainWith([coffee], 2_200_000);
    const insights = buildInsights(explain, null, null, null, null, fmt);

    expect(insights.some(i => i.text.includes('great progress'))).to.equal(true);
    expect(selectTopInsights(insights, MATERIALITY_FLOOR.of(explain))).to.deep.equal([]);
  });

  it('reports a category move in money, not as a bare percentage', () => {
    const overspend = category({
      category: 'widgets', total: 900_000, windowTotal: 900_000, count: 6, pct: 30,
      prevTotal: 1_000_000, baseline: 500_000, delta: 80,
    });
    const insights = buildInsights(explainWith([overspend], 3_000_000), null, null, null, null, fmt);
    const pace = insights.find(i => i.level === 'danger');

    expect(pace.text).to.contain('+¤400,000');
    expect(pace.text).to.contain('¤500,000 → ¤900,000');
    expect(pace.text).to.contain('vs the 30 days before');
    expect(pace.text).to.not.contain('%');
    expect(pace.amountAtStake).to.equal(400_000);
  });

  it('stays silent about a move that Spending Alerts already explains', () => {
    const overspend = category({
      category: 'widgets', total: 900_000, windowTotal: 900_000, count: 6, pct: 30,
      prevTotal: 1_000_000, baseline: 500_000, delta: 80,
    });
    const ml = { anomalies: [{ id: '1', category: 'widgets', amount: 600_000, description: 'shop alpha' }], forecast: { available: false } };
    const insights = buildInsights(explainWith([overspend], 3_000_000), null, null, ml, null, fmt);

    expect(insights.some(i => i.anchor === 'where-its-going' && i.text.includes('trim'))).to.equal(false);
    expect(insights.some(i => i.anchor === 'spending-alerts')).to.equal(true);
  });

  it('dedupes against the rule-based alert shape too, not just the ML one', () => {
    const overspend = category({
      category: 'widgets', total: 900_000, windowTotal: 900_000, count: 6, pct: 30,
      prevTotal: 1_000_000, baseline: 500_000, delta: 80,
    });
    const anomaly = { count: 1, anomalies: [{ id: '1', category: 'widgets', amount: 600_000, description: 'shop alpha', flags: [{ type: 'high_amount', ratio: 5.5 }] }] };
    const insights = buildInsights(explainWith([overspend], 3_000_000), null, anomaly, { unavailable: true }, null, fmt);

    expect(insights.some(i => i.kind === 'category-change')).to.equal(false);
    expect(insights.some(i => i.kind === 'anomaly-count')).to.equal(true);
  });

  it('suppresses before the cut so a dropped insight promotes the next one', () => {
    const categories = Array.from({ length: 6 }, (_, i) => category({
      category: `cat${i}`, total: 500_000 - i, windowTotal: 500_000 - i, count: 6, pct: 30,
      prevTotal: 1_000_000, baseline: 250_000, delta: 100,
    }));
    const ml = { anomalies: [{ id: '1', category: 'cat0', amount: 400_000 }], forecast: { available: false } };
    const explain = explainWith(categories, 3_000_000);
    const top = selectTopInsights(buildInsights(explain, null, null, ml, null, fmt), MATERIALITY_FLOOR.of(explain));

    expect(top).to.have.length(5);
    expect(top.some(i => i.key === 'category-change:cat0')).to.equal(false);
    expect(top.some(i => i.key === 'category-change:cat5')).to.equal(true);
  });

  it('keys an insight on its subject, not on its wording', () => {
    const chair = category({
      category: 'Furniture', total: 550_000, windowTotal: 550_000, count: 1, pct: 25,
      prevTotal: 68_000, baseline: null, delta: null, lumpy: true,
    });
    const insights = buildInsights(explainWith([chair], 2_200_000), null, null, null, null, fmt);
    const oneOff = insights.find(i => i.kind === 'category-one-off');

    expect(oneOff.key).to.equal('category-one-off:furniture');
    expect(insightKey({ kind: 'runway', subject: 'balance' })).to.equal('runway:balance');
    expect(new Set(insights.map(i => i.key)).size).to.equal(insights.length);
  });

  it('carries the baseline each insight was judged against', () => {
    const overspend = category({
      category: 'widgets', total: 900_000, windowTotal: 900_000, count: 6, pct: 30,
      prevTotal: 1_000_000, baseline: 500_000, delta: 80, baselineMonths: 5,
    });
    const insights = buildInsights(explainWith([overspend], 3_000_000), null, null, null, null, fmt);
    const move = insights.find(i => i.kind === 'category-change');

    expect(move.baseline).to.deep.equal({ value: 500_000, kind: 'previous-30-days', periods: 1, txCount: 6 });
  });

  it('still reports a move that no listed alert accounts for', () => {
    const overspend = category({
      category: 'widgets', total: 900_000, windowTotal: 900_000, count: 6, pct: 30,
      prevTotal: 1_000_000, baseline: 500_000, delta: 80,
    });
    const ml = { anomalies: [{ id: '1', category: 'shop alpha', amount: 600_000, description: 'other' }], forecast: { available: false } };
    const insights = buildInsights(explainWith([overspend], 3_000_000), null, null, ml, null, fmt);

    expect(insights.some(i => i.text.includes('trim'))).to.equal(true);
  });

  it('formats every amount through the injected formatter', () => {
    const explain = explainWith([category({ total: 900_000, windowTotal: 900_000, pct: 40, baseline: 500_000, delta: 80 })], 2_000_000);
    const ttz = { status: 'critical', daysToZero: 4, balance: 300_000, dailyBurnRate: 75_000 };
    const recurring = { count: 2, monthlyTotal: 450_000, alerts: [] };
    const ml = { forecast: { available: true, over_budget: true, variance: 250_000 }, anomalies: [] };
    const insights = buildInsights(explain, ttz, null, ml, recurring, fmt);

    expect(insights.length).to.be.greaterThan(3);
    for (const i of insights) {
      expect(Number.isFinite(i.amountAtStake)).to.equal(true);
      const withoutFormattedMoney = i.text.replace(/¤[\d,]+/g, '');
      expect(withoutFormattedMoney).to.not.match(/\d{1,3}(,\d{3})+/);
    }
  });
});
