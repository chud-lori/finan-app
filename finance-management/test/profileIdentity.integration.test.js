// Savings-group outflow is retained, not spent — the identity must agree with the health score on the same screen.
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
        name: `Identity ${suffix}`,
        username: `identity${suffix}`,
        email: `identity${suffix}@example.com`,
        password: 'password123',
    };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
    return { cookie: login.headers['set-cookie'] };
};

const addTxn = (cookie, { description, category, amount, type, day }) => {
    const when = moment.tz(TZ).date(day).hour(10).minute(0).second(0);
    return chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
        description, category, amount, type,
        time: when.format('YYYY-MM-DD HH:mm:ss'),
        currency: 'idr', transaction_timezone: TZ,
    });
};

// Let the fire-and-forget classification settle so it can't race the assertions.
const markSavings = async (name) => {
    await drainBackgroundJobs();
    await Category.updateMany(
        { name: { $regex: new RegExp(`^${name}$`, 'i') } },
        { $set: { group: 'savings', groupOverridden: true, groupConfidence: 1 } },
    );
};

describe('Profile financial identity — savings-group outflow is not spend', () => {
    it('reports a 60% savings rate for 10M income / 4M spend / 3M invested', async () => {
        const { cookie } = await register('rate');

        await addTxn(cookie, { description: 'Salary',        category: 'salary',     amount: 10_000_000, type: 'income',  day: 1 });
        await addTxn(cookie, { description: 'Groceries',     category: 'food',       amount:  4_000_000, type: 'expense', day: 2 });
        await addTxn(cookie, { description: 'DCA reksa dana', category: 'reksa dana', amount:  3_000_000, type: 'expense', day: 3 });

        await markSavings('reksa dana');

        const res = await chai.request(server).get('/api/profile').set('Cookie', cookie);

        expect(res).to.have.status(200);
        const id = res.body.data.identity;

        // (10M − 4M real spend) / 10M = 60%; counting the 3M invested as expense gives 30%.
        expect(id.avgSavingsRate).to.equal(60);
        // "Average monthly spending" is spending, so the investment is not in it.
        expect(id.avgMonthlyExpense).to.equal(4_000_000);
        expect(id.avgMonthlyIncome).to.equal(10_000_000);
        // A spending headline, so never the savings category even though 3M would rank second.
        expect(id.topCategory).to.equal('food');
        expect(id.topCategoryPct).to.equal(100); // 4M of 4M non-savings spend
    });

    it('still counts ordinary expenses when the user has no savings categories', async () => {
        const { cookie } = await register('plain');

        await addTxn(cookie, { description: 'Salary',    category: 'salary', amount: 10_000_000, type: 'income',  day: 1 });
        await addTxn(cookie, { description: 'Groceries', category: 'food',   amount:  4_000_000, type: 'expense', day: 2 });
        await addTxn(cookie, { description: 'Rent',      category: 'rent',   amount:  3_000_000, type: 'expense', day: 3 });

        await drainBackgroundJobs();

        const res = await chai.request(server).get('/api/profile').set('Cookie', cookie);

        expect(res).to.have.status(200);
        const id = res.body.data.identity;
        expect(id.avgMonthlyExpense).to.equal(7_000_000);
        expect(id.avgSavingsRate).to.equal(30);
        expect(id.topCategory).to.equal('food');
    });

    it('exposes the email-verified flag on the user block', async () => {
        const { cookie } = await register('verified');

        const res = await chai.request(server).get('/api/profile').set('Cookie', cookie);

        expect(res).to.have.status(200);
        expect(res.body.data.user).to.have.property('verified');
        expect(res.body.data.user.verified).to.be.a('boolean');
    });
});
