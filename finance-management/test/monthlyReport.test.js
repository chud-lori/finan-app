const { expect } = require('chai');
const {
  buildMoneyCards, buildSummaryLines, buildHeadline, buildBadge, buildCategories, buildComparison,
  buildGlance, hasSomethingToSay, previousYearMonth, savingsOutflow, formatterFor,
} = require('../services/monthlyReport');

const fmt = formatterFor({ currency: 'IDR', numberFormat: 'dot' });
const snapshot = (over = {}) => ({ income: 10_000_000, expense: 4_000_000, byCategory: [], ...over });

describe('monthly report — what the email says', () => {
  const cardValue = (cards, label) => cards.find(c => c.label === label)?.value;
  const lineValue = (lines, label) => lines.find(l => l.label === label)?.value;

  it('reports spend with savings transfers taken out', () => {
    const snap = snapshot({
      expense: 4_000_000,
      byCategory: [{ category: 'shop alpha', total: 1_000_000 }, { category: 'reksadana', total: 3_000_000 }],
    });
    const savings = new Set(['reksadana']);

    expect(cardValue(buildMoneyCards(snap, savings, fmt), 'Money out')).to.equal('IDR 1.000.000');
    expect(lineValue(buildSummaryLines(snap, savings, fmt), 'Moved to savings')).to.equal('IDR 3.000.000');
    expect(lineValue(buildSummaryLines(snap, savings, fmt), 'Savings rate')).to.equal('90%');
  });

  it('omits the savings line when nothing was moved', () => {
    expect(buildSummaryLines(snapshot(), new Set(), fmt).some(l => l.label === 'Moved to savings')).to.equal(false);
  });

  it('states no savings rate when there was no income', () => {
    expect(buildSummaryLines(snapshot({ income: 0 }), new Set(), fmt).some(l => l.label === 'Savings rate')).to.equal(false);
  });

  it('never reports negative spend when savings exceed recorded expense', () => {
    const snap = snapshot({ expense: 1_000_000, byCategory: [{ category: 'emas', total: 3_000_000 }] });
    expect(cardValue(buildMoneyCards(snap, new Set(['emas']), fmt), 'Money out')).to.equal('IDR 0');
  });

  it('matches savings categories regardless of case', () => {
    const snap = snapshot({ byCategory: [{ category: 'Reksa Dana', total: 2_000_000 }] });
    expect(savingsOutflow(snap, new Set(['reksa dana']))).to.equal(2_000_000);
  });
});

describe('monthly report — where the money went', () => {
  const savings = new Set(['reksadana']);
  const spread = snapshot({
    expense: 10_000_000,
    byCategory: [
      { category: 'category one', total: 4_000_000 },
      { category: 'category two', total: 2_000_000 },
      { category: 'category three', total: 1_500_000 },
      { category: 'category four', total: 1_000_000 },
      { category: 'category five', total: 800_000 },
      { category: 'category six', total: 500_000 },
      { category: 'category seven', total: 200_000 },
    ],
  });

  it('ranks by money and gives the largest a full bar', () => {
    const { categories } = buildCategories(spread, savings, fmt);
    expect(categories[0].name).to.equal('Category One');
    expect(categories[0].barPct).to.equal(100);
    expect(categories[0].share).to.equal(40);
  });

  it('rolls the tail into one muted row rather than listing everything', () => {
    const { categories } = buildCategories(spread, savings, fmt);
    const tail = categories[categories.length - 1];
    expect(tail.muted).to.equal(true);
    expect(tail.name).to.equal('2 smaller categories');
    expect(tail.value).to.equal('IDR 700.000');
  });

  it('leaves savings out of the breakdown, matching money out', () => {
    const snap = snapshot({
      expense: 5_000_000,
      byCategory: [{ category: 'reksadana', total: 3_000_000 }, { category: 'category one', total: 2_000_000 }],
    });
    const { categories } = buildCategories(snap, savings, fmt);
    expect(categories.map(c => c.name)).to.deep.equal(['Category One']);
  });

  it('says nothing when there is no spend to break down', () => {
    expect(buildCategories(snapshot({ expense: 0, byCategory: [] }), savings, fmt).categories).to.deep.equal([]);
  });
});

describe('monthly report — versus the month before', () => {
  const savings = new Set();
  const prior = snapshot({ income: 10_000_000, expense: 5_000_000, byCategory: [{ category: 'category one', total: 5_000_000 }] });

  it('leads with the money, not the percentage', () => {
    const current = snapshot({ expense: 8_000_000, byCategory: [{ category: 'category one', total: 8_000_000 }] });
    const [first] = buildComparison(current, prior, savings, fmt, 'July');
    expect(first).to.match(/^You spent IDR 3\.000\.000 more than in July/);
  });

  it('calls an immaterial move level instead of inventing a trend', () => {
    const current = snapshot({ expense: 5_010_000, byCategory: [{ category: 'category one', total: 5_010_000 }] });
    expect(buildComparison(current, prior, savings, fmt, 'July')[0]).to.equal('Your spending was level with July.');
  });

  it('has nothing to compare without a prior month', () => {
    expect(buildComparison(snapshot(), null, savings, fmt, 'July')).to.deep.equal([]);
  });

  it('names a one-off purchase as a one-off, not a habit', () => {
    const current = snapshot({
      expense: 9_000_000,
      byCategory: [{ category: 'category one', total: 5_000_000 }, { category: 'category two', total: 4_000_000 }],
    });
    const withPrior = { ...prior, byCategory: [{ category: 'category one', total: 5_000_000 }, { category: 'category two', total: 200_000, count: 1 }] };
    const current1 = { ...current, byCategory: [{ category: 'category one', total: 5_000_000 }, { category: 'category two', total: 4_000_000, count: 1 }] };
    expect(buildComparison(current1, withPrior, savings, fmt, 'July').join(' ')).to.match(/single purchase rather than a new habit/);
  });

  it('gives the headline chip a direction and a tone', () => {
    const cheaper = snapshot({ expense: 3_000_000, byCategory: [{ category: 'category one', total: 3_000_000 }] });
    expect(buildBadge(cheaper, prior, savings, fmt, 'July')).to.include({ tone: 'positive' });
    const dearer = snapshot({ expense: 9_000_000, byCategory: [{ category: 'category one', total: 9_000_000 }] });
    expect(buildBadge(dearer, prior, savings, fmt, 'July')).to.include({ tone: 'negative' });
    expect(buildBadge(snapshot(), null, savings, fmt, 'July')).to.equal(null);
  });
});

