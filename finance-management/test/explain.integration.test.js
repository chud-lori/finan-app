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

    it('pace-corrects an accruing category so a partial month is not falsely down', async () => {
        const cookie = await register('accrue');

        // Food ~3,000,000 per month across history, spread over the month.
        for (let m = 1; m <= 6; m++) {
            for (let k = 0; k < 3; k++) {
                await addExpense(cookie, { description: `Food ${m}-${k}`, category: 'food', amount: 1000000, monthsAgo: m, day: 5 + k * 8 });
            }
        }
        // This month, on pace: proportional spend for the elapsed days.
        const now = moment.tz(TZ);
        const fraction = now.date() / now.daysInMonth();
        const onPace = Math.round(3000000 * fraction);
        await addExpense(cookie, { description: 'Food this month', category: 'food', amount: onPace, monthsAgo: 0, day: 1 });

        const res = await chai.request(server)
            .get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        const food = res.body.data.topCategories.find(c => c.category === 'food');
        expect(food).to.exist;
        // On last month's pace must read near 0%, not the large negative a full-month comparison gives.
        expect(Math.abs(food.delta)).to.be.lessThan(25);
    });
});
