import { describe, it, expect } from 'vitest';
import { buildRuleSplit, RULE_TARGETS } from './ruleSplit';

describe('buildRuleSplit — 50/30/20 mapping', () => {
  it('maps category groups to needs / wants / savings buckets', () => {
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
    // The savings bucket is invested + idle cash; the double-count trap adds the investment twice.
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

    // Every rupiah lands in exactly one bucket, proving nothing is counted twice.
    expect(by.needs + by.wants + by.savings).to.equal(10_000_000);
  });

  it('surfaces income/other groups as unclassified, not forced into a bucket', () => {
    const groups = { essential: 1_000_000, other: 500_000, income: 300_000, total: 1_800_000 };
    const split = buildRuleSplit(groups, 5_000_000);
    expect(split.unclassified).to.equal(800_000); // other + income
    expect(split.buckets.find((b) => b.key === 'needs').amount).to.equal(1_000_000);
  });
});
