const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');

const User       = require('../models/user.model');
const Goal       = require('../models/goal.model');
const Snapshot   = require('../models/snapshot.model');
const Allocation = require('../models/allocation.model');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';

const register = async (creds) => {
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ username: creds.username, password: creds.password });
    return { cookie: login.headers['set-cookie'], userId: login.body.data.user.id };
};

describe('Allocation & surplus-sweep Integration Tests', () => {
    let authCookie, userId;

    beforeEach(async () => {
        ({ cookie: authCookie, userId } = await register({
            name: 'Sweep User', username: 'sweepuser', email: 'sweep@example.com', password: 'password123',
        }));
    });

    describe('POST /api/recommendations/allocate', () => {
        it('increments the goal savedAmount atomically and records an Allocation', async () => {
            const goal = await Goal.create({ user: userId, description: 'Holiday', price: 10_000_000, savedAmount: 1_000_000 });

            const res = await chai.request(server)
                .post('/api/recommendations/allocate')
                .set('Cookie', authCookie)
                .send({ source: 'surplus', sourceKey: '2026-07', goalId: String(goal._id), amount: 2_500_000 });

            expect(res).to.have.status(200);
            expect(res.body.status).to.equal(1);
            expect(res.body.data.allocated).to.equal(2_500_000);
            expect(res.body.data.goal.savedAmount).to.equal(3_500_000);

            const stored = await Goal.findById(goal._id).lean();
            expect(stored.savedAmount).to.equal(3_500_000);

            const alloc = await Allocation.find({ user: userId }).lean();
            expect(alloc).to.have.lengthOf(1);
            expect(alloc[0]).to.include({ source: 'surplus', sourceKey: '2026-07', amount: 2_500_000 });
        });

        it('auto-marks the goal achieved once fully funded', async () => {
            const goal = await Goal.create({ user: userId, description: 'Phone', price: 5_000_000, savedAmount: 4_000_000 });

            const res = await chai.request(server)
                .post('/api/recommendations/allocate')
                .set('Cookie', authCookie)
                .send({ source: 'windfall', sourceKey: 'txn123', goalId: String(goal._id), amount: 2_000_000 });

            expect(res).to.have.status(200);
            expect(res.body.data.goal.achieve).to.equal(1);
            expect(res.body.data.goal.savedAmount).to.equal(6_000_000);
        });

        it('rejects an invalid payload', async () => {
            const goal = await Goal.create({ user: userId, description: 'X', price: 1000 });
            const cases = [
                {},
                { source: 'nope', sourceKey: '2026-07', goalId: String(goal._id), amount: 100 },
                { source: 'surplus', sourceKey: '2026-07', goalId: String(goal._id), amount: -5 },
                { source: 'surplus', sourceKey: '2026-07', goalId: String(goal._id), amount: 'lots' },
                { source: 'surplus', goalId: String(goal._id), amount: 100 },
            ];
            for (const body of cases) {
                const res = await chai.request(server)
                    .post('/api/recommendations/allocate').set('Cookie', authCookie).send(body);
                expect(res, JSON.stringify(body)).to.have.status(400);
            }
            expect(await Allocation.countDocuments({ user: userId })).to.equal(0);
        });

        it('never funds another user\'s goal (404, no Allocation)', async () => {
            const other = await register({
                name: 'Other', username: 'otheralloc', email: 'otheralloc@example.com', password: 'password123',
            });
            const foreignGoal = await Goal.create({ user: other.userId, description: 'Not yours', price: 5000 });

            const res = await chai.request(server)
                .post('/api/recommendations/allocate')
                .set('Cookie', authCookie)
                .send({ source: 'surplus', sourceKey: '2026-07', goalId: String(foreignGoal._id), amount: 1000 });

            expect(res).to.have.status(404);
            const untouched = await Goal.findById(foreignGoal._id).lean();
            expect(untouched.savedAmount).to.equal(0);
            expect(await Allocation.countDocuments({})).to.equal(0);
        });

        it('returns 401 without a session', async () => {
            const res = await chai.request(server)
                .post('/api/recommendations/allocate')
                .send({ source: 'surplus', sourceKey: '2026-07', goalId: '000000000000000000000000', amount: 1000 });
            expect(res).to.have.status(401);
        });
    });

    describe('Surplus-sweep nudge in GET /api/recommendations', () => {
        const lastMonthYM = () => moment.tz(TZ).clone().subtract(1, 'month').format('YYYY-MM');

        it('surfaces the sweep nudge when last month ran a surplus and an active goal exists', async () => {
            await Goal.create({ user: userId, description: 'Emergency buffer', price: 10_000_000, savedAmount: 0 });
            await Snapshot.create({ user: userId, yearMonth: lastMonthYM(), income: 9_000_000, expense: 6_000_000, txCount: 4 });

            const res = await chai.request(server)
                .get('/api/recommendations?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

            expect(res).to.have.status(200);
            const sweep = res.body.data.recommendations.find(r => r.id === 'surplus_sweep');
            expect(sweep, 'surplus_sweep nudge present').to.exist;
            expect(sweep.cta.href).to.contain('sweep=' + lastMonthYM());
            expect(sweep.cta.href).to.contain('amount=3000000');
        });

        it('does not surface the nudge when there is no active goal to feed', async () => {
            await Snapshot.create({ user: userId, yearMonth: lastMonthYM(), income: 9_000_000, expense: 6_000_000, txCount: 4 });

            const res = await chai.request(server)
                .get('/api/recommendations?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

            expect(res.body.data.recommendations.find(r => r.id === 'surplus_sweep')).to.not.exist;
        });

        it('does not surface the nudge when last month overspent (no surplus)', async () => {
            await Goal.create({ user: userId, description: 'Trip', price: 5_000_000 });
            await Snapshot.create({ user: userId, yearMonth: lastMonthYM(), income: 5_000_000, expense: 7_000_000, txCount: 4 });

            const res = await chai.request(server)
                .get('/api/recommendations?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

            expect(res.body.data.recommendations.find(r => r.id === 'surplus_sweep')).to.not.exist;
        });

        it('suppresses the nudge once the surplus has been swept (Allocation exists)', async () => {
            const goal = await Goal.create({ user: userId, description: 'Trip', price: 5_000_000 });
            await Snapshot.create({ user: userId, yearMonth: lastMonthYM(), income: 9_000_000, expense: 6_000_000, txCount: 4 });

            // Act on the nudge — sweep the surplus into the goal.
            await chai.request(server)
                .post('/api/recommendations/allocate')
                .set('Cookie', authCookie)
                .send({ source: 'surplus', sourceKey: lastMonthYM(), goalId: String(goal._id), amount: 3_000_000 });

            const res = await chai.request(server)
                .get('/api/recommendations?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

            expect(res.body.data.recommendations.find(r => r.id === 'surplus_sweep')).to.not.exist;
        });
    });
});
