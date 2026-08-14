const { expect } = require('chai');
const { detectRecurring, merchantKey, isBlockedCategory } = require('../services/ml/recurring');

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
            expect(detectRecurring([])).to.deep.equal({
                recurring: [], monthlyTotal: 0, count: 0, alerts: [],
                frequent: [], frequentMonthlyTotal: 0,
            });
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

        it('files a weekly cadence as frequent spend, not a subscription', () => {
            const txs = series('Gym day pass', 'health', 6, 7, '2026-08-08', 50000);
            const { recurring, frequent, count, alerts } = detectRecurring(txs, { asOf: '2026-08-10' });
            expect(count).to.equal(0);
            expect(recurring).to.be.empty;
            expect(alerts).to.be.empty;
            expect(frequent).to.have.lengthOf(1);
            expect(frequent[0].cadence).to.equal('weekly');
            // 50k every 7 days ≈ 50000 * 30.44/7 ≈ 217,428/mo
            expect(frequent[0].monthlyEquivalent).to.be.within(210000, 225000);
        });

        it('tolerates real-world month-length jitter on a genuine bill', () => {
            // Gaps of 31, 28, 31, 30 days — a bill that posts on the same date each month.
            const dates = ['2026-04-03', '2026-05-04', '2026-06-01', '2026-07-02', '2026-08-01'];
            const txs = dates.map((date, i) => ({
                id: `i${i}`, description: 'Indihome Internet', category: 'internet',
                amount: 350000, date, type: 'expense',
            }));
            const { recurring, count } = detectRecurring(txs, { asOf: '2026-08-10' });
            expect(count).to.equal(1);
            expect(recurring[0].cadence).to.equal('monthly');
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

    describe('subscription gate', () => {
        it('excludes variable-amount food even on a monthly rhythm', () => {
            // Same warung, every 30 days, but the bill is a different meal each time.
            const txs = series('Warung Padang', 'food', 5, 30, '2026-08-05',
                [28000, 45000, 32000, 61000, 39000]);
            const { count, recurring, alerts } = detectRecurring(txs, { asOf: '2026-08-10' });
            expect(count).to.equal(0);
            expect(recurring).to.be.empty;
            expect(alerts).to.be.empty;
        });

        it('excludes fixed-price monthly food by category alone', () => {
            // Identical amount, textbook monthly cadence — only the category says no.
            const txs = series('Ayam Geprek Bensu', 'food', 5, 30, '2026-08-05', 35000);
            const { count, recurring, alerts } = detectRecurring(txs, { asOf: '2026-08-10' });
            expect(count).to.equal(0);
            expect(recurring).to.be.empty;
            expect(alerts).to.be.empty;
        });

        it('includes a genuine monthly bill', () => {
            const txs = series('PLN Token Listrik', 'electricity', 5, 30, '2026-08-05', 300000);
            const { count, recurring } = detectRecurring(txs, { asOf: '2026-08-10' });
            expect(count).to.equal(1);
            expect(recurring[0].merchant).to.equal('pln token listrik');
            expect(recurring[0].category).to.equal('electricity');
            expect(recurring[0].amountStable).to.equal(true);
        });

        it('keeps a variable-amount monthly utility bill when its category is flagged', () => {
            // Electricity posts monthly on a tight schedule but the amount swings
            // with usage — CV here is ~0.20, past the 0.12 default gate yet under
            // the looser utility ceiling. Only fires because the caller flags it.
            const txs = series('PLN Postpaid', 'electricity', 5, 30, '2026-08-05',
                [250000, 340000, 210000, 380000, 300000]);
            const opts = { asOf: '2026-08-10', utilityCategories: new Set(['electricity']) };
            const { count, recurring } = detectRecurring(txs, opts);
            expect(count).to.equal(1);
            expect(recurring[0].category).to.equal('electricity');
            expect(recurring[0].amountStable).to.equal(false); // still flagged as an unstable amount
        });

        it('drops the same variable bill when the category is not flagged', () => {
            // Identical data, but no utilityCategories — the tight 0.12 gate applies.
            const txs = series('PLN Postpaid', 'electricity', 5, 30, '2026-08-05',
                [250000, 340000, 210000, 380000, 300000]);
            expect(detectRecurring(txs, { asOf: '2026-08-10' }).count).to.equal(0);
        });

        it('does not extend the utility leeway to unflagged categories in the same run', () => {
            // A flagged utility and an unflagged category, same ~0.20 amount swing:
            // only the flagged one survives.
            const util = series('PLN Postpaid', 'electricity', 5, 30, '2026-08-05',
                [250000, 340000, 210000, 380000, 300000]);
            const other = series('Cleaning service', 'household', 5, 30, '2026-08-06',
                [250000, 340000, 210000, 380000, 300000]);
            const opts = { asOf: '2026-08-10', utilityCategories: new Set(['electricity']) };
            const { count, recurring } = detectRecurring([...util, ...other], opts);
            expect(count).to.equal(1);
            expect(recurring[0].category).to.equal('electricity');
        });

        it('blocks by category regardless of the exact wording', () => {
            expect(isBlockedCategory('Food & Drink')).to.equal(true);
            expect(isBlockedCategory('eating out')).to.equal(true);
            expect(isBlockedCategory('Kopi / Ngopi')).to.equal(true);
            expect(isBlockedCategory('snack')).to.equal(true);
            expect(isBlockedCategory('cigar')).to.equal(true);
            expect(isBlockedCategory('grocery')).to.equal(true);
            expect(isBlockedCategory('sharing')).to.equal(true);
            // Blocklist, not allowlist — bills and unknown categories pass through.
            expect(isBlockedCategory('internet')).to.equal(false);
            expect(isBlockedCategory('rent/mortgage')).to.equal(false);
            expect(isBlockedCategory('monthly budget')).to.equal(false);
            expect(isBlockedCategory('')).to.equal(false);
            expect(isBlockedCategory('some category i invented')).to.equal(false);
        });

        it('still detects a bill the user filed under an odd category', () => {
            // Blocklist tolerates mis-tagging; an allowlist would have dropped this.
            const txs = series('Netflix', 'monthly budget', 5, 30, '2026-08-05', 186000);
            expect(detectRecurring(txs, { asOf: '2026-08-10' }).count).to.equal(1);
        });

        it('does not let one stray re-tag knock out a long-running bill', () => {
            const txs = series('Spotify Premium', 'entertainment', 6, 30, '2026-08-05', 54000);
            txs[2].category = 'food';
            expect(detectRecurring(txs, { asOf: '2026-08-10' }).count).to.equal(1);
        });

        it('rejects a monthly-ish group whose amount drifts past the CV gate', () => {
            const txs = series('Cleaning service', 'household', 5, 30, '2026-08-05',
                [200000, 260000, 190000, 300000, 240000]);
            expect(detectRecurring(txs, { asOf: '2026-08-10' }).count).to.equal(0);
        });

        it('rejects a loose ~monthly schedule that a bill would not have', () => {
            // Gaps of 20, 26, 34, 40 — the median is monthly, the schedule is not.
            const dates = ['2026-04-01', '2026-04-21', '2026-05-17', '2026-06-20', '2026-07-30'];
            const txs = dates.map((date, i) => ({
                id: `l${i}`, description: 'Barbershop', category: 'personal care',
                amount: 60000, date, type: 'expense',
            }));
            expect(detectRecurring(txs, { asOf: '2026-08-10' }).count).to.equal(0);
        });
    });

    describe('frequent spend', () => {
        it('surfaces a near-daily coffee as frequent spend with no alerts', () => {
            const txs = series('Kopi Kenangan', 'coffee', 8, 2, '2026-08-08', 22000);
            const { count, frequent, alerts, frequentMonthlyTotal } = detectRecurring(txs, { asOf: '2026-09-20' });
            expect(count).to.equal(0);
            expect(alerts).to.be.empty; // long overdue, but frequent spend never raises bill alerts
            expect(frequent).to.have.lengthOf(1);
            expect(frequent[0].cadence).to.equal('daily');
            expect(frequent[0].category).to.equal('coffee');
            expect(frequent[0]).to.not.have.property('nextDue');
            expect(frequentMonthlyTotal).to.be.greaterThan(0);
        });

        it('needs real history before calling a sub-weekly habit frequent', () => {
            const txs = series('Kopi Kenangan', 'coffee', 3, 2, '2026-08-08', 22000);
            expect(detectRecurring(txs, { asOf: '2026-08-10' }).frequent).to.be.empty;
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
