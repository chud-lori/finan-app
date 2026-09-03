import { describe, it, expect } from 'vitest';
import { describeCategorySpend, formatOccurrenceLabel, MAX_READABLE_PERCENT } from './categorySpendRow';

const row = (over) => ({ category: 'widget', total: 500_000, prevTotal: 100_000, count: 6, delta: 20, volatility: 'flexible', ...over });

describe('describeCategorySpend', () => {
  it('reads a huge ratio on a tiny baseline as one purchase, with money instead of a percentage', () => {
    const d = describeCategorySpend(row({ total: 500_000, prevTotal: 6_000, count: 1, delta: 7998, volatility: 'flexible' }));
    expect(d.isSinglePurchase).to.equal(true);
    expect(d.trend).to.equal(null);
    expect(d.percent).to.equal(null);
    expect(d.comparison).to.deep.equal({ previousTotal: 6_000, currentTotal: 500_000 });
  });

  it('drops the percentage once it stops reading as a quantity, even on a stable baseline', () => {
    const d = describeCategorySpend(row({ count: 4, delta: MAX_READABLE_PERCENT, volatility: 'fixed' }));
    expect(d.trend).to.equal('up');
    expect(d.percent).to.equal(null);
    expect(describeCategorySpend(row({ count: 4, delta: MAX_READABLE_PERCENT - 1, volatility: 'fixed' })).percent).to.equal(199);
  });

  it('says nothing at all when the month is unchanged', () => {
    const d = describeCategorySpend(row({ count: 8, delta: 0 }));
    expect(d.trend).to.equal(null);
    expect(d.comparison).to.equal(null);
    expect(d.percent).to.equal(null);
  });

  it('says nothing when there is no comparable baseline', () => {
    const d = describeCategorySpend(row({ count: 8, delta: null, prevTotal: 0 }));
    expect(d.trend).to.equal(null);
    expect(d.comparison).to.equal(null);
  });

  it('marks a departure on a stable multi-transaction category and keeps the percentage as context', () => {
    const d = describeCategorySpend(row({ total: 1_200_000, prevTotal: 1_000_000, count: 12, delta: 20, volatility: 'fixed' }));
    expect(d.isSinglePurchase).to.equal(false);
    expect(d.trend).to.equal('up');
    expect(d.percent).to.equal(20);
    expect(d.comparison).to.deep.equal({ previousTotal: 1_000_000, currentTotal: 1_200_000 });
  });

  it('withholds the percentage when the baseline it was measured against is not the total on screen', () => {
    expect(describeCategorySpend(row({ count: 12, delta: 20, volatility: 'semi' })).percent).to.equal(null);
    expect(describeCategorySpend(row({ count: 12, delta: 20, volatility: 'flexible' })).percent).to.equal(null);
    expect(describeCategorySpend(row({ count: 12, delta: 20, volatility: 'unknown' })).percent).to.equal(null);
  });

  it('treats a single monthly charge as a habit, not a one-off purchase', () => {
    const d = describeCategorySpend(row({ total: 2_750_000, prevTotal: 2_500_000, count: 1, delta: 10, volatility: 'fixed' }));
    expect(d.isSinglePurchase).to.equal(false);
    expect(d.trend).to.equal('up');
    expect(d.percent).to.equal(10);
  });

  it('reports a drop in money too, without praising a fall from a tiny base', () => {
    const habit = describeCategorySpend(row({ total: 400_000, prevTotal: 1_000_000, count: 9, delta: -60, volatility: 'flexible' }));
    expect(habit.trend).to.equal('down');
    expect(habit.comparison).to.deep.equal({ previousTotal: 1_000_000, currentTotal: 400_000 });

    const noise = describeCategorySpend(row({ total: 2_000, prevTotal: 10_000, count: 1, delta: -80, volatility: 'flexible' }));
    expect(noise.trend).to.equal(null);
    expect(noise.isSinglePurchase).to.equal(true);
  });

  it('survives a row with missing numbers', () => {
    const d = describeCategorySpend({});
    expect(d.count).to.equal(0);
    expect(d.isSinglePurchase).to.equal(true);
    expect(d.trend).to.equal(null);
    expect(d.comparison).to.equal(null);
  });
});

describe('formatOccurrenceLabel', () => {
  it('names a single transaction in words and counts the rest', () => {
    expect(formatOccurrenceLabel(1)).to.equal('One purchase');
    expect(formatOccurrenceLabel(12)).to.equal('12 purchases');
  });

  it('has nothing to say about an empty or invalid count', () => {
    expect(formatOccurrenceLabel(0)).to.equal(null);
    expect(formatOccurrenceLabel(undefined)).to.equal(null);
  });
});
