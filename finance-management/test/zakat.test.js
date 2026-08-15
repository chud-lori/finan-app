const { expect } = require('chai');
const { estimateZakat } = require('../helpers/zakat');

describe('zakat helper — estimateZakat (pure)', () => {
    it('computes 2.5% of liquid assets minus short-term debts, excluding illiquid assets', () => {
        const holdings = {
            assets: [
                { amount: 50_000_000,  type: 'cash' },
                { amount: 30_000_000,  type: 'investment' },
                { amount: 5_000_000,   type: 'receivable' },
                { amount: 500_000_000, type: 'property' }, // excluded — not zakatable
                { amount: 200_000_000, type: 'vehicle' },  // excluded — personal use
            ],
            liabilities: [
                { amount: 5_000_000,   type: 'credit_card' },
                { amount: 100_000_000, type: 'mortgage' },  // long-term — not deducted
            ],
        };
        const r = estimateZakat(holdings, 0, null);
        expect(r.zakatableAssets).to.equal(85_000_000);
        expect(r.deductibleDebts).to.equal(5_000_000);
        expect(r.zakatableBase).to.equal(80_000_000);
        expect(r.zakatDue).to.equal(2_000_000); // 2.5% of 80,000,000
        expect(r.meetsNisab).to.equal(null);    // no nisab supplied
    });

    it('tracks giving against the estimate (remaining + coverage)', () => {
        const r = estimateZakat({ assets: [{ amount: 40_000_000, type: 'cash' }], liabilities: [] }, 500_000, null);
        expect(r.zakatDue).to.equal(1_000_000);
        expect(r.givingYtd).to.equal(500_000);
        expect(r.remaining).to.equal(500_000);
        expect(r.coverage).to.equal(50);
    });

    it('returns zero due below an explicit nisab', () => {
        const r = estimateZakat({ assets: [{ amount: 10_000_000, type: 'cash' }], liabilities: [] }, 0, 85_000_000);
        expect(r.meetsNisab).to.equal(false);
        expect(r.zakatDue).to.equal(0);
    });

    it('applies zakat when the base clears the nisab', () => {
        const r = estimateZakat({ assets: [{ amount: 100_000_000, type: 'cash' }], liabilities: [] }, 0, 85_000_000);
        expect(r.meetsNisab).to.equal(true);
        expect(r.zakatDue).to.equal(2_500_000);
    });

    it('never lets debts push the base below zero', () => {
        const r = estimateZakat({ assets: [{ amount: 1_000_000, type: 'cash' }], liabilities: [{ amount: 9_000_000, type: 'loan' }] }, 0, null);
        expect(r.zakatableBase).to.equal(0);
        expect(r.zakatDue).to.equal(0);
    });
});
