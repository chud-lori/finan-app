import { describe, it, expect } from 'vitest';
import {
  parseFilters, filterParams, hasActiveFilters, activeChips, clearChip,
  makePredicate, applyFilters, buildCategoryRows, buildMonthlyTotals,
  buildPeriodStats, isFilteredEmpty, periodBounds, parseView, viewToSearch,
  monthKey, savingsRateOf, EMPTY_FILTERS,
} from './analyticsFilters';

const sp = (obj) => new URLSearchParams(obj);

describe('analyticsFilters — URL round-trip', () => {
  it('restores a full filter set through serialise → parse', () => {
    const filters = { category: 'food', group: 'essential', type: 'expense', min: '10000', max: '500000' };
    expect(parseFilters(sp(filterParams(filters)))).to.deep.equal(filters);
  });

  it('serialises nothing for a pristine filter set', () => {
    expect(filterParams(EMPTY_FILTERS)).to.deep.equal({});
    expect(hasActiveFilters(EMPTY_FILTERS)).to.equal(false);
    expect(parseFilters(sp({}))).to.deep.equal(EMPTY_FILTERS);
  });

  it('drops values that are not on the allowed list instead of trusting the URL', () => {
    const parsed = parseFilters(sp({ grp: 'nonsense', type: 'transfer', min: '-5', max: 'abc' }));
    expect(parsed.group).to.equal('');
    expect(parsed.type).to.equal('');
    expect(parsed.min).to.equal('');
    expect(parsed.max).to.equal('');
  });

  it('does not treat a zero minimum as an active filter', () => {
    expect(parseFilters(sp({ min: '0' }))).to.deep.equal(EMPTY_FILTERS);
    expect(filterParams({ ...EMPTY_FILTERS, min: '0' })).to.deep.equal({});
    expect(hasActiveFilters({ ...EMPTY_FILTERS, min: '0' })).to.equal(false);
    expect(activeChips({ ...EMPTY_FILTERS, min: '0' })).to.deep.equal([]);
  });

  it('normalises category case so the URL and the predicate agree', () => {
    expect(parseFilters(sp({ cat: 'FOOD' })).category).to.equal('food');
    expect(filterParams({ ...EMPTY_FILTERS, category: '  Food ' }).cat).to.equal('food');
  });

  it('round-trips the period alongside the filters', () => {
    const view = { tab: 'Monthly', year: 2024, month: 3, filters: { ...EMPTY_FILTERS, group: 'savings' } };
    const restored = parseView(sp(viewToSearch(view)), { tab: 'Yearly', year: 1999, month: 1 });
    expect(restored.tab).to.equal('Monthly');
    expect(restored.year).to.equal(2024);
    expect(restored.month).to.equal(3);
    expect(restored.filters.group).to.equal('savings');
  });

  it('falls back to the caller defaults when the URL carries nothing usable', () => {
    const fallback = { tab: 'Monthly', year: 2026, month: 8 };
    expect(parseView(sp({ tab: 'weekly', y: 'x', m: '13' }), fallback)).to.include(fallback);
  });
});

describe('analyticsFilters — predicate composition', () => {
  const groupOf = { food: 'essential', shopping: 'discretionary', salary: 'income' };
  const txns = [
    { id: '1', category: 'food',     type: 'expense', amount: 50_000,    time: '2024-03-02T12:00:00Z' },
    { id: '2', category: 'food',     type: 'expense', amount: 900_000,   time: '2024-03-09T12:00:00Z' },
    { id: '3', category: 'shopping', type: 'expense', amount: 300_000,   time: '2024-04-01T12:00:00Z' },
    { id: '4', category: 'salary',   type: 'income',  amount: 9_000_000, time: '2024-03-01T12:00:00Z' },
  ];

  it('keeps everything when no filter is set', () => {
    expect(applyFilters(txns, EMPTY_FILTERS, groupOf)).to.have.length(4);
  });

  it('ANDs every dimension together', () => {
    const kept = applyFilters(txns, { ...EMPTY_FILTERS, group: 'essential', type: 'expense', min: '100000' }, groupOf);
    expect(kept.map(t => t.id)).to.deep.equal(['2']);
  });

  it('applies min and max inclusively', () => {
    const pred = makePredicate({ ...EMPTY_FILTERS, min: '50000', max: '300000' }, groupOf);
    expect(txns.filter(pred).map(t => t.id)).to.deep.equal(['1', '3']);
  });

  it('treats a category with no known group as "other"', () => {
    const pred = makePredicate({ ...EMPTY_FILTERS, group: 'other' }, {});
    expect(txns.filter(pred)).to.have.length(4);
  });

  it('matches the category filter case-insensitively', () => {
    expect(applyFilters(txns, { ...EMPTY_FILTERS, category: 'FOOD' }, groupOf)).to.have.length(2);
  });
});

describe('analyticsFilters — recomputed chart rows', () => {
  const txns = [
    { category: 'food',   type: 'expense', amount: 100, time: '2024-03-02T12:00:00Z' },
    { category: 'food',   type: 'expense', amount: 300, time: '2024-04-02T12:00:00Z' },
    { category: 'rent',   type: 'expense', amount: 900, time: '2024-03-01T12:00:00Z' },
    { category: 'salary', type: 'income',  amount: 5000, time: '2024-03-01T12:00:00Z' },
  ];

  it('aggregates the requested kind only, sorted by total', () => {
    const rows = buildCategoryRows(txns, 'expense');
    expect(rows.map(r => r.category)).to.deep.equal(['rent', 'food']);
    expect(rows[1]).to.include({ total: 400, count: 2, activeMonths: 2, avgMonthly: 200 });
  });

  it('aggregates income when asked for it', () => {
    expect(buildCategoryRows(txns, 'income').map(r => r.category)).to.deep.equal(['salary']);
  });

  it('produces twelve monthly buckets and a period total', () => {
    const months = buildMonthlyTotals(txns);
    expect(months).to.have.length(12);
    expect(months[2].expense).to.equal(1000);
    expect(months[2].income).to.equal(5000);
    expect(buildPeriodStats(txns)).to.deep.equal({ income: 5000, expense: 1300 });
  });

  it('is empty-safe', () => {
    expect(buildCategoryRows(null)).to.deep.equal([]);
    expect(buildPeriodStats(undefined)).to.deep.equal({ income: 0, expense: 0 });
  });
});

