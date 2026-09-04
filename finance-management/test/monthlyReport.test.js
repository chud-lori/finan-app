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

const { monthlyReportEmail, nothingRecordedEmail } = require('../helpers/emailTemplates/monthlyReport');

describe('monthly report — the email itself', () => {
  const report = monthlyReportEmail({
    monthLabel: 'August 2026',
    headlineLabel: 'You kept',
    headline: 'IDR 6.500.000',
    caption: 'IDR 12.000.000 came in and IDR 5.500.000 went out.',
    lines: [{ label: 'Money in', value: 'IDR 12.000.000' }, { label: 'Savings rate', value: '54%' }],
    appUrl: 'https://example.test',
  });

  it('puts the one number in the subject and the body', () => {
    expect(report.subject).to.equal('August 2026: you kept IDR 6.500.000');
    expect(report.html).to.contain('IDR 6.500.000');
  });

  it('renders every line it was given', () => {
    expect(report.html).to.contain('Money in');
    expect(report.html).to.contain('Savings rate');
  });

  it('lays out with tables so Outlook can render it', () => {
    expect(report.html).to.contain('role="presentation"');
    expect(report.html).to.not.contain('display:flex');
    expect(report.html).to.not.contain('display:grid');
  });

  it('declares both colour schemes so dark mode does not invert blindly', () => {
    expect(report.html).to.contain('color-scheme');
  });

  it('sends the reader to the app, not a dead end', () => {
    expect(report.html).to.contain('https://example.test/insights');
  });

  it('leaves no unfilled placeholder', () => {
    expect(report.html).to.not.contain('undefined');
    expect(report.html).to.not.match(/\$\{/);
  });
});

describe('monthly report — a month with nothing in it', () => {
  const nudge = nothingRecordedEmail({ monthLabel: 'August 2026', appUrl: 'https://example.test' });

  it('says the month was blank rather than pretending it had figures', () => {
    expect(nudge.subject).to.contain('blank');
    expect(nudge.html).to.not.contain('Money in');
  });

  it('asks for the one action that fixes it', () => {
    expect(nudge.html).to.contain('Add a transaction');
    expect(nudge.html).to.contain('https://example.test/add');
  });

  it('names the value in one line and the next step in another', () => {
    expect(nudge.html).to.match(/where your money went, what is a habit, and what is worth trimming/i);
    expect(nudge.html).to.match(/one entry is enough to begin/i);
  });

  it('leaves no unfilled placeholder', () => {
    expect(nudge.html).to.not.contain('undefined');
    expect(nudge.html).to.not.match(/\$\{/);
  });
});
