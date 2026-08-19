const { expect } = require('chai');
const { topMerchants } = require('../services/ml/merchants');
const { merchantKey, deriveStopwords } = require('../helpers/merchantKey');

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
        it('lowercases, drops digits and punctuation, keeps the first three tokens', () => {
            expect(merchantKey('KOPI Kenangan #12 (Grand)')).to.equal('kopi kenangan grand');
            expect(merchantKey('  ')).to.equal('');
            expect(merchantKey(null)).to.equal('');
        });

        it('buckets exactly — near-identical names stay separate merchants', () => {
            expect(merchantKey('Spotify')).to.equal('spotify');
            expect(merchantKey('SPOTIFY ID 12345')).to.equal('spotify id');
            expect(merchantKey('spotify premium')).to.equal('spotify premium');
        });

        it('strips corpus stopwords before taking the three tokens', () => {
            const stop = new Set(['beli', 'di']);
            expect(merchantKey('beli kopi kenangan', stop)).to.equal('kopi kenangan');
            expect(merchantKey('kopi kenangan', stop)).to.equal('kopi kenangan');
            expect(merchantKey('beli di kopi kenangan grand', stop)).to.equal('kopi kenangan grand');
        });

        it('keeps a bucket for an all-filler description', () => {
            expect(merchantKey('beli beli', new Set(['beli']))).to.equal('beli beli');
        });
    });

    describe('deriveStopwords', () => {
        it('flags tokens written on more than 30% of descriptions', () => {
            const docs = [
                'beli kopi', 'beli nasi', 'beli pulsa', 'beli bensin',
                'kopi kenangan', 'nasi warteg', 'pulsa xl', 'bensin motor',
            ];
            const stop = deriveStopwords(docs);
            expect([...stop]).to.deep.equal(['beli']);
        });

        it('is bilingual by construction — it learns whatever the user writes', () => {
            const docs = [
                'bayar listrik', 'bayar wifi', 'bayar kos', 'bayar pulsa',
                'paid netflix', 'paid gym', 'listrik pln', 'wifi rumah',
            ];
            expect([...deriveStopwords(docs)].sort()).to.deep.equal(['bayar']);
        });

        it('leaves a small corpus alone — document frequency there is noise', () => {
            const docs = ['beli kopi', 'beli nasi', 'beli pulsa'];
            expect(deriveStopwords(docs).size).to.equal(0);
        });

        it('ignores non-array input', () => {
            expect(deriveStopwords(null).size).to.equal(0);
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
                ...buys('Kopi Kenangan', 'coffee', 4, 25000),   // 100000
                ...buys('GrabFood', 'food', 2, 60000, 10),      // 120000
            ];
            const { merchants, total, merchantCount } = topMerchants(txs);
            expect(total).to.equal(220000);
            expect(merchantCount).to.equal(2);
            expect(merchants.map(m => m.key)).to.deep.equal(['grabfood', 'kopi kenangan']);
            expect(merchants[0]).to.include({
                key: 'grabfood', total: 120000, count: 2, avg: 60000,
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
            const { merchants } = topMerchants(buys('GrabFood', 'food', 3, 50000));
            expect(merchants[0].txIds).to.deep.equal(['GrabFood-0', 'GrabFood-1', 'GrabFood-2']);
        });
    });

    describe('normalisation', () => {
        it('folds a verb prefix into the merchant once it is corpus filler', () => {
            const txs = [
                ...buys('beli kopi kenangan', 'coffee', 3, 25000),
                ...buys('kopi kenangan', 'coffee', 2, 25000, 15),
                ...buys('beli nasi warteg', 'food', 2, 15000, 12),
                ...buys('beli pulsa', 'bill', 2, 50000, 8),
            ];
            const { merchants } = topMerchants(txs);
            const kopi = merchants.find(m => m.key === 'kopi kenangan');
            expect(kopi.count).to.equal(5);
            expect(merchants.some(m => m.key === 'beli kopi kenangan')).to.equal(false);
        });

        it('never merges two merchants that differ after the strip', () => {
            const txs = [
                ...buys('beli nasi ayam warteg', 'food', 3, 20000),
                ...buys('beli nasi ayam indomaret', 'food', 3, 19000, 15),
                ...buys('beli kopi', 'coffee', 2, 25000, 10),
                ...buys('beli pulsa', 'bill', 2, 50000, 6),
            ];
            const { merchants } = topMerchants(txs);
            const totals = merchants.map(m => m.total).sort((a, b) => a - b);
            expect(totals).to.deep.equal([50000, 57000, 60000, 100000]);
            expect(new Set(merchants.map(m => m.key)).size).to.equal(4);
        });

        it('keeps a dominant merchant intact — its own name is not filler', () => {
            const txs = [
                ...buys('Kopi Kenangan', 'coffee', 6, 25000),
                ...buys('beli nasi warteg', 'food', 2, 15000, 12),
                ...buys('beli pulsa', 'bill', 2, 50000, 9),
            ];
            const { merchants } = topMerchants(txs);
            expect(merchants.find(m => m.key === 'kopi kenangan').count).to.equal(6);
        });
    });

    describe('savings exclusion', () => {
        it('leaves savings-group outflow out of the list and the total', () => {
            const txs = [
                ...buys('Reksa Dana Bibit', 'reksa dana', 3, 1000000),
                ...buys('GrabFood', 'food', 3, 50000, 15),
            ];
            const { merchants, total } = topMerchants(txs, { savingsCategories: ['reksa dana'] });
            expect(merchants.map(m => m.key)).to.deep.equal(['grabfood']);
            expect(total).to.equal(150000);
            expect(merchants[0].share).to.equal(100);
        });

        it('matches savings categories case-insensitively', () => {
            const txs = [
                ...buys('Bibit', 'Reksa Dana', 3, 1000000),
                ...buys('GrabFood', 'food', 3, 50000, 15),
            ];
            const { total } = topMerchants(txs, { savingsCategories: new Set(['reksa dana']) });
            expect(total).to.equal(150000);
        });
    });

    describe('one-off collapse', () => {
        it('collapses single-transaction merchants into one roll-up row', () => {
            const txs = [
                ...buys('GrabFood', 'food', 3, 50000),
                ...buys('Airport lounge', 'travel', 1, 200000, 12),
                ...buys('New headphones', 'gadget', 1, 800000, 11),
            ];
            const { merchants, oneOff, total } = topMerchants(txs);
            expect(merchants.map(m => m.key)).to.deep.equal(['grabfood']);
            expect(oneOff.count).to.equal(2);
            expect(oneOff.total).to.equal(1000000);
            expect(oneOff.share).to.equal(87);
            expect(oneOff.txIds).to.have.lengthOf(2);
            expect(total).to.equal(1150000);
        });

        it('has no roll-up when every merchant repeats', () => {
            const txs = [...buys('GrabFood', 'food', 2, 50000), ...buys('GrabRide', 'transport', 2, 20000, 15)];
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
