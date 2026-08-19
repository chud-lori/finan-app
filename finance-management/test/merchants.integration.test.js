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
        name: `Merchant ${suffix}`,
        username: `merchant${suffix}`,
        email: `merchant${suffix}@example.com`,
        password: 'password123',
    };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
    return login.headers['set-cookie'];
};

const addExpense = (cookie, { description, category, amount, day }) => {
    const when = moment.tz(TZ).date(day).hour(10).minute(0).second(0);
    return chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
        description, category, amount, type: 'expense',
        time: when.format('YYYY-MM-DD HH:mm:ss'),
        currency: 'idr', transaction_timezone: TZ,
    });
};

const markSavings = async (name) => {
    await drainBackgroundJobs();
    await Category.updateMany(
        { name: { $regex: new RegExp(`^${name}$`, 'i') } },
        { $set: { group: 'savings', groupOverridden: true, groupConfidence: 1 } },
    );
};

const now = moment.tz(TZ);
const thisPeriod = `year=${now.year()}&month=${now.month() + 1}&tz=${encodeURIComponent(TZ)}`;

describe('Merchant Analytics Integration Tests', () => {
    it('ranks the period merchants and collapses one-offs', async () => {
        const cookie = await register('rank');
        for (const day of [3, 5, 7]) await addExpense(cookie, { description: 'GrabFood', category: 'food', amount: 50000, day });
        for (const day of [4, 6]) await addExpense(cookie, { description: 'GrabRide', category: 'transport', amount: 20000, day });
        await addExpense(cookie, { description: 'Airport lounge', category: 'travel', amount: 300000, day: 8 });

        const res = await chai.request(server)
            .get(`/api/transaction/merchants?${thisPeriod}`)
            .set('Cookie', cookie);

        expect(res).to.have.status(200);
        const { merchants, oneOff, total, merchantCount } = res.body.data;
        expect(total).to.equal(490000);
        expect(merchantCount).to.equal(2);
        expect(merchants.map(m => m.key)).to.deep.equal(['grabfood', 'grabride']);
        expect(merchants[0]).to.include({ count: 3, total: 150000, category: 'food' });
        expect(merchants[0].txIds).to.have.lengthOf(3);
        expect(oneOff).to.include({ count: 1, total: 300000 });
    });

    it('leaves savings-group outflow out of merchant spend', async () => {
        const cookie = await register('savings');
        for (const day of [3, 5, 7]) await addExpense(cookie, { description: 'Bibit', category: 'reksa dana', amount: 1000000, day });
        for (const day of [4, 6]) await addExpense(cookie, { description: 'GrabFood', category: 'food', amount: 50000, day });
        await markSavings('reksa dana');

        const res = await chai.request(server)
            .get(`/api/transaction/merchants?${thisPeriod}`)
            .set('Cookie', cookie);

        expect(res).to.have.status(200);
        expect(res.body.data.total).to.equal(100000);
        expect(res.body.data.merchants.map(m => m.key)).to.deep.equal(['grabfood']);
    });

    it('never returns another user transactions', async () => {
        const mine   = await register('mine');
        const theirs = await register('theirs');
        for (const day of [3, 5] ) await addExpense(theirs, { description: 'Their cafe', category: 'coffee', amount: 90000, day });

        const res = await chai.request(server)
            .get(`/api/transaction/merchants?${thisPeriod}`)
            .set('Cookie', mine);

        expect(res).to.have.status(200);
        expect(res.body.data.merchants).to.be.empty;
        expect(res.body.data.total).to.equal(0);
    });

    it('clamps the limit and ignores a nonsense period', async () => {
        const cookie = await register('clamp');
        const res = await chai.request(server)
            .get(`/api/transaction/merchants?year=abc&month=99&limit=9999&tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', cookie);

        expect(res).to.have.status(200);
        expect(res.body.data.limit).to.equal(50);
        expect(res.body.data.year).to.equal(new Date().getFullYear());
        expect(res.body.data.month).to.equal(null);
    });

    it('requires authentication', async () => {
        const res = await chai.request(server).get('/api/transaction/merchants');
        expect(res).to.have.status(401);
    });
});
