import { describe, it, expect } from 'vitest';
import { buildRuleSplit, RULE_TARGETS } from './ruleSplit';

describe('buildRuleSplit — 50/30/20 mapping', () => {
  it('maps category groups to needs / wants / savings buckets', () => {
    // essential -> needs; discretionary + social -> wants; savings + surplus -> savings
    const groups = {
      essential: 5_000_000,
      discretionary: 2_000_000,
      social: 1_000_000,
      savings: 500_000,
      other: 0,
      income: 0,
      total: 8_500_000,
    };
    const { buckets } = buildRuleSplit(groups, 10_000_000);
    const by = Object.fromEntries(buckets.map((b) => [b.key, b.amount]));

    expect(by.needs).to.equal(5_000_000); // essential
    expect(by.wants).to.equal(3_000_000); // discretionary + social
    // savings categories (500k) + surplus (10,000,000 − 8,500,000 = 1,500,000)
    expect(by.savings).to.equal(2_000_000);
  });

  it('computes each bucket percentage against the income basis', () => {
    const groups = { essential: 5_000_000, total: 5_000_000 };
    const split = buildRuleSplit(groups, 10_000_000);
    const needs = split.buckets.find((b) => b.key === 'needs');

    expect(needs.pct).to.equal(50); // 5,000,000 / 10,000,000
    // Whole surplus (5,000,000) flows to savings -> 50%
    expect(split.buckets.find((b) => b.key === 'savings').pct).to.equal(50);
    expect(split.surplus).to.equal(5_000_000);
    expect(split.overspent).to.equal(0);
    // targets are the canonical 50/30/20
    expect(RULE_TARGETS).to.deep.equal({ needs: 50, wants: 30, savings: 20 });
  });

  it('falls back to zeroes when there is no income (avoids divide-by-zero)', () => {
    const split = buildRuleSplit({}, 0);
    expect(split.buckets.every((b) => b.pct === 0)).to.equal(true);
    expect(split.incomeBasis).to.equal(0);
    expect(split.unclassifiedPct).to.equal(0);
  });

  it('reports overspend when expenses exceed the income basis', () => {
    const groups = { essential: 8_000_000, discretionary: 4_000_000, total: 12_000_000 };
    const split = buildRuleSplit(groups, 10_000_000);
    expect(split.surplus).to.equal(-2_000_000);
    expect(split.overspent).to.equal(2_000_000);
    // no positive surplus to add, so savings bucket is just the savings group (0)
    expect(split.buckets.find((b) => b.key === 'savings').amount).to.equal(0);
  });

  it('counts savings-group outflow exactly once (no double-count)', () => {
    // Investing is logged as a savings-group expense. The savings bucket must be
    // the invested amount + the leftover cash — NOT the invested amount + a
    // surplus that was itself inflated by excluding the investment from spend.
    //   income          = 10,000,000
    //   real spend       = essential 4,000,000 + discretionary 2,000,000 = 6,000,000
    //   savings-group    = 3,000,000 (the investment)
    // Correct savings bucket = 3,000,000 (invested) + 1,000,000 (idle cash) = 4,000,000.
    // The double-count trap would yield 3,000,000 + (10,000,000 − 6,000,000) = 7,000,000.
    const groups = {
      essential: 4_000_000,
      discretionary: 2_000_000,
      savings: 3_000_000,
      total: 9_000_000,
    };
    const split = buildRuleSplit(groups, 10_000_000);
    const by = Object.fromEntries(split.buckets.map((b) => [b.key, b.amount]));

    expect(split.surplus).to.equal(1_000_000);      // income − total outflow
    expect(by.savings).to.equal(4_000_000);         // invested + idle, counted once
    expect(by.savings).to.not.equal(7_000_000);     // the double-count value

    // Every rupiah of income is accounted for exactly once across the buckets
    // (no unclassified here), proving nothing is counted twice.
    expect(by.needs + by.wants + by.savings).to.equal(10_000_000);
  });

  it('surfaces income/other groups as unclassified, not forced into a bucket', () => {
    const groups = { essential: 1_000_000, other: 500_000, income: 300_000, total: 1_800_000 };
    const split = buildRuleSplit(groups, 5_000_000);
    expect(split.unclassified).to.equal(800_000); // other + income
    expect(split.buckets.find((b) => b.key === 'needs').amount).to.equal(1_000_000);
  });
});
