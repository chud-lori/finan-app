import { describe, it, expect } from 'vitest';
import { runwayBreakdown, forecastBreakdown, budgetStatus, billSchedule } from './cashFlow';

const total = (b) => b.rows.reduce((s, r) => s + r.amount, 0);

describe('runwayBreakdown', () => {
  const payday = {
    mode: 'payday', currentBalance: 5_000_000, daysUntilIncome: 17, discretionaryDaily: 100_000,
    billsBeforeIncome: [{ merchant: 'netflix', amount: 200_000 }], billsTotal: 200_000, safeToSpend: 3_100_000,
  };

  it('reproduces safe-to-spend from the balance, the bills and the pace on screen', () => {
    const b = runwayBreakdown(payday);
    expect(b.rows.map(r => r.key)).to.deep.equal(['balance', 'bills', 'pace']);
    expect(total(b)).to.equal(3_100_000);
    expect(b.total).to.equal(3_100_000);
    expect(b.reconciles).to.equal(true);
  });

  it('states the days and per-day pace behind the everyday-spending row', () => {
    const pace = runwayBreakdown(payday).rows.find(r => r.key === 'pace');
    expect(pace.days).to.equal(17);
    expect(pace.perDay).to.equal(100_000);
    expect(pace.amount).to.equal(-1_700_000);
  });

  it('drops the pace row when there is no payday to spend towards', () => {
    const b = runwayBreakdown({
      mode: 'rolling', currentBalance: 3_000_000, discretionaryDaily: 200_000,
      billsBeforeIncome: [], billsTotal: 0, safeToSpend: 3_000_000,
    });
    expect(b.rows.map(r => r.key)).to.deep.equal(['balance', 'bills']);
    expect(b.rows[1].label).to.equal('Upcoming bills');
    expect(b.reconciles).to.equal(true);
  });

  it('returns null without a runway', () => {
    expect(runwayBreakdown(null)).to.equal(null);
  });
});

describe('forecastBreakdown', () => {
  const forecast = {
    available: true, forecast: 4_610_000, spent_so_far: 2_000_000, daily_average: 87_000,
    days_left: 30, due_later: 0, budget: 5_000_000, over_budget: false, variance: -390_000,
  };

  it('adds up to the projected month-end spend', () => {
    const b = forecastBreakdown(forecast);
    expect(total(b)).to.equal(b.total);
    expect(b.total).to.equal(4_610_000);
  });

  it('still adds up when the displayed pace was rounded', () => {
    const b = forecastBreakdown({ ...forecast, forecast: 3_400_015, spent_so_far: 1_000_000, daily_average: 80_000, due_later: 0 });
    expect(total(b)).to.equal(3_400_015);
  });

  it('lists bills still due on their own row', () => {
    const b = forecastBreakdown({ ...forecast, forecast: 5_110_000, due_later: 500_000 });
    expect(b.rows.find(r => r.key === 'due').amount).to.equal(500_000);
    expect(total(b)).to.equal(5_110_000);
  });

  it('returns null while the forecast is not ready', () => {
    expect(forecastBreakdown({ available: false })).to.equal(null);
  });
});

describe('budgetStatus', () => {
  it('reports how far under budget the month is heading', () => {
    const s = budgetStatus({ available: true, forecast: 4_000_000, spent_so_far: 1_000_000, budget: 5_000_000, over_budget: false, variance: -1_000_000 });
    expect(s.over).to.equal(false);
    expect(s.gap).to.equal(1_000_000);
    expect(s.spentPct).to.equal(20);
    expect(s.projectedPct).to.equal(80);
  });

  it('caps the bars at the budget when the month runs over', () => {
    const s = budgetStatus({ available: true, forecast: 6_000_000, spent_so_far: 5_500_000, budget: 5_000_000, over_budget: true, variance: 1_000_000 });
    expect(s.over).to.equal(true);
    expect(s.projectedPct).to.equal(100);
  });

  it('is absent for someone with no budget set', () => {
    expect(budgetStatus({ available: true, forecast: 1, spent_so_far: 1 })).to.equal(null);
  });
});

describe('billSchedule', () => {
  it('folds repeat charges into one row per bill, in the order they first land', () => {
    const rows = billSchedule([
      { merchant: 'netflix', date: '2026-08-20', amount: 200_000 },
      { merchant: 'rent', date: '2026-09-01', amount: 3_000_000 },
      { merchant: 'netflix', date: '2026-09-19', amount: 200_000 },
    ]);
    expect(rows).to.deep.equal([
      { merchant: 'netflix', dates: ['2026-08-20', '2026-09-19'], total: 400_000 },
      { merchant: 'rent', dates: ['2026-09-01'], total: 3_000_000 },
    ]);
  });

  it('is empty when nothing recurs', () => {
    expect(billSchedule([])).to.deep.equal([]);
  });
});
