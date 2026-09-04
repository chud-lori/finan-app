const { expect } = require('chai');
const {
  buildReportLines, buildHeadline, hasSomethingToSay, previousYearMonth, savingsOutflow, formatterFor,
} = require('../services/monthlyReport');

const fmt = formatterFor({ currency: 'IDR', numberFormat: 'dot' });
const snapshot = (over = {}) => ({ income: 10_000_000, expense: 4_000_000, byCategory: [], ...over });

describe('monthly report — what the email says', () => {
  it('reports spend with savings transfers taken out', () => {
    const snap = snapshot({
      expense: 4_000_000,
      byCategory: [{ category: 'shop alpha', total: 1_000_000 }, { category: 'reksadana', total: 3_000_000 }],
    });
    const lines = buildReportLines(snap, new Set(['reksadana']), fmt);
    const value = (label) => lines.find(l => l.label === label)?.value;

    expect(value('Money out')).to.equal('IDR 1.000.000');
    expect(value('Moved to savings')).to.equal('IDR 3.000.000');
    expect(value('Savings rate')).to.equal('90%');
  });

  it('omits the savings line when nothing was moved', () => {
    const lines = buildReportLines(snapshot(), new Set(), fmt);
    expect(lines.some(l => l.label === 'Moved to savings')).to.equal(false);
  });

  it('states no savings rate when there was no income', () => {
    const lines = buildReportLines(snapshot({ income: 0 }), new Set(), fmt);
    expect(lines.some(l => l.label === 'Savings rate')).to.equal(false);
  });

  it('never reports negative spend when savings exceed recorded expense', () => {
    const snap = snapshot({ expense: 1_000_000, byCategory: [{ category: 'emas', total: 3_000_000 }] });
    expect(buildReportLines(snap, new Set(['emas']), fmt).find(l => l.label === 'Money out').value).to.equal('IDR 0');
  });

  it('matches savings categories regardless of case', () => {
    const snap = snapshot({ byCategory: [{ category: 'Reksa Dana', total: 2_000_000 }] });
    expect(savingsOutflow(snap, new Set(['reksa dana']))).to.equal(2_000_000);
  });
});

describe('monthly report — when it stays quiet', () => {
  it('says nothing for a month with no activity', () => {
    expect(hasSomethingToSay({ income: 0, expense: 0 })).to.equal(false);
    expect(hasSomethingToSay(null)).to.equal(false);
  });

  it('speaks when either side of the ledger moved', () => {
    expect(hasSomethingToSay({ income: 0, expense: 500_000 })).to.equal(true);
    expect(hasSomethingToSay({ income: 500_000, expense: 0 })).to.equal(true);
  });
});

describe('monthly report — which month it closes', () => {
  it('always reports the month before, in the user timezone', () => {
    expect(previousYearMonth(new Date('2026-09-01T02:00:00Z'), 'Asia/Jakarta')).to.equal('2026-08');
    expect(previousYearMonth(new Date('2026-09-15T04:00:00Z'), 'Asia/Jakarta')).to.equal('2026-08');
    // 23:00Z on the 30th is already the 1st in Jakarta, so last month is September
    expect(previousYearMonth(new Date('2026-09-30T23:00:00Z'), 'Asia/Jakarta')).to.equal('2026-09');
    expect(previousYearMonth(new Date('2026-01-01T05:00:00Z'), 'Asia/Jakarta')).to.equal('2025-12');
  });

  it('reads the boundary in the user timezone, not UTC', () => {
    const instant = new Date('2026-08-31T18:00:00Z');
    expect(previousYearMonth(instant, 'Asia/Jakarta')).to.equal('2026-08');
    expect(previousYearMonth(instant, 'UTC')).to.equal('2026-07');
  });
});

describe('monthly report — the one number at the top', () => {
  const savings = new Set(['reksadana']);

  it('leads with what was kept, savings counted as kept', () => {
    const snap = snapshot({ expense: 4_000_000, byCategory: [{ category: 'reksadana', total: 3_000_000 }] });
    const { headlineLabel, headline } = buildHeadline(snap, savings, fmt);
    expect(headlineLabel).to.equal('You kept');
    expect(headline).to.equal('IDR 9.000.000');
  });

  it('says plainly when more went out than came in', () => {
    const { headlineLabel, headline } = buildHeadline(snapshot({ income: 2_000_000, expense: 5_000_000 }), savings, fmt);
    expect(headlineLabel).to.equal('You spent over by');
    expect(headline).to.equal('IDR 3.000.000');
  });

  it('falls back to spend when no income was recorded', () => {
    const { headlineLabel, caption } = buildHeadline(snapshot({ income: 0, expense: 800_000 }), savings, fmt);
    expect(headlineLabel).to.equal('You spent');
    expect(caption).to.match(/No income/);
  });
});
