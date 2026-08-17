// Emergency-fund nudge suppression is STRUCTURED-ONLY: a goal with
// kind='emergency' or a net-worth asset row typed emergency_fund. No name
// matching at runtime — users name things anything, so a label heuristic both
// misses real funds and can't be reasoned about. Legacy emergency-named goals
// are converted once by migrateGoalKinds at startup.
const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');

const Goal = require('../models/goal.model');
const NetWorth = require('../models/netWorth.model');
const { migrateGoalKinds } = require('../helpers/migrateGoalKinds');

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
    it('fires when there is no emergency goal or typed asset', async () => {
        const { cookie } = await register('none');
        await spendLastMonth(cookie);
        const recs = await getNudges(cookie);
        expect(recs.some(r => r.id === 'emergency_fund')).to.equal(true);
    });

    it('is suppressed by a goal with kind=emergency regardless of its name', async () => {
        const { cookie, userId } = await register('kindgoal');
        await spendLastMonth(cookie);
        await Goal.create({ user: userId, description: 'Jaga-jaga', price: 30_000_000, savedAmount: 0, kind: 'emergency' });
        const recs = await getNudges(cookie);
        expect(recs.some(r => r.id === 'emergency_fund')).to.equal(false);
    });

    it('is NOT suppressed by an emergency-sounding name alone (no structured signal)', async () => {
        // Post-migration, runtime never name-matches: a kind='general' goal that
        // merely sounds like an emergency fund does not suppress.
        const { cookie, userId } = await register('namegoal');
        await spendLastMonth(cookie);
        await Goal.create({ user: userId, description: 'Dana darurat', price: 30_000_000, savedAmount: 0, kind: 'general' });
        const recs = await getNudges(cookie);
        expect(recs.some(r => r.id === 'emergency_fund')).to.equal(true);
    });

    it('is suppressed by an asset TYPED emergency_fund regardless of its label', async () => {
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

    it('goal saved through the Emergency Fund tool flow (kind param) suppresses', async () => {
        const { cookie } = await register('toolflow');
        await spendLastMonth(cookie);
        const res = await chai.request(server)
            .post('/api/goal/add')
            .set('Cookie', cookie)
            .send({ description: 'Emergency fund (3 months)', price: 9_000_000, kind: 'emergency' });
        expect(res).to.have.status(201);
        expect(res.body.data.goal.kind).to.equal('emergency');
        const recs = await getNudges(cookie);
        expect(recs.some(r => r.id === 'emergency_fund')).to.equal(false);
    });

    describe('migrateGoalKinds (legacy data)', () => {
        it('flags kind-less emergency-named goals once, leaves the rest general', async () => {
            const { userId } = await register('migrate');
            // Simulate pre-kind documents: strip the field entirely.
            const g1 = await Goal.create({ user: userId, description: 'Dana darurat', price: 1_000_000 });
            const g2 = await Goal.create({ user: userId, description: 'Holiday', price: 1_000_000 });
            await Goal.updateMany({ user: userId }, { $unset: { kind: 1 } });

            await migrateGoalKinds();

            const after1 = await Goal.findById(g1._id).lean();
            const after2 = await Goal.findById(g2._id).lean();
            expect(after1.kind).to.equal('emergency');
            expect(after2.kind).to.equal('general');

            // Idempotent: a user's later re-kind is never overwritten by a restart.
            await Goal.updateOne({ _id: g1._id }, { $set: { kind: 'general' } });
            await migrateGoalKinds();
            expect((await Goal.findById(g1._id).lean()).kind).to.equal('general');
        });
    });
});