describe('analyticsFilters — empty state and chips', () => {
  it('only calls it an empty state when a filter caused it', () => {
    expect(isFilteredEmpty(EMPTY_FILTERS, [])).to.equal(false);
    expect(isFilteredEmpty({ ...EMPTY_FILTERS, category: 'food' }, [])).to.equal(true);
    expect(isFilteredEmpty({ ...EMPTY_FILTERS, category: 'food' }, [{ category: 'food' }])).to.equal(false);
  });

  it('renders one chip per active dimension, with amount collapsed into one', () => {
    const chips = activeChips({ category: 'food', group: 'essential', type: 'expense', min: '10', max: '20' }, n => `$${n}`);
    expect(chips.map(c => c.key)).to.deep.equal(['category', 'group', 'type', 'amount']);
    expect(chips[3].value).to.equal('$10 – $20');
  });

  it('describes a one-sided amount range', () => {
    expect(activeChips({ ...EMPTY_FILTERS, min: '10' }, n => `$${n}`)[0].value).to.equal('≥ $10');
    expect(activeChips({ ...EMPTY_FILTERS, max: '20' }, n => `$${n}`)[0].value).to.equal('≤ $20');
  });

  it('clearing the amount chip clears both bounds', () => {
    expect(clearChip({ ...EMPTY_FILTERS, min: '10', max: '20' }, 'amount')).to.deep.equal(EMPTY_FILTERS);
    expect(clearChip({ ...EMPTY_FILTERS, group: 'social' }, 'group').group).to.equal('');
  });
});

// The server buckets every row by its own `transaction_timezone`; the client
// re-aggregation has to agree or the same month reads two different totals.
describe('analyticsFilters — timezone bucketing', () => {
  // 2024-04-01T02:00Z is 2024-03-31 22:00 in New York → March.
  const inNewYork = { category: 'food', type: 'expense', amount: 150_000, time: '2024-04-01T02:00:00Z', transaction_timezone: 'America/New_York' };
  // 2024-03-31T21:00Z is 2024-04-01 04:00 in Jakarta → April.
  const inJakarta = { category: 'food', type: 'expense', amount: 150_000, time: '2024-03-31T21:00:00Z', transaction_timezone: 'Asia/Jakarta' };

  it('buckets a month in the transaction own zone, not the browser zone', () => {
    expect(monthKey(inNewYork)).to.equal('2024-03');
    expect(monthKey(inJakarta)).to.equal('2024-04');
  });

  it('puts the yearly bars in the month the transaction zone saw', () => {
    expect(buildMonthlyTotals([inNewYork])[2].expense).to.equal(150_000); // March
    expect(buildMonthlyTotals([inJakarta])[3].expense).to.equal(150_000); // April
  });

  it('counts active months per zone, so avg monthly is not doubled', () => {
    const [row] = buildCategoryRows([inNewYork, inJakarta], 'expense');
    expect(row).to.include({ total: 300_000, activeMonths: 2, avgMonthly: 150_000 });
  });

  it('falls back to the browser zone on a missing or unknown zone', () => {
    expect(monthKey({ time: '2024-06-15T12:00:00Z' })).to.equal('2024-06');
    expect(monthKey({ time: '2024-06-15T12:00:00Z', transaction_timezone: 'Mars/Olympus' })).to.equal('2024-06');
    expect(monthKey({ time: 'not a date' })).to.equal('');
  });
});

describe('analyticsFilters — savings rate honesty', () => {
  it('reports the rate for the untouched period', () => {
    expect(savingsRateOf({ income: 10_000, expense: 8_000 }, EMPTY_FILTERS)).to.equal(20);
  });

  it('refuses a rate for a filtered subset instead of reading 100%', () => {
    const incomeOnly = { income: 10_000, expense: 0 };
    expect(savingsRateOf(incomeOnly, { ...EMPTY_FILTERS, type: 'income' })).to.equal(null);
    expect(savingsRateOf(incomeOnly, { ...EMPTY_FILTERS, min: '5000' })).to.equal(null);
    expect(savingsRateOf(incomeOnly, { ...EMPTY_FILTERS, category: 'salary' })).to.equal(null);
  });

  it('has no rate without income', () => {
    expect(savingsRateOf({ income: 0, expense: 500 }, EMPTY_FILTERS)).to.equal(null);
    expect(savingsRateOf(null, EMPTY_FILTERS)).to.equal(null);
  });
});

describe('analyticsFilters — period bounds', () => {
  it('spans the whole selected month, leap year included', () => {
    expect(periodBounds('Monthly', 2024, 2)).to.deep.equal(['2024-02-01', '2024-02-29']);
    expect(periodBounds('Monthly', 2024, 12)).to.deep.equal(['2024-12-01', '2024-12-31']);
  });

  it('spans the whole year outside the monthly tab', () => {
    expect(periodBounds('Yearly', 2024, 5)).to.deep.equal(['2024-01-01', '2024-12-31']);
  });
});
