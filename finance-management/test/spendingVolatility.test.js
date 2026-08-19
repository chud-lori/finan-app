const { expect } = require('chai');
const { classifyVolatility, MIN_MONTHS } = require('../helpers/spendingVolatility');

describe('helpers/spendingVolatility — classifyVolatility', () => {
    describe('insufficient history', () => {
        it('returns unknown below the minimum active-month count', () => {
            expect(classifyVolatility([2500000, 2500000], 1).volatility).to.equal('unknown');
            expect(classifyVolatility([], 0).volatility).to.equal('unknown');
            expect(classifyVolatility(null, null).volatility).to.equal('unknown');
        });

        it(`needs at least ${MIN_MONTHS} months`, () => {
            const three = classifyVolatility([2500000, 2500000, 2500000], 1);
            expect(three.volatility).to.not.equal('unknown');
        });

        it('ignores zero / non-finite months when counting history', () => {
            // Only two real months of data → unknown, even though the array is longer.
            expect(classifyVolatility([1000000, 0, NaN, 1000000], 1).volatility).to.equal('unknown');
        });
    });

    describe('fixed costs', () => {
        it('classifies a steady monthly charge as fixed', () => {
            const rent = classifyVolatility([2500000, 2500000, 2500000, 2500000, 2500000, 2500000], 1);
            expect(rent.volatility).to.equal('fixed');
            expect(rent.cv).to.equal(0);
        });

        it('tolerates minor drift and still calls it fixed', () => {
            // ~2% swing — an insurance premium that nudges up once.
            const insurance = classifyVolatility([500000, 500000, 510000, 500000, 505000, 500000], 1);
            expect(insurance.volatility).to.equal('fixed');
        });

        it('does NOT call a steady-total but many-transaction category fixed', () => {
            // Same total each month but via ~30 transactions — a daily habit, not a committed charge.
            const dailyCoffee = classifyVolatility([600000, 600000, 600000, 600000], 30);
            expect(dailyCoffee.volatility).to.not.equal('fixed');
        });
    });

    describe('flexible costs', () => {
        it('classifies a swinging category as flexible', () => {
            const food = classifyVolatility([1200000, 2400000, 900000, 3100000, 1500000, 2000000], 42);
            expect(food.volatility).to.equal('flexible');
            expect(food.cv).to.be.greaterThan(0.35);
        });
    });

    describe('semi', () => {
        it('classifies a moderately variable bill as semi', () => {
            // Varies with usage but within a band — CV lands between the 0.15 and 0.35 cutoffs.
            const electricity = classifyVolatility([250000, 350000, 300000, 400000, 280000, 320000], 1);
            expect(electricity.volatility).to.equal('semi');
            expect(electricity.cv).to.be.within(0.15, 0.35);
        });
    });

    describe('output shape', () => {
        it('rounds cv to 3 decimals and always returns the two keys', () => {
            const r = classifyVolatility([100, 130, 90, 110], 5);
            expect(r).to.have.all.keys('volatility', 'cv');
            expect(r.cv).to.equal(Math.round(r.cv * 1000) / 1000);
        });
    });
});
