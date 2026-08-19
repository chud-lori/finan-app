import { describe, it, expect } from 'vitest';
import {
  buildDailySpend,
  buildMonthGrid,
  dayKey,
  groupTransactionsByDay,
  intensityLevel,
  weekdayLabels,
} from './spendingCalendar';

const tx = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  category: 'food',
  amount: 1000,
  time: '2026-08-10T04:00:00.000Z',
  transaction_timezone: 'UTC',
  ...over,
});

describe('dayKey — timezone bucketing', () => {
  it('buckets by the clock of the transaction timezone, not UTC', () => {
    // 23:40 in Jakarta on the 3rd is 16:40Z on the 3rd — same day either way.
    expect(dayKey('2026-08-03T16:40:00.000Z', 'Asia/Jakarta')).to.equal('2026-08-03');
    // 00:30 in Jakarta on the 4th is 17:30Z on the 3rd — UTC would lose a day.
    expect(dayKey('2026-08-03T17:30:00.000Z', 'Asia/Jakarta')).to.equal('2026-08-04');
    expect(dayKey('2026-08-03T17:30:00.000Z', 'UTC')).to.equal('2026-08-03');
  });

  it('handles zones behind UTC', () => {
    expect(dayKey('2026-08-01T03:00:00.000Z', 'America/New_York')).to.equal('2026-07-31');
  });

  it('falls back instead of throwing on an unknown zone', () => {
    expect(dayKey('2026-08-03T12:00:00.000Z', 'Mars/Olympus')).to.be.a('string');
    expect(dayKey('not a date', 'UTC')).to.equal(null);
  });
});

describe('buildMonthGrid — weekday alignment', () => {
  it('offsets the first day for a Monday-start week', () => {
    // 1 Aug 2026 is a Saturday -> 5 blanks before it when the week starts Monday
    const cells = buildMonthGrid(2026, 8, 'monday');
    expect(cells.slice(0, 5).every((c) => c === null)).to.equal(true);
    expect(cells[5]).to.deep.equal({ day: 1, key: '2026-08-01' });
    expect(cells.length % 7).to.equal(0);
  });

  it('offsets the first day for a Sunday-start week', () => {
    const cells = buildMonthGrid(2026, 8, 'sunday');
    expect(cells.slice(0, 6).every((c) => c === null)).to.equal(true);
    expect(cells[6]).to.deep.equal({ day: 1, key: '2026-08-01' });
  });

  it('covers every day of the month including a leap February', () => {
    const feb = buildMonthGrid(2024, 2, 'monday');
    expect(feb.filter(Boolean).length).to.equal(29);
    expect(feb.filter(Boolean).at(-1)).to.deep.equal({ day: 29, key: '2024-02-29' });
  });

  it('labels weekdays in the preferred order', () => {
    expect(weekdayLabels('monday')[0]).to.equal('Mon');
    expect(weekdayLabels('sunday')[0]).to.equal('Sun');
    expect(weekdayLabels()).to.have.lengthOf(7);
  });
});

describe('buildDailySpend', () => {
  it('sums expenses per day and reports the month maximum', () => {
    const res = buildDailySpend(
      [
        tx({ amount: 100, time: '2026-08-02T05:00:00.000Z' }),
        tx({ amount: 250, time: '2026-08-02T09:00:00.000Z' }),
        tx({ amount: 400, time: '2026-08-07T09:00:00.000Z' }),
      ],
      { yearMonth: '2026-08' },
    );
    expect(res.byDay['2026-08-02']).to.equal(350);
    expect(res.byDay['2026-08-07']).to.equal(400);
    expect(res.max).to.equal(400);
    expect(res.total).to.equal(750);
    expect(res.activeDays).to.equal(2);
  });

  it('ignores income', () => {
    const res = buildDailySpend([tx({ type: 'income', amount: 9000 })], { yearMonth: '2026-08' });
    expect(res.total).to.equal(0);
    expect(res.max).to.equal(0);
  });

  it('excludes savings-group outflow from the day total', () => {
    const txns = [
      tx({ amount: 300, category: 'food',    time: '2026-08-05T05:00:00.000Z' }),
      tx({ amount: 900, category: 'Reksa Dana', time: '2026-08-05T06:00:00.000Z' }),
    ];
    const res = buildDailySpend(txns, { yearMonth: '2026-08', savingsCategories: ['reksa dana'] });
    expect(res.byDay['2026-08-05']).to.equal(300);
    expect(res.total).to.equal(300);
  });

  it('drops days that fall outside the requested month once bucketed locally', () => {
    const res = buildDailySpend(
      [
        tx({ amount: 500, time: '2026-08-01T03:00:00.000Z', transaction_timezone: 'America/New_York' }),
        tx({ amount: 200, time: '2026-08-06T03:00:00.000Z', transaction_timezone: 'UTC' }),
      ],
      { yearMonth: '2026-08' },
    );
    expect(res.byDay['2026-07-31']).to.equal(undefined);
    expect(res.total).to.equal(200);
  });

  it('returns an empty shape for a month with no transactions', () => {
    const res = buildDailySpend([], { yearMonth: '2026-08' });
    expect(res).to.deep.equal({ byDay: {}, total: 0, max: 0, activeDays: 0 });
  });
});

describe('groupTransactionsByDay', () => {
  it('keeps income and savings rows for the drill-down, ordered by time', () => {
    const byDay = groupTransactionsByDay([
      tx({ id: 'b', time: '2026-08-04T10:00:00.000Z' }),
      tx({ id: 'a', time: '2026-08-04T02:00:00.000Z', type: 'income' }),
      tx({ id: 'c', time: '2026-08-05T02:00:00.000Z', category: 'reksa dana' }),
    ]);
    expect(byDay['2026-08-04'].map((t) => t.id)).to.deep.equal(['a', 'b']);
    expect(byDay['2026-08-05']).to.have.lengthOf(1);
  });
});

describe('intensityLevel', () => {
  it('is 0 for a zero-spend day so it renders empty, never pale-but-coloured', () => {
    expect(intensityLevel(0, 1000)).to.equal(0);
    expect(intensityLevel(500, 0)).to.equal(0);
    expect(intensityLevel(undefined, 1000)).to.equal(0);
  });

  it('scales against the month maximum, not an absolute currency band', () => {
    expect(intensityLevel(100, 1000)).to.equal(1);
    expect(intensityLevel(400, 1000)).to.equal(2);
    expect(intensityLevel(700, 1000)).to.equal(3);
    expect(intensityLevel(1000, 1000)).to.equal(4);
    // Same ratio, different currency magnitude -> same level
    expect(intensityLevel(1_000_000, 10_000_000)).to.equal(1);
  });
});
