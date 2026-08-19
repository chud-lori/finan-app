const { expect } = require('chai');
const { computeFinancialHealth } = require('../helpers/financialHealth');

describe('helpers/financialHealth — computeFinancialHealth', () => {
    it('returns a null score when nothing can be measured', () => {
        const r = computeFinancialHealth({});
        expect(r.score).to.equal(null);
        expect(r.band).to.equal(null);
        expect(r.components.every(c => c.available === false)).to.equal(true);
    });

    it('scores a strong profile as excellent', () => {
        const r = computeFinancialHealth({ savingsRate: 0.30, emergencyMonths: 6, budgetPaceRatio: 0.8, avgGoalProgress: 0.9 });
        expect(r.score).to.be.greaterThan(85);
        expect(r.band).to.equal('excellent');
    });

    it('scores a weak profile as needs_attention', () => {
        const r = computeFinancialHealth({ savingsRate: 0, emergencyMonths: 0.2, budgetPaceRatio: 1.8, avgGoalProgress: 0 });
        expect(r.score).to.be.lessThan(40);
        expect(r.band).to.equal('needs_attention');
    });

    it('caps each pillar at its target (no >100 from over-saving)', () => {
        const r = computeFinancialHealth({ savingsRate: 0.9, emergencyMonths: 24, budgetPaceRatio: 0.1, avgGoalProgress: 1 });
        expect(r.score).to.equal(100);
        expect(r.components.find(c => c.key === 'savings').score).to.equal(100);
    });

    it('renormalizes weights over available pillars only', () => {
        // Only savings measurable, and it's perfect → 100 despite other pillars missing.
        const r = computeFinancialHealth({ savingsRate: 0.25 });
        expect(r.score).to.equal(100);
        expect(r.components.find(c => c.key === 'emergency').available).to.equal(false);
    });

    it('does not punish a new user for unmeasured pillars', () => {
        // Missing pillars must not be treated as zero.
        const withMissing = computeFinancialHealth({ savingsRate: 0.25, emergencyMonths: null, budgetPaceRatio: null, avgGoalProgress: null });
        expect(withMissing.score).to.equal(100);
    });

    it('treats negative savings and over-pace budget as zero, not negative', () => {
        const r = computeFinancialHealth({ savingsRate: -0.5, budgetPaceRatio: 3 });
        expect(r.components.find(c => c.key === 'savings').score).to.equal(0);
        expect(r.components.find(c => c.key === 'budget').score).to.equal(0);
        expect(r.score).to.equal(0);
    });

    it('weights emergency + savings above budget + goals', () => {
        // Perfect savings+emergency (0.6 weight) vs perfect budget+goals (0.4 weight).
        const savingsHeavy = computeFinancialHealth({ savingsRate: 0.25, emergencyMonths: 6, budgetPaceRatio: 3, avgGoalProgress: 0 });
        const budgetHeavy  = computeFinancialHealth({ savingsRate: 0, emergencyMonths: 0, budgetPaceRatio: 0.5, avgGoalProgress: 1 });
        expect(savingsHeavy.score).to.equal(60);
        expect(budgetHeavy.score).to.equal(40);
    });
});
