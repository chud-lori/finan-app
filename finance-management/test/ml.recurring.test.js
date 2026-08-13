const { expect } = require('chai');
const { detectRecurring, merchantKey } = require('../services/ml/recurring');

// Build dated charges for one merchant: `count` charges spaced `gapDays` apart,
// ending `endDate`, each `amount` (number or per-index array).
const series = (description, category, count, gapDays, endDate, amount) => {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(endDate + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - i * gapDays);
        out.push({
            id: `${description}-${i}`, description, category,
            amount: Array.isArray(amount) ? amount[count - 1 - i] : amount,
            date: d.toISOString().slice(0, 10), type: 'expense',
        });
    }
    return out;
};

describe('services/ml/recurring — detectRecurring', () => {
    describe('input guards', () => {
        it('returns an empty result for empty/invalid input', () => {
            expect(detectRecurring([])).to.deep.equal({ recurring: [], monthlyTotal: 0, count: 0, alerts: [] });
            expect(detectRecurring(null).count).to.equal(0);
        });

        it('ignores income', () => {
            const txs = series('Spotify', 'entertainment', 4, 30, '2026-08-01', 54000).map(t => ({ ...t, type: 'income' }));
            expect(detectRecurring(txs).count).to.equal(0);
        });

        it('needs at least 3 occurrences', () => {
            const txs = series('Netflix', 'entertainment', 2, 30, '2026-08-01', 120000);
            expect(detectRecurring(txs).count).to.equal(0);
        });
    });

    describe('detection', () => {
        it('detects a steady monthly subscription and predicts the next due date', () => {
            const txs = series('Spotify Premium', 'entertainment', 5, 30, '2026-08-05', 54000);
            const { recurring, monthlyTotal, count } = detectRecurring(txs, { asOf: '2026-08-10' });
            expect(count).to.equal(1);
            const r = recurring[0];
            expect(r.cadence).to.equal('monthly');
            expect(r.typicalAmount).to.equal(54000);
            expect(r.amountStable).to.equal(true);
            expect(r.nextDue).to.equal('2026-09-04'); // 2026-08-05 + 30d
            expect(monthlyTotal).to.equal(54000);
        });

        it('detects a weekly cadence and normalizes it to a monthly cost', () => {
            const txs = series('Gym day pass', 'health', 6, 7, '2026-08-08', 50000);
            const r = detectRecurring(txs, { asOf: '2026-08-10' }).recurring[0];
            expect(r.cadence).to.equal('weekly');
            // 50k every 7 days ≈ 50000 * 30.44/7 ≈ 217,428/mo
            expect(r.monthlyEquivalent).to.be.within(210000, 225000);
        });

        it('does NOT flag an irregular merchant that merely averages ~monthly', () => {
            // Same merchant, gaps 5, 55, 12, 60 days — no real schedule.
            const base = new Date('2026-08-01T00:00:00Z');
            const days = [0, 5, 60, 72, 132];
            const txs = days.map((off, i) => {
                const d = new Date(base); d.setUTCDate(d.getUTCDate() - off);
                return { id: `x${i}`, description: 'Warung makan', category: 'food', amount: 30000, date: d.toISOString().slice(0, 10), type: 'expense' };
            });
            expect(detectRecurring(txs).count).to.equal(0);
        });

        it('groups descriptions that share a merchant key', () => {
            const key = merchantKey('SPOTIFY ID 12345');
            expect(merchantKey('spotify premium')).to.equal('spotify premium'.split(' ').slice(0, 3).join(' '));
            expect(key).to.equal('spotify id');
        });
    });

    describe('alerts', () => {
        it('flags a bill that is overdue past its grace window', () => {
            // Monthly Netflix, last charge 2026-06-05, next due ~07-05, but today is 08-20.
            const txs = series('Netflix', 'entertainment', 4, 30, '2026-06-05', 186000);
            const { alerts } = detectRecurring(txs, { asOf: '2026-08-20' });
            const miss = alerts.find(a => a.type === 'missing');
            expect(miss).to.exist;
            expect(miss.expected).to.equal(186000);
        });

        it('does not flag overdue when the charge is within its grace window', () => {
            const txs = series('Netflix', 'entertainment', 4, 30, '2026-08-05', 186000);
            const { alerts } = detectRecurring(txs, { asOf: '2026-09-06' }); // due 09-04, grace ~7d
            expect(alerts.find(a => a.type === 'missing')).to.be.undefined;
        });

        it('flags a price jump on the latest charge', () => {
            // Four at 54k, latest at 69k (+27%).
            const txs = series('Spotify', 'entertainment', 5, 30, '2026-08-05', [54000, 54000, 54000, 54000, 69000]);
            const { alerts } = detectRecurring(txs, { asOf: '2026-08-10' });
            const jump = alerts.find(a => a.type === 'price_up');
            expect(jump).to.exist;
            expect(jump.from).to.equal(54000);
            expect(jump.to).to.equal(69000);
            expect(jump.pct).to.equal(28);
        });
    });

    describe('ranking', () => {
        it('sorts recurring charges by monthly cost, highest first', () => {
            const txs = [
                ...series('Rent', 'rent/mortgage', 4, 30, '2026-08-02', 2500000),
                ...series('Spotify', 'entertainment', 4, 30, '2026-08-05', 54000),
                ...series('Internet', 'utilities', 4, 30, '2026-08-10', 350000),
            ];
            const { recurring, count } = detectRecurring(txs, { asOf: '2026-08-15' });
            expect(count).to.equal(3);
            expect(recurring.map(r => r.merchant)).to.deep.equal(['rent', 'internet', 'spotify']);
        });
    });
});
