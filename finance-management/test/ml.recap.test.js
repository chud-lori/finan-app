const { expect } = require('chai');
const { buildRecap, pctChange, topMover } = require('../services/ml/recap');

describe('services/ml/recap — buildRecap', () => {
  const baseCurrent = {
    income: 10_000_000,
    expense: 6_000_000,
    txCount: 20,
    byCategory: [
      { category: 'food', total: 3_000_000, count: 12 },
      { category: 'transport', total: 1_500_000, count: 5 },
      { category: 'rent', total: 1_500_000, count: 1 },
    ],
  };
  const basePrior = {
    income: 10_000_000,
    expense: 5_000_000,
    byCategory: [{ category: 'food', total: 2_500_000, count: 10 }],
  };

  describe('not-enough-history guard', () => {
    it('is unavailable when the prior month snapshot is missing', () => {
      const r = buildRecap({ month: '2026-07', monthLabel: 'July 2026', current: baseCurrent, prior: null });
      expect(r.available).to.equal(false);
      expect(r.tiles).to.be.an('array').that.is.empty;
      expect(r.narrative).to.be.an('array').that.is.empty;
      expect(r.reason).to.be.a('string');
    });

    it('is unavailable for a brand-new user with no current month', () => {
      expect(buildRecap({ current: null, prior: basePrior }).available).to.equal(false);
    });
  });

  describe('full recap', () => {
    const recap = buildRecap({
      month: '2026-07',
      monthLabel: 'July 2026',
      current: baseCurrent,
      prior: basePrior,
      netWorth: { current: 55_000_000, prior: 50_000_000 },
      streak: { current: 12, longest: 30 },
      health: { score: 72 },
      anomalyCount: 2,
    });

    it('is available and produces a narrative + tiles', () => {
      expect(recap.available).to.equal(true);
      expect(recap.narrative.length).to.be.greaterThan(3);
      expect(recap.tiles.length).to.be.greaterThan(4);
    });

    it('computes net, savings rate and spend delta on the tiles', () => {
      const by = Object.fromEntries(recap.tiles.map((t) => [t.key, t]));
      expect(by.net.value).to.equal(4_000_000); // 10M income − 6M expense
      expect(by.net.tone).to.equal('positive');
      expect(by.savingsRate.value).to.equal(40); // 4M / 10M
      expect(by.expense.value).to.equal(6_000_000);
      expect(by.expense.delta).to.equal(20); // (6M − 5M) / 5M
      expect(by.expense.tone).to.equal('negative'); // spending went up
    });

    it('surfaces the top category and its share', () => {
      const top = recap.tiles.find((t) => t.key === 'topCategory');
      expect(top.text).to.equal('Food');
      expect(top.value).to.equal(50); // 3M of 6M
    });

    it('includes a net-worth tile with the month-over-month delta', () => {
      const nw = recap.tiles.find((t) => t.key === 'netWorth');
      expect(nw.value).to.equal(55_000_000);
      expect(nw.delta).to.equal(10); // (55 − 50) / 50
    });

    it('keeps raw currency out of the narrative (multi-currency safe)', () => {
      for (const line of recap.narrative) {
        // Strip the month-label year first — a calendar year is not a currency
        // amount, so it shouldn't trip the un-formatted-amount check.
        const withoutYear = line.replace(/\b(19|20)\d{2}\b/g, '');
        expect(withoutYear).to.not.match(/\d{4,}/); // no un-formatted 4+ digit amounts
      }
    });
  });

  describe('net shortfall month', () => {
    it('flags a negative net and omits nothing critical', () => {
      const r = buildRecap({
        month: '2026-07', monthLabel: 'July 2026',
        current: { income: 4_000_000, expense: 6_000_000, txCount: 15, byCategory: [{ category: 'food', total: 6_000_000, count: 15 }] },
        prior: { income: 5_000_000, expense: 5_000_000, byCategory: [] },
        streak: { current: 0, longest: 3 },
      });
      const net = r.tiles.find((t) => t.key === 'net');
      expect(net.value).to.equal(-2_000_000);
      expect(net.tone).to.equal('negative');
      expect(net.label).to.equal('Net shortfall');
    });
  });

  describe('helpers', () => {
    it('pctChange returns null without a baseline', () => {
      expect(pctChange(100, 0)).to.equal(null);
      expect(pctChange(150, 100)).to.equal(50);
    });

    it('topMover ignores categories with no prior baseline', () => {
      const mover = topMover(
        [{ category: 'food', total: 300 }, { category: 'new', total: 999 }],
        [{ category: 'food', total: 200 }],
      );
      expect(mover.category).to.equal('food'); // "new" has no baseline → skipped
      expect(mover.pct).to.equal(50);
    });
  });
});
