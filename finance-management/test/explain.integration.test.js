const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');
const User = require('../models/user.model');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';

const register = async (suffix) => {
    const creds = {
        name: `Explain ${suffix}`,
        username: `explain${suffix}`,
        email: `explain${suffix}@example.com`,
        password: 'password123',
    };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
    return login.headers['set-cookie'];
};

// Post an expense dated `monthsAgo` months back on a given day-of-month.
const addExpense = (cookie, { description, category, amount, monthsAgo, day }) => {
    const when = moment.tz(TZ).subtract(monthsAgo, 'months').date(day).hour(10).minute(0).second(0);
    return chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
        description, category, amount, type: 'expense',
        time: when.format('YYYY-MM-DD HH:mm:ss'),
        currency: 'idr', transaction_timezone: TZ,
    });
};

const addExpenseDaysAgo = (cookie, { description, category, amount, daysAgo }) => {
    const when = moment.tz(TZ).subtract(daysAgo, 'days').hour(10).minute(0).second(0);
    return chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
        description, category, amount, type: 'expense',
        time: when.format('YYYY-MM-DD HH:mm:ss'),
        currency: 'idr', transaction_timezone: TZ,
    });
};

describe('GET /api/transaction/explain — volatility & pace', () => {
    it('classifies a steady monthly charge as fixed and a swinging one as flexible', async () => {
        const cookie = await register('vol');

        // Rent: identical charge, once a month, for the last 6 months.
        for (let m = 1; m <= 6; m++) {
            await addExpense(cookie, { description: 'Rent', category: 'rent/mortgage', amount: 2500000, monthsAgo: m, day: 2 });
        }
        // Food: several transactions a month, swinging totals.
        const foodTotals = [1200000, 2400000, 900000, 3100000, 1500000, 2000000];
        for (let m = 1; m <= 6; m++) {
            const per = Math.round(foodTotals[m - 1] / 3);
            for (let k = 0; k < 3; k++) {
                await addExpense(cookie, { description: `Food ${m}-${k}`, category: 'food', amount: per, monthsAgo: m, day: 5 + k * 5 });
            }
        }
        // This month so far: rent posted, plus a little food.
        await addExpense(cookie, { description: 'Rent', category: 'rent/mortgage', amount: 2500000, monthsAgo: 0, day: 1 });
        await addExpense(cookie, { description: 'Food today', category: 'food', amount: 200000, monthsAgo: 0, day: 1 });

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        expect(res).to.have.status(200);
        const cats = Object.fromEntries(res.body.data.topCategories.map(c => [c.category, c]));

        expect(cats['rent/mortgage'].volatility).to.equal('fixed');
        expect(cats['food'].volatility).to.equal('flexible');
    });

    it('sums every current category into a volatilityBreakdown that reconciles to the total', async () => {
        const cookie = await register('breakdown');

        // Rent: steady monthly charge → fixed.
        for (let m = 1; m <= 6; m++) {
            await addExpense(cookie, { description: 'Rent', category: 'rent/mortgage', amount: 2500000, monthsAgo: m, day: 2 });
        }
        // Food: swinging monthly totals across many transactions → flexible.
        const foodTotals = [1200000, 2400000, 900000, 3100000, 1500000, 2000000];
        for (let m = 1; m <= 6; m++) {
            const per = Math.round(foodTotals[m - 1] / 3);
            for (let k = 0; k < 3; k++) {
                await addExpense(cookie, { description: `Food ${m}-${k}`, category: 'food', amount: per, monthsAgo: m, day: 5 + k * 5 });
            }
        }
        // Current month: rent posted (fixed) and some food (flexible).
        await addExpense(cookie, { description: 'Rent', category: 'rent/mortgage', amount: 2500000, monthsAgo: 0, day: 1 });
        await addExpense(cookie, { description: 'Food today', category: 'food', amount: 300000, monthsAgo: 0, day: 1 });

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        expect(res).to.have.status(200);
        const b = res.body.data.volatilityBreakdown;
        expect(b).to.be.an('object');

        // Buckets reconcile to the reported total, which equals totalOutcome.
        expect(b.fixed + b.semi + b.flexible + b.unknown).to.equal(b.total);
        expect(b.total).to.equal(res.body.data.totalOutcome);

        // Steady rent lands in fixed; swinging food lands in flexible.
        expect(b.fixed).to.equal(2500000);
        expect(b.flexible).to.equal(300000);
    });

    it('does not report a fixed charge as "down" just because the month is young', async () => {
        const cookie = await register('pace');

        // Rent every month, and already posted this month at the same amount.
        for (let m = 1; m <= 6; m++) {
            await addExpense(cookie, { description: 'Rent', category: 'rent/mortgage', amount: 3000000, monthsAgo: m, day: 2 });
        }
        await addExpense(cookie, { description: 'Rent', category: 'rent/mortgage', amount: 3000000, monthsAgo: 0, day: 1 });

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        const rent = res.body.data.topCategories.find(c => c.category === 'rent/mortgage');
        expect(rent.volatility).to.equal('fixed');
        // Same amount as last month → ~0% change, never a large negative "great progress" artifact.
        expect(rent.delta === null || Math.abs(rent.delta) <= 1).to.equal(true);
    });

    it('never reads a young month as a collapse in spending', async () => {
        const cookie = await register('accrue');

        for (let daysAgo = 1; daysAgo <= 86; daysAgo += 5) {
            await addExpenseDaysAgo(cookie, { description: 'Widget', category: 'food', amount: 150000, daysAgo });
        }

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        const food = res.body.data.topCategories.find(c => c.category === 'food');
        expect(food).to.exist;
        expect(food.delta).to.be.above(-25);
    });

    it('claims no pace for a category the user only buys from occasionally', async () => {
        const cookie = await register('lumpy');

        const past = [80000, 300000, 120000];
        for (let m = 1; m <= 3; m++) {
            await addExpense(cookie, { description: `Widget ${m}`, category: 'shopping', amount: past[m - 1], monthsAgo: m, day: 2 });
        }
        await addExpense(cookie, { description: 'Widget', category: 'shopping', amount: 550000, monthsAgo: 0, day: 1 });

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        const shopping = res.body.data.topCategories.find(c => c.category === 'shopping');
        expect(shopping.volatility).to.not.equal('fixed');
        expect(shopping.lumpy).to.equal(true);
        expect(shopping.prevTotal).to.equal(80000);
        expect(shopping.baseline).to.equal(null);
        expect(shopping.delta).to.equal(null);
    });

    it('raises no alarm for a category whose behaviour has not changed, whatever day it is', async () => {
        const cookie = await register('steady');

        for (let daysAgo = 1; daysAgo <= 86; daysAgo += 5) {
            await addExpenseDaysAgo(cookie, { description: 'Widget', category: 'food', amount: 250000, daysAgo });
        }

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        const food = res.body.data.topCategories.find(c => c.category === 'food');
        expect(food.windowKind).to.equal('rolling-30d');
        expect(food.lumpy).to.equal(false);
        expect(Math.abs(food.delta)).to.be.at.most(10);
    });

    it('still fires for a category that genuinely rose over the last thirty days', async () => {
        const cookie = await register('uptrend');

        for (let daysAgo = 1; daysAgo <= 86; daysAgo += 5) {
            const amount = daysAgo <= 30 ? 160000 : 100000;
            await addExpenseDaysAgo(cookie, { description: 'Widget', category: 'food', amount, daysAgo });
        }

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        const food = res.body.data.topCategories.find(c => c.category === 'food');
        expect(food.windowKind).to.equal('rolling-30d');
        expect(food.delta).to.be.at.least(40);
        expect(food.windowTotal - food.baseline).to.be.at.least(300000);
    });

    it('keeps the pace baseline for a category that accrues across the month', async () => {
        const cookie = await register('accrual');

        for (let m = 1; m <= 3; m++) {
            for (let k = 0; k < 4; k++) {
                await addExpense(cookie, { description: `Food ${m}-${k}`, category: 'food', amount: 500000, monthsAgo: m, day: 3 + k * 6 });
            }
        }
        await addExpense(cookie, { description: 'Food', category: 'food', amount: 400000, monthsAgo: 0, day: 1 });

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        const food = res.body.data.topCategories.find(c => c.category === 'food');
        expect(food.lumpy).to.equal(false);
        expect(food.baseline).to.be.a('number');
        expect(food.delta).to.be.a('number');
    });
});