describe('monthly report — the month at a glance', () => {
  it('drops a tile it has no reading for rather than showing a zero', () => {
    const cells = buildGlance({
      snapshot: snapshot({ txCount: 0 }),
      netWorth: { current: null, prior: null },
      streak: { current: 0, longest: 0 },
      anomalyCount: 0,
      formatAmount: fmt,
    });
    expect(cells).to.deep.equal([]);
  });

  it('reports a net-worth move in money, and calls a small one flat', () => {
    const glance = (current, prior) => buildGlance({
      snapshot: snapshot({ txCount: 12 }),
      netWorth: { current, prior },
      streak: { current: 0, longest: 0 },
      anomalyCount: null,
      formatAmount: fmt,
    }).find(c => c.label === 'Net worth');

    expect(glance(60_000_000, 50_000_000).hint).to.equal('Up IDR 10.000.000 on the month');
    expect(glance(50_100_000, 50_000_000).hint).to.equal('Broadly flat on the month');
    expect(glance(50_000_000, null).hint).to.equal('First reading on record');
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
    expect(headlineLabel).to.equal('You overspent by');
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
    expect(report.subject).to.equal('You kept IDR 6.500.000 in August 2026');
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
    expect(nudge.subject).to.equal('Nothing recorded in August 2026');
    expect(nudge.html).to.not.contain('Money in');
  });

  it('asks for the one action that fixes it', () => {
    expect(nudge.html).to.contain('Add a transaction');
    expect(nudge.html).to.contain('https://example.test/add');
  });

  it('names what the entries buy the reader, then the next step', () => {
    expect(nudge.html).to.match(/Every category ranked by money/i);
    expect(nudge.html).to.match(/Repeating payments get spotted/i);
    expect(nudge.html).to.match(/Log the next thing you buy/i);
  });

  it('recalls the last month that had entries, when there was one', () => {
    const withHistory = nothingRecordedEmail({
      monthLabel: 'August 2026',
      appUrl: 'https://example.test',
      lastActive: { monthLabel: 'June 2026', cards: [{ label: 'Money in', value: 'IDR 9.000.000', tone: 'positive' }] },
    });
    expect(withHistory.html).to.contain('June 2026');
    expect(withHistory.html).to.contain('IDR 9.000.000');
  });

  it('leaves no unfilled placeholder', () => {
    expect(nudge.html).to.not.contain('undefined');
    expect(nudge.html).to.not.match(/\$\{/);
  });
});

describe('monthly report — the subject line', () => {
  const { subjectMonthOf } = require('../services/monthlyReport');
  const now = new Date('2026-09-04T00:00:00Z');

  it('leads with the number, so a truncating phone still shows it', () => {
    const subject = monthlyReportEmail({
      monthLabel: 'August 2026', subjectMonth: 'August',
      headlineLabel: 'You kept', headline: 'IDR 3.015.100', caption: 'c', appUrl: 'https://example.test',
    }).subject;
    expect(subject).to.equal('You kept IDR 3.015.100 in August');
    expect(subject.length).to.be.below(45);
  });

  it('drops the year for the current year and keeps it for a backfilled month', () => {
    expect(subjectMonthOf('2026-08', now)).to.equal('August');
    expect(subjectMonthOf('2025-12', now)).to.equal('December 2025');
  });

  it('says what happened when nothing was recorded', () => {
    expect(nothingRecordedEmail({ monthLabel: 'August 2026', subjectMonth: 'August', appUrl: 'x' }).subject)
      .to.equal('Nothing recorded in August');
  });
});

describe('monthly report — the email on a phone', () => {
  const html = monthlyReportEmail({
    monthLabel: 'August 2026',
    headlineLabel: 'You kept',
    headline: 'IDR 12.500.000',
    caption: 'caption',
    cards: [{ label: 'Money in', value: 'IDR 12.500.000', tone: 'positive' }, { label: 'Money out', value: 'IDR 4.000.000', tone: 'negative' }],
    lines: [{ label: 'Savings rate', value: '68%' }],
    appUrl: 'https://example.test',
  }).html;

  it('shrinks the headline on a narrow screen so a large figure cannot overflow', () => {
    expect(html).to.contain('max-width:440px');
    expect(html).to.contain('class="hero"');
    expect(html).to.match(/font-size:30px ?!important/);
  });

  it('keeps a readable size on a wide screen', () => {
    expect(html).to.contain('font-size:36px');
  });

  it('drops side-by-side cards into one column on a phone', () => {
    expect(html).to.contain('class="stack"');
    expect(html).to.match(/\.stack td \{ display:block ?!important/);
  });

  it('gives the layout room to breathe by trimming padding, not content', () => {
    expect(html).to.contain('class="shell"');
    expect(html).to.contain('class="pad"');
  });

  it('never sets a fixed pixel width that a phone cannot honour', () => {
    expect(html).to.contain('max-width:600px');
    expect(html).to.contain('width:100%');
  });
});
