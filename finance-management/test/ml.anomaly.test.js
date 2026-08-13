const { expect } = require('chai');
const { detectAnomalies } = require('../services/ml/anomaly');

// Helper: build a category history. `currentAmounts` are this month's
// transactions (the only ones eligible to be flagged), `pastAmounts` are the
// baseline from earlier months.
const build = (category, pastAmounts, currentAmounts) => [
    ...pastAmounts.map((amount, i) => ({
        id: `${category}-past-${i}`, amount, category, date: '2026-06-10',
        description: `past ${i}`, type: 'expense', is_current_month: false,
    })),
    ...currentAmounts.map((amount, i) => ({
        id: `${category}-cur-${i}`, amount, category, date: '2026-08-10',
        description: `current ${i}`, type: 'expense', is_current_month: true,
    })),
];

describe('services/ml/anomaly — detectAnomalies', () => {
    describe('input guards', () => {
        it('returns [] for empty, null and non-array input', () => {
            expect(detectAnomalies([])).to.deep.equal([]);
            expect(detectAnomalies(null)).to.deep.equal([]);
            expect(detectAnomalies(undefined)).to.deep.equal([]);
            expect(detectAnomalies('nope')).to.deep.equal([]);
        });

        it('ignores income transactions entirely', () => {
            const txs = build('food', [100, 100, 100], [5000]).map(t => ({ ...t, type: 'income' }));
            expect(detectAnomalies(txs)).to.deep.equal([]);
        });

        it('never flags a past-month transaction', () => {
            // Extreme amount, but not in the current month.
            const txs = build('food', [100, 100, 100, 999999], []);
            expect(detectAnomalies(txs)).to.deep.equal([]);
        });

        it('skips categories with too little history to compare against', () => {
            // One prior transaction is not a baseline.
            const txs = build('food', [100], [99999]);
            expect(detectAnomalies(txs)).to.deep.equal([]);
        });
    });

    // The regression this module was rewritten for. With a population stddev over
    // a set that included the candidate, the maximum attainable z was
    // (n-1)/sqrt(n) — 1.15 at n=3, 1.50 at n=4, 1.79 at n=5 — all under the 2.0
    // threshold, so these categories could never fire regardless of amount.
    describe('small-sample categories (the (n-1)/sqrt(n) ceiling)', () => {
        it('flags an extreme amount when the category has only 3 transactions', () => {
            const out = detectAnomalies(build('food', [80_000, 85_000], [5_000_000]));
            expect(out).to.have.lengthOf(1);
            expect(out[0].id).to.equal('food-cur-0');
            expect(out[0].severity).to.equal('high');
        });

        it('flags at 4 and at 5 transactions too', () => {
            for (const past of [[80_000, 85_000, 82_000], [80_000, 85_000, 82_000, 79_000]]) {
                const out = detectAnomalies(build('food', past, [5_000_000]));
                expect(out, `history of ${past.length + 1}`).to.have.lengthOf(1);
            }
        });

        it('reports how many transactions the baseline used', () => {
            const out = detectAnomalies(build('food', [80_000, 85_000, 82_000], [5_000_000]));
            expect(out[0].baseline_count).to.equal(3);
        });
    });

    describe('normal spending is left alone', () => {
        it('does not flag an amount in line with history', () => {
            expect(detectAnomalies(build('food', [100_000, 110_000, 95_000, 105_000], [102_000]))).to.deep.equal([]);
        });

        it('does not flag a cheaper-than-usual transaction', () => {
            // Under-spending is not an alert, however many stddevs out it is.
            expect(detectAnomalies(build('food', [100_000, 100_000, 100_000, 100_000], [1_000]))).to.deep.equal([]);
        });

        it('does not flag a trivially larger amount in a very tight category', () => {
            // std is tiny here, so a bare z-test would fire on a 4% difference.
            expect(detectAnomalies(build('transport', [50_000, 50_100, 49_900, 50_050], [52_000]))).to.deep.equal([]);
        });
    });

    describe('baseline with no spread', () => {
        it('flags a large multiple when every prior amount is identical', () => {
            const out = detectAnomalies(build('rent', [1_000_000, 1_000_000, 1_000_000], [3_000_000]));
            expect(out).to.have.lengthOf(1);
            expect(out[0].multiple).to.equal(3);
        });

        it('does not flag a small multiple when every prior amount is identical', () => {
            expect(detectAnomalies(build('rent', [1_000_000, 1_000_000, 1_000_000], [1_400_000]))).to.deep.equal([]);
        });
    });

    describe('leave-one-out baseline', () => {
        it('does not let one outlier hide a second one in the same month', () => {
            // Scored against a population containing both, each masks the other.
            const out = detectAnomalies(build('food', [80_000, 82_000, 78_000, 81_000], [3_000_000, 3_100_000]));
            expect(out).to.have.lengthOf(2);
        });

        it('excludes the candidate from its own average', () => {
            const out = detectAnomalies(build('food', [100_000, 100_000, 100_000], [1_000_000]));
            // Mean of the *others* is 100k, not the 325k a self-inclusive mean gives.
            expect(out[0].category_avg).to.equal(100_000);
            expect(out[0].multiple).to.equal(10);
        });
    });

    describe('output shape and ordering', () => {
        it('sorts by score descending and caps at 10', () => {
            const txs = [];
            for (let c = 0; c < 15; c++) {
                txs.push(...build(`cat${c}`, [1000, 1000, 1000], [50_000 + c * 50_000]));
            }
            const out = detectAnomalies(txs);
            expect(out).to.have.lengthOf(10);
            const scores = out.map(o => o.score);
            expect(scores).to.deep.equal([...scores].sort((a, b) => b - a));
        });

        it('returns every documented field', () => {
            const [a] = detectAnomalies(build('food', [80_000, 85_000, 82_000], [5_000_000]));
            expect(a).to.include.all.keys(
                'id', 'description', 'category', 'amount', 'date',
                'score', 'severity', 'multiple', 'category_avg', 'baseline_count', 'label',
            );
            expect(a.score).to.be.within(0, 1);
            expect(['low', 'medium', 'high']).to.include(a.severity);
            expect(a.label).to.be.a('string').and.contain('food');
        });

        it('scores each category independently', () => {
            // A big rent payment is normal for rent, abnormal for coffee.
            const txs = [
                ...build('rent',   [2_000_000, 2_100_000, 1_950_000], [2_050_000]),
                ...build('coffee', [25_000, 30_000, 28_000],          [2_050_000]),
            ];
            const out = detectAnomalies(txs);
            expect(out).to.have.lengthOf(1);
            expect(out[0].category).to.equal('coffee');
        });
    });

    // Sensitivity is gated by category volatility (needs >=3 distinct months of
    // history to classify). Build one tx per month across `monthlyAmounts`, then
    // a current-month tx.
    const buildMonthly = (category, monthlyAmounts, currentAmount) => {
        const txs = monthlyAmounts.map((amount, i) => ({
            id: `${category}-m${i}`, amount, category,
            date: `2026-0${i + 1}-10`, description: `m${i}`, type: 'expense', is_current_month: false,
        }));
        txs.push({ id: `${category}-cur`, amount: currentAmount, category, date: '2026-08-10', description: 'current', type: 'expense', is_current_month: true });
        return txs;
    };

    describe('volatility-gated sensitivity', () => {
        it('does NOT flag a modest spike in a naturally spiky (flexible) category', () => {
            // Sharing/treating friends: swings wildly month to month → flexible.
            // A 2.4x outing is normal life here, not an anomaly.
            const sharing = buildMonthly('sharing', [100000, 400000, 150000, 600000, 250000], 500000);
            const out = detectAnomalies(sharing);
            expect(out.find(a => a.category === 'sharing')).to.be.undefined;
        });

        it('still flags a large spike in a flexible category', () => {
            // A genuinely big blow-out (well above the raised bar) should surface.
            const sharing = buildMonthly('sharing', [100000, 400000, 150000, 600000, 250000], 3000000);
            const out = detectAnomalies(sharing);
            expect(out.find(a => a.category === 'sharing')).to.exist;
        });

        it('flags a smaller spike in a stable (fixed) category', () => {
            // Electricity is normally flat, so a modest jump is genuinely unexpected
            // and worth flagging at the lower bar.
            const power = buildMonthly('electricity', [300000, 305000, 298000, 302000, 300000], 620000);
            const out = detectAnomalies(power);
            expect(out.find(a => a.category === 'electricity')).to.exist;
        });
    });
});
