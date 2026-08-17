// The emergency-fund nudge must be suppressible by ANY persistent record of an
// emergency fund — an emergency goal (English or Indonesian) or a net-worth
// asset row — otherwise it nags forever and trains users to ignore nudges.
const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');

const Goal = require('../models/goal.model');
const NetWorth = require('../models/netWorth.model');

chai.use(chaiHttp);

const register = async (suffix) => {
    const creds = { name: `Nudge ${suffix}`, username: `nudge${suffix}`, email: `nudge${suffix}@example.com`, password: 'password123' };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ username: creds.username, password: creds.password });
    return { cookie: login.headers['set-cookie'], userId: login.body.data.user.id };
};

// Spend last month so avg monthly expense > 0 and the (zero-ish) balance covers
// < 3 months — the state in which the nudge fires.
const spendLastMonth = (cookie) => chai.request(server)
    .post('/api/transaction')
    .set('Cookie', cookie)
    .send({
        description: 'Groceries', amount: 3_000_000, category: 'food', type: 'expense',
        time: moment().subtract(1, 'month').format('YYYY-MM-DD HH:mm:ss'),
        currency: 'idr', transaction_timezone: 'Asia/Jakarta',
    });

const getNudges = async (cookie) => {
    const res = await chai.request(server).get('/api/recommendations').set('Cookie', cookie);
    expect(res).to.have.status(200);
    return res.body.data.recommendations;
};

describe('Emergency-fund nudge suppression', () => {
    it('fires when there is no emergency goal or asset', async () => {
        const { cookie } = await register('none');
        await spendLastMonth(cookie);
        const recs = await getNudges(cookie);
        expect(recs.some(r => r.id === 'emergency_fund')).to.equal(true);
    });

    it('is suppressed by an Indonesian-named goal ("Dana darurat")', async () => {
        const { cookie, userId } = await register('idgoal');
        await spendLastMonth(cookie);
        await Goal.create({ user: userId, description: 'Dana darurat', price: 30_000_000, savedAmount: 0 });
        const recs = await getNudges(cookie);
        expect(recs.some(r => r.id === 'emergency_fund')).to.equal(false);
    });

    it('is suppressed by an asset TYPED emergency_fund regardless of its label', async () => {
        // The structured signal: no name matching involved — a row typed
        // emergency_fund suppresses even with a label the regex would never hit.
        const { cookie, userId } = await register('nwtype');
        await spendLastMonth(cookie);
        await NetWorth.create({
            user: userId,
            assets: [{ label: 'Rainy day pot', amount: 20_000_000, type: 'emergency_fund' }],
            liabilities: [],
        });
        const recs = await getNudges(cookie);
        expect(recs.some(r => r.id === 'emergency_fund')).to.equal(false);
    });

    it('is suppressed by a net-worth asset row that reads as an emergency fund', async () => {
        const { cookie, userId } = await register('nwrow');
        await spendLastMonth(cookie);
        await NetWorth.create({
            user: userId,
            assets: [{ label: 'Dana darurat', amount: 51_000_000, type: 'cash' }],
            liabilities: [],
        });
        const recs = await getNudges(cookie);
        expect(recs.some(r => r.id === 'emergency_fund')).to.equal(false);
    });
});
