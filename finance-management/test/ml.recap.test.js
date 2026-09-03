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

    it('computes net, savings rate and the spend baseline on the tiles', () => {
      const by = Object.fromEntries(recap.tiles.map((t) => [t.key, t]));
      expect(by.net.value).to.equal(4_000_000); // 10M income − 6M expense
      expect(by.net.tone).to.equal('positive');
      expect(by.savingsRate.value).to.equal(40); // 4M / 10M
      expect(by.expense.value).to.equal(6_000_000);
      expect(by.expense.baseline).to.equal(5_000_000);
      expect(by.expense.delta).to.equal(undefined);
      expect(by.expense.tone).to.equal('negative'); // spending went up
    });

    it('publishes the materiality floor so the FE and the server agree on one threshold', () => {
      expect(recap.materialityFloor).to.equal(120_000); // 2% of the larger month
    });

    it('surfaces the top category and its share', () => {
      const top = recap.tiles.find((t) => t.key === 'topCategory');
      expect(top.text).to.equal('Food');
      expect(top.value).to.equal(50); // 3M of 6M
    });

    it('includes a net-worth tile carrying its prior reading as the baseline', () => {
      const nw = recap.tiles.find((t) => t.key === 'netWorth');
      expect(nw.value).to.equal(55_000_000);
      expect(nw.baseline).to.equal(50_000_000);
      expect(nw.delta).to.equal(undefined);
    });

    it('keeps raw currency out of the narrative (multi-currency safe)', () => {
      for (const line of recap.narrative) {
        // Strip the month-label year first — it is not a currency amount.
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

  describe('immaterial movements', () => {
    it('never narrates a move too small to change the month, however large its percentage', () => {
      const r = buildRecap({
        month: '2026-07', monthLabel: 'July 2026',
        current: { income: 10_000_000, expense: 6_000_000, txCount: 20, byCategory: [{ category: 'widgets', total: 50_000, count: 2 }] },
        prior: { income: 10_000_000, expense: 6_000_000, byCategory: [{ category: 'widgets', total: 10_000, count: 1 }] },
      });
      expect(r.tiles.find((t) => t.key === 'topMover')).to.equal(undefined); // +400% is only 40k
      expect(r.narrative.join(' ')).to.not.contain('400%');
      expect(r.narrative.join(' ')).to.not.contain('biggest increase');
    });

    it('says spending held steady instead of badging a trivial change', () => {
      const r = buildRecap({
        month: '2026-07', monthLabel: 'July 2026',
        current: { income: 10_000_000, expense: 6_010_000, txCount: 20, byCategory: [] },
        prior: { income: 10_000_000, expense: 6_000_000, byCategory: [] },
      });
      const spent = r.tiles.find((t) => t.key === 'expense');
      expect(spent.tone).to.equal('neutral');
      expect(r.narrative.join(' ')).to.contain('held steady');
    });

    it('names a single-purchase mover as one purchase rather than a trend', () => {
      const r = buildRecap({
        month: '2026-07', monthLabel: 'July 2026',
        current: { income: 10_000_000, expense: 6_000_000, txCount: 20, byCategory: [{ category: 'shop alpha', total: 550_000, count: 1 }] },
        prior: { income: 10_000_000, expense: 6_000_000, byCategory: [{ category: 'shop alpha', total: 10_000, count: 1 }] },
      });
      const mover = r.tiles.find((t) => t.key === 'topMover');
      expect(mover.baseline).to.equal(10_000);
      expect(mover.count).to.equal(1);
      expect(r.narrative.join(' ')).to.contain('one purchase, not a new habit');
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

    it('topMover picks the biggest money move, not the biggest percentage', () => {
      const mover = topMover(
        [{ category: 'widgets', total: 3_200_000 }, { category: 'shop alpha', total: 50_000 }],
        [{ category: 'widgets', total: 3_000_000 }, { category: 'shop alpha', total: 10_000 }],
        120_000,
      );
      expect(mover.category).to.equal('widgets'); // +200k beats +400% on a 10k base
      expect(mover.change).to.equal(200_000);
    });

    it('topMover withholds the percentage when the baseline is below the floor', () => {
      const mover = topMover(
        [{ category: 'shop alpha', total: 550_000, count: 1 }],
        [{ category: 'shop alpha', total: 10_000 }],
        120_000,
      );
      expect(mover.change).to.equal(540_000);
      expect(mover.pct).to.equal(null); // 5400% on a 10k base says nothing
      expect(mover.count).to.equal(1);
    });
  });
});
