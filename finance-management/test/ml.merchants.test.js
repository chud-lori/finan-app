const { expect } = require('chai');
const { topMerchants } = require('../services/ml/merchants');
const { merchantKey } = require('../helpers/merchantKey');

// n expenses at one merchant, one per day back from 2026-08-20.
const buys = (description, category, count, amount, startDay = 20) => {
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push({
            id: `${description}-${i}`, description, category,
            amount: Array.isArray(amount) ? amount[i] : amount,
            date: `2026-08-${String(startDay - i).padStart(2, '0')}`,
            type: 'expense',
        });
    }
    return out;
};

describe('helpers/merchantKey', () => {
    describe('merchantKey', () => {
        it('folds a verb prefix into the same merchant', () => {
            const opt = { stripFiller: true };
            expect(merchantKey('beli shop alpha', opt)).to.equal('shop alpha');
            expect(merchantKey('shop alpha', opt)).to.equal('shop alpha');
            expect(merchantKey('top up gopay', opt)).to.equal('gopay');
        });

        it('keeps a dominant merchant however its detail varies', () => {
            const opt = { stripFiller: true };
            // The old corpus rule deleted this merchant: on >30% of a month's rows,
            // written with many different dishes, it looked exactly like filler.
            ['vendorbeta item one', 'vendorbeta item two', 'vendorbeta item three'].forEach(d => {
                expect(merchantKey(d, opt).startsWith('vendorbeta')).to.equal(true);
            });
            expect(merchantKey('vendorbeta', opt)).to.equal('vendorbeta');
        });

        it('drops a trailing quantity instead of keeping its unit as a name token', () => {
            const opt = { stripFiller: true };
            expect(merchantKey('widget alpha 100k', opt)).to.equal('widget alpha');
            expect(merchantKey('widget 50rb', opt)).to.equal('widget');
            expect(merchantKey('widget 2x', opt)).to.equal('widget');
            expect(merchantKey('widget 19l', opt)).to.equal('widget');
        });

        it('groups the same merchant however the quantity is written', () => {
            const opt = { stripFiller: true };
            const keys = ['widget alpha 100k', 'widget alpha 50k', 'widget alpha']
                .map(d => merchantKey(d, opt));
            expect(new Set(keys).size).to.equal(1);
        });

        it('keeps a name that looks like a quantity rather than losing the row', () => {
            expect(merchantKey('3m', { stripFiller: true })).to.equal('3m');
        });

        it('buckets a description with no latin letters instead of dropping it', () => {
            const opt = { stripFiller: true };
            expect(merchantKey('1234', opt)).to.equal('1234');
            expect(merchantKey('!!!', opt)).to.not.equal('');
        });

        it('keys the same however large the surrounding corpus is', () => {
            const opt = { stripFiller: true };
            expect(merchantKey('shop alpha', opt)).to.equal(merchantKey('shop alpha', opt));
            expect(merchantKey('beli shop alpha', opt)).to.equal('shop alpha');
        });

        it('lowercases, drops digits and punctuation, keeps the first three tokens', () => {
            expect(merchantKey('SHOP Alpha #12 (Grand)')).to.equal('shop alpha grand');
            expect(merchantKey('  ')).to.equal('');
            expect(merchantKey(null)).to.equal('');
        });

        it('buckets exactly — near-identical names stay separate merchants', () => {
            expect(merchantKey('Spotify')).to.equal('spotify');
            expect(merchantKey('SPOTIFY ID 12345')).to.equal('spotify id');
            expect(merchantKey('spotify premium')).to.equal('spotify premium');
        });

    });
});

