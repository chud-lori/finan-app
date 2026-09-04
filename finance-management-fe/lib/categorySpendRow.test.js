import { describe, it, expect } from 'vitest';
import { describeCategorySpend, formatOccurrenceLabel } from './categorySpendRow';

const MONTH = { totalOutcome: 3_000_000 };

const row = (over) => ({ category: 'widget', total: 500_000, prevTotal: 100_000, count: 6, delta: 20, volatility: 'flexible', ...over });

describe('describeCategorySpend', () => {
  it('reads a huge ratio on a tiny baseline as one purchase, with money instead of a percentage', () => {
    const d = describeCategorySpend(row({ total: 500_000, prevTotal: 6_000, count: 1, delta: 7998, volatility: 'flexible' }), MONTH);
    expect(d.isSinglePurchase).to.equal(true);
    expect(d.trend).to.equal(null);
    expect(d.percent).to.equal(null);
    expect(d.comparison).to.deep.equal({ previousTotal: 6_000, currentTotal: 500_000, periodsAlign: false });
  });

  it('shows no figures when the month is on pace, however much money moved', () => {
    const d = describeCategorySpend(row({ total: 500_000, prevTotal: 1_000_000, count: 8, delta: 0 }), MONTH);
    expect(d.trend).to.equal(null);
    expect(d.comparison).to.equal(null);
    expect(d.percent).to.equal(null);
    expect(d.isOnPace).to.equal(true);
  });

  it('still shows the money when the backend declines to judge an irregular category', () => {
    const d = describeCategorySpend(row({ total: 480_000, prevTotal: 100_000, count: 2, delta: null, volatility: 'flexible' }), MONTH);
    expect(d.isSinglePurchase).to.equal(false);
    expect(d.trend).to.equal(null);
    expect(d.percent).to.equal(null);
    expect(d.comparison).to.deep.equal({ previousTotal: 100_000, currentTotal: 480_000, periodsAlign: false });
  });

  it('says nothing when there is no baseline to compare against', () => {
    const d = describeCategorySpend(row({ count: 8, delta: null, prevTotal: 0 }), MONTH);
    expect(d.trend).to.equal(null);
    expect(d.comparison).to.equal(null);
  });

  it('stays quiet when the money at stake is below the shared materiality floor', () => {
    const d = describeCategorySpend(row({ total: 40_000, prevTotal: 10_000, count: 5, delta: 300 }), MONTH);
    expect(d.comparison).to.equal(null);
    expect(d.trend).to.equal(null);
  });

  it('leaves the floor out of it when the money that moved cannot be measured', () => {
    const d = describeCategorySpend(row({ total: 40_000, prevTotal: 10_000, count: 5, delta: null }), MONTH);
    expect(d.comparison).to.deep.equal({ previousTotal: 10_000, currentTotal: 40_000, periodsAlign: false });
    expect(d.trend).to.equal(null);
  });

  it('marks a departure on a stable multi-transaction category and keeps the percentage as context', () => {
    const d = describeCategorySpend(row({ total: 1_200_000, prevTotal: 1_000_000, count: 12, delta: 20, volatility: 'fixed' }), MONTH);
    expect(d.isSinglePurchase).to.equal(false);
    expect(d.trend).to.equal('up');
    expect(d.percent).to.equal(20);
    expect(d.comparison).to.deep.equal({ previousTotal: 1_000_000, currentTotal: 1_200_000, periodsAlign: true });
  });

  it('never colours a fall as a rise when the delta was measured against a pro-rated baseline', () => {
    const d = describeCategorySpend(row({ total: 150_000, prevTotal: 1_000_000, count: 9, delta: 50, volatility: 'flexible' }), MONTH);
    expect(d.trend).to.equal(null);
    expect(d.percent).to.equal(null);
    expect(d.comparison).to.deep.equal({ previousTotal: 1_000_000, currentTotal: 150_000, periodsAlign: false });
  });

  it('stays neutral on a genuine uptrend whose partial month reads as a fall', () => {
    const d = describeCategorySpend(row({ total: 705_000, prevTotal: 4_200_000, count: 3, delta: 68, volatility: 'flexible' }), MONTH);
    expect(d.trend).to.equal(null);
    expect(d.percent).to.equal(null);
    expect(d.comparison.periodsAlign).to.equal(false);
  });

  it('flags the periods as aligned only when the totals explain the delta', () => {
    expect(describeCategorySpend(row({ total: 1_500_000, prevTotal: 1_000_000, count: 12, delta: 50 }), MONTH).comparison.periodsAlign).to.equal(true);
  });

  it('withholds every verdict when the delta does not describe the two totals on screen', () => {
    for (const volatility of ['semi', 'flexible', 'unknown']) {
      const d = describeCategorySpend(row({ total: 500_000, prevTotal: 100_000, count: 12, delta: 20, volatility }), MONTH);
      expect(d.percent, volatility).to.equal(null);
      expect(d.trend, volatility).to.equal(null);
    }
  });

  it('reads the delta off the numbers, not off the volatility class', () => {
    const d = describeCategorySpend(row({ total: 1_500_000, prevTotal: 1_000_000, count: 12, delta: 50, volatility: 'flexible' }), MONTH);
    expect(d.trend).to.equal('up');
    expect(d.percent).to.equal(50);
  });

  it('declines to call a row a one-off when there is not enough history to judge', () => {
    const newUser = describeCategorySpend(row({ count: 1, prevTotal: 0, delta: null, volatility: 'unknown' }), MONTH);
    expect(newUser.isSinglePurchase).to.equal(false);
    expect(describeCategorySpend(row({ count: 1, volatility: 'flexible' }), MONTH).isSinglePurchase).to.equal(true);
  });

  it('treats a single monthly charge as a habit, not a one-off purchase', () => {
    const d = describeCategorySpend(row({ total: 2_750_000, prevTotal: 2_500_000, count: 1, delta: 10, volatility: 'fixed' }), MONTH);
    expect(d.isSinglePurchase).to.equal(false);
    expect(d.trend).to.equal('up');
    expect(d.percent).to.equal(10);
  });

  it('reports a drop in money too, without reading a trend into a lone purchase', () => {
    const habit = describeCategorySpend(row({ total: 400_000, prevTotal: 1_000_000, count: 9, delta: -60, volatility: 'flexible' }), MONTH);
    expect(habit.trend).to.equal('down');
    expect(habit.comparison).to.deep.equal({ previousTotal: 1_000_000, currentTotal: 400_000, periodsAlign: true });

    const noise = describeCategorySpend(row({ total: 200_000, prevTotal: 1_000_000, count: 1, delta: -80, volatility: 'flexible' }), MONTH);
    expect(noise.isSinglePurchase).to.equal(true);
    expect(noise.trend).to.equal(null);
    expect(noise.percent).to.equal(null);
  });

  it('survives a row with missing numbers and an unmeasurable month', () => {
    const d = describeCategorySpend({});
    expect(d.count).to.equal(0);
    expect(d.isSinglePurchase).to.equal(false);
    expect(d.trend).to.equal(null);
    expect(d.comparison).to.equal(null);
  });
});

describe('formatOccurrenceLabel', () => {
  it('names a single transaction in words and counts the rest', () => {
    expect(formatOccurrenceLabel(1, 'flexible')).to.equal('One purchase');
    expect(formatOccurrenceLabel(12, 'flexible')).to.equal('12 purchases');
  });

  it('calls a recurring commitment a charge rather than a purchase', () => {
    expect(formatOccurrenceLabel(3, 'semi')).to.equal('3 charges');
    expect(formatOccurrenceLabel(2, 'fixed')).to.equal('2 charges');
  });

  it('has nothing to say about a monthly commitment posting once', () => {
    expect(formatOccurrenceLabel(1, 'fixed')).to.equal(null);
    expect(formatOccurrenceLabel(1, 'semi')).to.equal(null);
  });

  it('has nothing to say about an empty or invalid count', () => {
    expect(formatOccurrenceLabel(0, 'flexible')).to.equal(null);
    expect(formatOccurrenceLabel(undefined, 'flexible')).to.equal(null);
  });
});
