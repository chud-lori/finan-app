import { describe, it, expect } from 'vitest';
import {
  buildDailySpend,
  buildMonthGrid,
  dayKey,
  groupTransactionsByDay,
  intensityLevel,
  monthFetchRange,
  resolveCalendarState,
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
    // Falls back to the host zone — assert the actual day, not just "a string",
    // or a wrong-day fallback would still pass.
    const local = new Date('2026-08-03T12:00:00.000Z').toLocaleDateString('en-CA');
    expect(dayKey('2026-08-03T12:00:00.000Z', 'Mars/Olympus')).to.equal(local);
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
    expect(cells.length % 7).to.equal(0);
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

// ── Regression cover for the month-boundary hole ──────────────────────────────
// The server bounds /range in the browser's zone (moment.tz(start, tz)), while
// buildDailySpend buckets each row in its own transaction_timezone. These
// helpers mirror the server so a test can assert "fetched AND rendered".
const tzOffsetMs = (tz, instantMs) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instantMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - instantMs;
};

const startOfZonedDay = (dayStr, tz) => {
  const guess = Date.parse(`${dayStr}T00:00:00Z`);
  const once  = guess - tzOffsetMs(tz, guess);
  return guess - tzOffsetMs(tz, once);
};

const serverWindow = (year, month, browserTz) => {
  const { start, end } = monthFetchRange(year, month);
  return {
    from: startOfZonedDay(start, browserTz),
    to:   startOfZonedDay(end, browserTz) + 86_400_000 - 1,
  };
};

const fetched = (isoTime, year, month, browserTz) => {
  const { from, to } = serverWindow(year, month, browserTz);
  const t = Date.parse(isoTime);
  return t >= from && t <= to;
};

describe('monthFetchRange — the fetch window covers every zone', () => {
  it('pads both ends of the month', () => {
    expect(monthFetchRange(2026, 8)).to.deep.equal({ start: '2026-07-30', end: '2026-09-02' });
    expect(monthFetchRange(2026, 1)).to.deep.equal({ start: '2025-12-30', end: '2026-02-02' });
    expect(monthFetchRange(2024, 2)).to.deep.equal({ start: '2024-01-30', end: '2024-03-02' });
  });

  it('fetches a row whose zone is behind the browser zone (west txn, east browser)', () => {
    // 03:00Z on 1 Sep is still 31 Aug 23:00 in New York -> belongs to August.
    const time = '2026-09-01T03:00:00.000Z';
    expect(fetched(time, 2026, 8, 'Asia/Jakarta')).to.equal(true);

    const res = buildDailySpend(
      [tx({ amount: 700, time, transaction_timezone: 'America/New_York' })],
      { yearMonth: '2026-08' },
    );
    expect(res.byDay['2026-08-31']).to.equal(700);
    expect(res.total).to.equal(700);
  });

  it('fetches a row whose zone is ahead of the browser zone (east txn, UTC browser)', () => {
    // 22:00Z on 31 Aug is already 1 Sep 05:00 in Jakarta -> belongs to September.
    const time = '2026-08-31T22:00:00.000Z';
    expect(fetched(time, 2026, 9, 'UTC')).to.equal(true);

    const res = buildDailySpend(
      [tx({ amount: 450, time, transaction_timezone: 'Asia/Jakarta' })],
      { yearMonth: '2026-09' },
    );
    expect(res.byDay['2026-09-01']).to.equal(450);
  });

  it('survives the widest possible zone spread (UTC+14 row, UTC-12 browser)', () => {
    const first = '2026-08-31T10:00:00.000Z'; // 1 Sep 00:00 in Kiritimati
    expect(dayKey(first, 'Pacific/Kiritimati')).to.equal('2026-09-01');
    expect(fetched(first, 2026, 9, 'Etc/GMT+12')).to.equal(true);

    const last = '2026-09-30T23:00:00.000Z'; // 30 Sep 11:00 in Etc/GMT+12
    expect(dayKey(last, 'Etc/GMT+12')).to.equal('2026-09-30');
    expect(fetched(last, 2026, 9, 'Pacific/Kiritimati')).to.equal(true);
  });

  it('does not let the padded days leak into the grid or the busiest day', () => {
    const res = buildDailySpend(
      [
        tx({ amount: 9_000, time: '2026-07-30T05:00:00.000Z' }),
        tx({ amount: 8_000, time: '2026-09-02T05:00:00.000Z' }),
        tx({ amount: 300,   time: '2026-08-14T05:00:00.000Z' }),
      ],
      { yearMonth: '2026-08' },
    );
    expect(Object.keys(res.byDay)).to.deep.equal(['2026-08-14']);
    expect(res.max).to.equal(300);
    expect(res.total).to.equal(300);
    expect(res.activeDays).to.equal(1);
  });
});

describe('resolveCalendarState — never guesses at the savings exclusion', () => {
  const range = (transactions) => ({ status: 'fulfilled', value: { data: { transactions } } });
  const groups = (list) => ({ status: 'fulfilled', value: { data: { groups: list } } });
  const failed = (message) => ({ status: 'rejected', reason: new Error(message) });

  it('passes both payloads through when they land', () => {
    const state = resolveCalendarState(
      range([tx({ id: 'x' })]),
      groups([{ group: 'essential', categories: [{ name: 'food' }] },
              { group: 'savings',   categories: [{ name: 'Reksa Dana' }, { name: 'emas' }] }]),
    );
    expect(state.error).to.equal('');
    expect(state.txns).to.have.lengthOf(1);
    expect(state.savings).to.deep.equal(['Reksa Dana', 'emas']);
  });

  it('errors instead of treating savings transfers as spending when the group summary fails', () => {
    // A 429 from the category rate limiter used to resolve to null, so savings
    // silently became [] and a payday investment painted the darkest cell.
    const state = resolveCalendarState(range([tx({ category: 'Reksa Dana', amount: 5_000_000 })]),
                                       failed('Too many requests'));
    expect(state.error).to.match(/savings/i);
    expect(state.txns).to.deep.equal([]);
    expect(state.savings).to.deep.equal([]);
  });

  it('clears the previous month savings list when the range fetch fails', () => {
    const state = resolveCalendarState(failed('Network error'), groups([{ group: 'savings', categories: [{ name: 'emas' }] }]));
    expect(state.error).to.equal('Network error');
    expect(state.txns).to.deep.equal([]);
    expect(state.savings).to.deep.equal([]);
  });

  it('treats a missing savings group as an empty list, not an error', () => {
    const state = resolveCalendarState(range([]), groups([{ group: 'essential', categories: [] }]));
    expect(state.error).to.equal('');
    expect(state.savings).to.deep.equal([]);
  });
});