describe('services/ml/merchants — topMerchants', () => {
    describe('input guards', () => {
        it('returns an empty result for an empty period', () => {
            expect(topMerchants([])).to.deep.equal({
                merchants: [], oneOff: null, total: 0, merchantCount: 0,
            });
            expect(topMerchants(null).total).to.equal(0);
        });

        it('returns an empty result when the period is all savings outflow', () => {
            const txs = buys('reksa dana bibit', 'reksa dana', 3, 500000);
            const out = topMerchants(txs, { savingsCategories: new Set(['reksa dana']) });
            expect(out).to.deep.equal({ merchants: [], oneOff: null, total: 0, merchantCount: 0 });
        });

        it('ignores income and non-positive amounts', () => {
            const txs = [
                ...buys('Salary', 'salary', 2, 9000000).map(t => ({ ...t, type: 'income' })),
                ...buys('Refund', 'food', 2, 0),
            ];
            expect(topMerchants(txs).total).to.equal(0);
        });
    });

    describe('ranking', () => {
        it('ranks by total and reports count, share and the dominant category', () => {
            const txs = [
                ...buys('Shop Alpha', 'coffee', 4, 25000),   // 100000
                ...buys('Vendor Beta', 'food', 2, 60000, 10),      // 120000
            ];
            const { merchants, total, merchantCount } = topMerchants(txs);
            expect(total).to.equal(220000);
            expect(merchantCount).to.equal(2);
            expect(merchants.map(m => m.key)).to.deep.equal(['vendor beta', 'shop alpha']);
            expect(merchants[0]).to.include({
                key: 'vendor beta', total: 120000, count: 2, avg: 60000,
                category: 'food', share: 54.5, lastDate: '2026-08-10',
            });
            expect(merchants[1].share).to.equal(45.5);
        });

        it('caps the list but keeps share against the whole period', () => {
            const txs = [];
            for (let i = 0; i < 5; i++) txs.push(...buys(`Merchant${String.fromCharCode(97 + i)}`, 'food', 2, 100000, 20 - i * 2));
            const { merchants, merchantCount, total } = topMerchants(txs, { limit: 2 });
            expect(merchants).to.have.lengthOf(2);
            expect(merchantCount).to.equal(5);
            expect(total).to.equal(1000000);
            expect(merchants[0].share).to.equal(20);
        });

        it('carries the transaction ids so a row can drill into its own transactions', () => {
            const { merchants } = topMerchants(buys('Vendor Beta', 'food', 3, 50000));
            expect(merchants[0].txIds).to.deep.equal(['Vendor Beta-0', 'Vendor Beta-1', 'Vendor Beta-2']);
        });
    });

    describe('normalisation', () => {

        it('never merges two merchants that differ after the strip', () => {
            const txs = [
                ...buys('beli item one stall', 'food', 3, 20000),
                ...buys('beli item one shop', 'food', 3, 19000, 15),
                ...buys('beli item two', 'coffee', 2, 25000, 10),
                ...buys('beli widget', 'bill', 2, 50000, 6),
            ];
            const { merchants } = topMerchants(txs);
            const totals = merchants.map(m => m.total).sort((a, b) => a - b);
            expect(totals).to.deep.equal([50000, 57000, 60000, 100000]);
            expect(new Set(merchants.map(m => m.key)).size).to.equal(4);
        });
    });

    describe('savings exclusion', () => {
        it('leaves savings-group outflow out of the list and the total', () => {
            const txs = [
                ...buys('Reksa Dana Bibit', 'reksa dana', 3, 1000000),
                ...buys('Vendor Beta', 'food', 3, 50000, 15),
            ];
            const { merchants, total } = topMerchants(txs, { savingsCategories: ['reksa dana'] });
            expect(merchants.map(m => m.key)).to.deep.equal(['vendor beta']);
            expect(total).to.equal(150000);
            expect(merchants[0].share).to.equal(100);
        });

        it('matches savings categories case-insensitively', () => {
            const txs = [
                ...buys('Bibit', 'Reksa Dana', 3, 1000000),
                ...buys('Vendor Beta', 'food', 3, 50000, 15),
            ];
            const { total } = topMerchants(txs, { savingsCategories: new Set(['reksa dana']) });
            expect(total).to.equal(150000);
        });
    });

    describe('one-off collapse', () => {
        it('collapses single-transaction merchants into one roll-up row', () => {
            const txs = [
                ...buys('Vendor Beta', 'food', 3, 50000),
                ...buys('Airport lounge', 'travel', 1, 200000, 12),
                ...buys('New headphones', 'gadget', 1, 800000, 11),
            ];
            const { merchants, oneOff, total } = topMerchants(txs);
            expect(merchants.map(m => m.key)).to.deep.equal(['vendor beta']);
            expect(oneOff.count).to.equal(2);
            expect(oneOff.total).to.equal(1000000);
            expect(oneOff.share).to.equal(87);
            expect(oneOff.txIds).to.have.lengthOf(2);
            expect(total).to.equal(1150000);
        });

        it('has no roll-up when every merchant repeats', () => {
            const txs = [...buys('Vendor Beta', 'food', 2, 50000), ...buys('GrabRide', 'transport', 2, 20000, 15)];
            expect(topMerchants(txs).oneOff).to.equal(null);
        });

        it('reports the roll-up even when nothing repeats', () => {
            const txs = [
                ...buys('Airport lounge', 'travel', 1, 200000),
                ...buys('New headphones', 'gadget', 1, 800000, 12),
            ];
            const { merchants, oneOff } = topMerchants(txs);
            expect(merchants).to.be.empty;
            expect(oneOff.count).to.equal(2);
        });
    });
});
