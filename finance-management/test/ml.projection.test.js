const { expect } = require('chai');
const { projectBalance } = require('../services/ml/projection');
const { computeRunway } = require('../services/ml/runway');

const AS_OF = '2026-08-15';
const MONTHLY_INCOME = [
  { date: '2026-05-01', amount: 10_000_000 },
  { date: '2026-06-01', amount: 10_000_000 },
  { date: '2026-07-01', amount: 10_000_000 },
  { date: '2026-08-01', amount: 10_000_000 },
];

describe('services/ml/projection — projectBalance', () => {
  it('starts at the current balance on day 0', () => {
    const p = projectBalance({ asOf: AS_OF, balance: 4_200_000, dailyPace: 50_000, bills: [{ merchant: 'rent', dueDate: '2026-08-20', amount: 2_000_000 }] });
    expect(p.points[0]).to.deep.equal({ date: AS_OF, balance: 4_200_000 });
    expect(p.points).to.have.lengthOf(91);
  });

  it('draws a straight line at the everyday pace when there are no recurring charges', () => {
    const p = projectBalance({ asOf: AS_OF, balance: 9_000_000, dailyPace: 75_000, bills: [] });
    p.points.forEach((pt, day) => expect(pt.balance).to.equal(9_000_000 - 75_000 * day));
    expect(p.checkpoints.map(c => c.balance)).to.deep.equal([6_750_000, 4_500_000, 2_250_000]);
  });

  it('subtracts a one-off bill inside the window exactly once, on its due date', () => {
    const p = projectBalance({ asOf: AS_OF, balance: 5_000_000, dailyPace: 0, bills: [{ merchant: 'insurance', dueDate: '2026-09-10', amount: 800_000 }] });
    expect(p.bills).to.deep.equal([{ merchant: 'insurance', date: '2026-09-10', amount: 800_000 }]);
    const drops = p.points.slice(1).filter((pt, i) => pt.balance !== p.points[i].balance);
    expect(drops).to.have.lengthOf(1);
    expect(drops[0].date).to.equal('2026-09-10');
    expect(p.points[90].balance).to.equal(4_200_000);
  });

  it('repeats a monthly bill on its cadence, each date once', () => {
    const p = projectBalance({ asOf: AS_OF, balance: 10_000_000, dailyPace: 0, bills: [{ merchant: 'rent', dueDate: '2026-08-20', amount: 1_000_000, intervalDays: 30 }] });
    const dates = p.bills.map(b => b.date);
    expect(dates).to.deep.equal(['2026-08-20', '2026-09-19', '2026-10-19']);
    expect(new Set(dates).size).to.equal(dates.length);
    expect(p.points[90].balance).to.equal(7_000_000);
  });

  it('counts a bill due today once, in the first step, leaving day 0 untouched', () => {
    const p = projectBalance({ asOf: AS_OF, balance: 1_000_000, dailyPace: 0, bills: [{ merchant: 'phone', dueDate: AS_OF, amount: 100_000 }] });
    expect(p.points[0].balance).to.equal(1_000_000);
    expect(p.points[1].balance).to.equal(900_000);
    expect(p.points[90].balance).to.equal(900_000);
  });

  it('adds income on its pay dates', () => {
    const p = projectBalance({ asOf: AS_OF, balance: 0, dailyPace: 0, income: { nextDate: '2026-09-01', intervalDays: 31, amount: 10_000_000 } });
    expect(p.income.map(i => i.date)).to.deep.equal(['2026-09-01', '2026-10-02', '2026-11-02']);
    expect(p.points[90].balance).to.equal(30_000_000);
  });

  it('reports the first day the balance goes below zero', () => {
    const p = projectBalance({ asOf: AS_OF, balance: 1_000_000, dailyPace: 100_000 });
    expect(p.runsOut).to.deep.equal({ day: 11, date: '2026-08-26' });
    expect(p.lowest.day).to.equal(90);
  });
});

describe('services/ml/runway — balance projection', () => {
  const base = { asOf: AS_OF, balance: 5_000_000, incomeEvents: MONTHLY_INCOME, discretionaryDaily: 100_000 };

  it('projects 30, 60 and 90 days out with the income it assumed', () => {
    const r = computeRunway({ ...base, bills: [{ merchant: 'netflix', dueDate: '2026-08-20', amount: 200_000, intervalDays: 30 }] });
    expect(r.projection.checkpoints.map(c => c.day)).to.deep.equal([30, 60, 90]);
    expect(r.projection.incomeAssumed).to.equal(true);
    expect(r.projection.income).to.have.lengthOf(3);
    expect(r.projection.bills.map(b => b.date)).to.deep.equal(['2026-08-20', '2026-09-19', '2026-10-19']);
    expect(r.projection.points[0].balance).to.equal(r.currentBalance);
  });

  it('names a bill that is overdue instead of projecting it on a date already gone', () => {
    const r = computeRunway({ ...base, bills: [{ merchant: 'rent', dueDate: '2026-08-10', amount: 3_000_000, intervalDays: 30 }] });
    expect(r.projection.overdueBills).to.deep.equal([{ merchant: 'rent', dueDate: '2026-08-10', amount: 3_000_000, daysLate: 5 }]);
    expect(r.projection.bills.map(b => b.date)).to.deep.equal(['2026-09-09', '2026-10-09', '2026-11-08']);
  });

  it('treats a bill more than one cycle late as ended', () => {
    const r = computeRunway({ ...base, bills: [{ merchant: 'old gym', dueDate: '2026-06-01', amount: 400_000, intervalDays: 30 }] });
    expect(r.projection.overdueBills).to.deep.equal([]);
    expect(r.projection.bills).to.deep.equal([]);
  });

  it('assumes no income at all when the income cadence is irregular', () => {
    const r = computeRunway({ ...base, incomeEvents: [{ date: '2026-08-01', amount: 4_000_000 }] });
    expect(r.mode).to.equal('rolling');
    expect(r.projection.incomeAssumed).to.equal(false);
    expect(r.projection.income).to.deep.equal([]);
    r.projection.points.forEach((pt, day) => expect(pt.balance).to.equal(5_000_000 - 100_000 * day));
  });

  it('agrees with the runway on the day the balance runs out', () => {
    const r = computeRunway({ ...base, incomeEvents: [], balance: 3_000_000, discretionaryDaily: 200_000 });
    expect(r.runwayDays).to.equal(16);
    expect(r.projection.runsOut.day).to.equal(16);
  });
});
