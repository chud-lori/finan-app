const { expect } = require('chai');
const { detectWindfall, median } = require('../helpers/windfall');

describe('windfall helper — detectWindfall (pure)', () => {
    it('flags a recent income far above the usual median', () => {
        const baseline = [5_000_000, 5_000_000, 5_000_000, 5_200_000, 4_800_000];
        const recent = [
            { _id: 'a', amount: 15_000_000, time: '2026-08-01' },
            { _id: 'b', amount: 5_000_000,  time: '2026-08-05' },
        ];
        const w = detectWindfall(recent, baseline);
        expect(w).to.not.be.null;
        expect(w.transactionId).to.equal('a');
        expect(w.amount).to.equal(15_000_000);
        expect(w.typical).to.equal(5_000_000);
        expect(w.ratio).to.be.greaterThan(1.8);
    });

    it('returns null when the largest recent income is within the normal range', () => {
        const baseline = [5_000_000, 5_000_000, 5_000_000];
        const recent = [{ _id: 'a', amount: 6_000_000, time: '2026-08-01' }];
        expect(detectWindfall(recent, baseline)).to.equal(null);
    });

    it('returns null without enough baseline history', () => {
        expect(detectWindfall([{ _id: 'a', amount: 100, time: '2026-08-01' }], [10, 10])).to.equal(null);
    });

    it('returns null when there is no recent income', () => {
        expect(detectWindfall([], [1_000_000, 2_000_000, 3_000_000, 4_000_000])).to.equal(null);
    });

    it('picks the most recent transaction when two windfalls tie on amount', () => {
        const baseline = [1_000_000, 1_000_000, 1_000_000];
        const recent = [
            { _id: 'older',  amount: 9_000_000, time: '2026-08-01' },
            { _id: 'newer',  amount: 9_000_000, time: '2026-08-10' },
        ];
        expect(detectWindfall(recent, baseline).transactionId).to.equal('newer');
    });

    it('median handles even and odd lengths', () => {
        expect(median([1, 2, 3])).to.equal(2);
        expect(median([1, 2, 3, 4])).to.equal(2.5);
        expect(median([])).to.equal(0);
    });
});
