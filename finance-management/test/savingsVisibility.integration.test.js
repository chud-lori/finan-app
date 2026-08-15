// Coverage for Savings & Investment Visibility (Option A): money logged as an
// expense in a `group === 'savings'` category is a transfer to yourself, not
// consumption. It must be EXCLUDED from spend totals, top-spend explainability
// and anomaly baselines — investing is not overspending.
const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');
const Category = require('../models/category.model');
const { drainBackgroundJobs } = require('../helpers/backgroundJobs');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';

const register = async (suffix) => {
    const creds = {
        name: `Savings ${suffix}`,
        username: `savings${suffix}`,
        email: `savings${suffix}@example.com`,
        password: 'password123',
    };
    const reg = await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
    return { cookie: login.headers['set-cookie'], userId: reg.body?.data?.id };
};

const addExpense = (cookie, { description, category, amount, monthsAgo, day }) => {
    const when = moment.tz(TZ).subtract(monthsAgo, 'months').date(day).hour(10).minute(0).second(0);
    return chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
        description, category, amount, type: 'expense',
        time: when.format('YYYY-MM-DD HH:mm:ss'),
        currency: 'idr', transaction_timezone: TZ,
    });
};

// Force a category into the savings group deterministically, then let any
// fire-and-forget classification kicked off by addTransaction settle so it does
// not race the assertions.
const markSavings = async (name) => {
    await drainBackgroundJobs();
    await Category.updateMany(
        { name: { $regex: new RegExp(`^${name}$`, 'i') } },
        { $set: { group: 'savings', groupOverridden: true, groupConfidence: 1 } },
    );
};

describe('Savings & Investment Visibility — savings-group outflow is not spend', () => {
    it('excludes savings-group outflow from explainability spend totals and top categories', async () => {
        const { cookie } = await register('explain');

        // Prior-month baseline for food so it appears with history.
        await addExpense(cookie, { description: 'Food', category: 'food', amount: 1_000_000, monthsAgo: 1, day: 10 });
        // This month: a real expense and a much larger investment transfer.
        await addExpense(cookie, { description: 'Food', category: 'food', amount: 1_000_000, monthsAgo: 0, day: 2 });
        await addExpense(cookie, { description: 'DCA reksa dana', category: 'reksa dana', amount: 5_000_000, monthsAgo: 0, day: 3 });

        await markSavings('reksa dana');

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        expect(res).to.have.status(200);
        // Only the 1,000,000 of real spend counts — the 5,000,000 invested is saved.
        expect(res.body.data.totalOutcome).to.equal(1_000_000);
        const cats = res.body.data.topCategories.map(c => c.category);
        expect(cats).to.include('food');
        expect(cats).to.not.include('reksa dana');
    });

    it('never flags savings-group outflow as an anomaly, but still flags real overspend', async () => {
        const { cookie } = await register('anomaly');

        // Two months of a modest, steady food baseline.
        await addExpense(cookie, { description: 'Food', category: 'food', amount: 100_000, monthsAgo: 1, day: 15 });
        await addExpense(cookie, { description: 'Food', category: 'food', amount: 100_000, monthsAgo: 2, day: 15 });

        // This month: a genuinely large food spend (should flag) and a first-ever,
        // very large investment transfer (must NOT flag — it is not overspending).
        await addExpense(cookie, { description: 'Big grocery run', category: 'food', amount: 5_000_000, monthsAgo: 0, day: 4 });
        await addExpense(cookie, { description: 'Lump-sum reksa dana', category: 'reksa dana', amount: 10_000_000, monthsAgo: 0, day: 5 });

        await markSavings('reksa dana');

        const res = await chai.request(server)
            .get(`/api/transaction/anomalies?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        expect(res).to.have.status(200);
        const flaggedCats = res.body.data.anomalies.map(a => a.category);
        expect(flaggedCats).to.include('food');            // real overspend still caught
        expect(flaggedCats).to.not.include('reksa dana');  // investing is not an anomaly
    });
});
