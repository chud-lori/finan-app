const { expect } = require('chai');
const { computeRunway, detectIncomeCadence, materialPriceChanges } = require('../services/ml/runway');

// Four monthly paychecks ending 2026-08-01.
const MONTHLY_INCOME = [
  { date: '2026-05-01', amount: 10_000_000 },
  { date: '2026-06-01', amount: 10_000_000 },
  { date: '2026-07-01', amount: 10_000_000 },
  { date: '2026-08-01', amount: 10_000_000 },
];

describe('services/ml/runway — detectIncomeCadence', () => {
  it('reads a monthly salary rhythm and projects the next payday', () => {
    const cad = detectIncomeCadence(MONTHLY_INCOME, '2026-08-15');
    expect(cad.regular).to.equal(true);
    expect(cad.cadence).to.equal('monthly');
    expect(cad.typicalIncome).to.equal(10_000_000);
    expect(cad.nextIncomeDate).to.equal('2026-09-01'); // 2026-08-01 + 31d
  });

  it('reads a biweekly rhythm', () => {
    const biweekly = [
      { date: '2026-06-20', amount: 5_000_000 },
      { date: '2026-07-04', amount: 5_000_000 },
      { date: '2026-07-18', amount: 5_000_000 },
      { date: '2026-08-01', amount: 5_000_000 },
    ];
    const cad = detectIncomeCadence(biweekly, '2026-08-05');
    expect(cad.regular).to.equal(true);
    expect(cad.cadence).to.equal('biweekly');
  });

  it('gives up (irregular) with fewer than three income events', () => {
    expect(detectIncomeCadence([{ date: '2026-08-01', amount: 100 }], '2026-08-15').regular).to.equal(false);
  });
});

describe('services/ml/runway — computeRunway', () => {
  describe('payday mode', () => {
    const runway = computeRunway({
      asOf: '2026-08-15',
      balance: 5_000_000,
      incomeEvents: MONTHLY_INCOME,
      bills: [{ merchant: 'netflix', dueDate: '2026-08-20', amount: 200_000 }],
      discretionaryDaily: 100_000,
    });

    it('detects the next payday and the days until it', () => {
      expect(runway.mode).to.equal('payday');
      expect(runway.cadence).to.equal('monthly');
      expect(runway.nextIncomeDate).to.equal('2026-09-01');
      expect(runway.daysUntilIncome).to.equal(17); // 2026-08-15 → 2026-09-01
      expect(runway.expectedIncome).to.equal(10_000_000);
    });

    it('counts only bills that fall before the next payday', () => {
      expect(runway.billsBeforeIncome).to.have.lengthOf(1);
      expect(runway.billsTotal).to.equal(200_000);
    });

    it('computes safe-to-spend as balance minus bills minus run-rate to payday', () => {
      // 5,000,000 − 200,000 − 100,000 × 17 = 3,100,000
      expect(runway.safeToSpend).to.equal(3_100_000);
      expect(runway.status).to.equal('healthy');
      expect(runway.runwayDays).to.equal(null); // income replenishes before zero
    });
  });

  it('flags negative status when the balance cannot reach the next payday', () => {
    const runway = computeRunway({
      asOf: '2026-08-15',
      balance: 1_000_000,
      incomeEvents: MONTHLY_INCOME,
      bills: [],
      discretionaryDaily: 100_000,
    });
    // 1,000,000 − 100,000 × 17 = −700,000
    expect(runway.safeToSpend).to.equal(-700_000);
    expect(runway.status).to.equal('negative');
  });

  describe('rolling fallback (unclear income cadence)', () => {
    const runway = computeRunway({
      asOf: '2026-08-15',
      balance: 3_000_000,
      incomeEvents: [{ date: '2026-08-01', amount: 4_000_000 }], // one event → irregular
      bills: [],
      discretionaryDaily: 200_000,
    });

    it('falls back to a rolling runway with no payday horizon', () => {
      expect(runway.mode).to.equal('rolling');
      expect(runway.regularIncome).to.equal(false);
      expect(runway.nextIncomeDate).to.equal(null);
    });

    it('projects the day the balance would hit zero', () => {
      // 3,000,000 / 200,000/day → goes negative on day 16
      expect(runway.runwayDays).to.equal(16);
      expect(runway.status).to.equal('tight');
      expect(runway.safeToSpend).to.equal(3_000_000);
    });
  });

  it('is a guide — always returns the disclaimer note', () => {
    expect(computeRunway({ asOf: '2026-08-15', balance: 0 }).note).to.match(/guide/i);
  });

  describe('recurring price changes', () => {
    const changes = [
      { type: 'price_up', merchant: 'shop alpha', from: 100_000, to: 160_000, pct: 60 },
      { type: 'price_up', merchant: 'shop beta', from: 15_000, to: 20_000, pct: 33 },
    ];

    it('surfaces a price rise in money, both figures, and drops the percentage', () => {
      const out = materialPriceChanges(changes, 1_000_000);
      expect(out).to.deep.equal([{ merchant: 'shop alpha', from: 100_000, to: 160_000 }]);
    });

    it('hides a rise too small to matter against the recurring bill total', () => {
      expect(materialPriceChanges(changes, 10_000_000)).to.deep.equal([]);
    });

    it('reaches the runway payload, biggest money rise first', () => {
      const runway = computeRunway({
        asOf: '2026-08-15', balance: 5_000_000,
        priceChanges: [...changes].reverse(), recurringMonthlyTotal: 200_000,
      });
      expect(runway.priceChanges.map((c) => c.merchant)).to.deep.equal(['shop alpha', 'shop beta']);
    });

    it('is an empty list when the detector reports nothing', () => {
      expect(computeRunway({ asOf: '2026-08-15', balance: 0 }).priceChanges).to.deep.equal([]);
    });
  });
});
