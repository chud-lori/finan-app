const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');

const User        = require('../models/user.model');
const Goal        = require('../models/goal.model');
const Transaction = require('../models/transaction.model');
const Allocation  = require('../models/allocation.model');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const mkIncome = (userId, amount, when) => ({
    user: userId, description: 'income', category: 'salary', amount,
    currency: 'IDR', type: 'income', time: when, transaction_timezone: TZ,
});

const register = async (creds) => {
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ username: creds.username, password: creds.password });
    return { cookie: login.headers['set-cookie'], userId: login.body.data.user.id };
};

describe('Windfall Integration Tests', () => {
    let authCookie, userId;

    beforeEach(async () => {
        ({ cookie: authCookie, userId } = await register({
            name: 'Windfall User', username: 'windfalluser', email: 'windfall@example.com', password: 'password123',
        }));
        // Four normal monthly salaries (baseline) + one large recent deposit (THR).
        await Transaction.insertMany([
            mkIncome(userId, 5_000_000, daysAgo(60)),
            mkIncome(userId, 5_000_000, daysAgo(90)),
            mkIncome(userId, 5_000_000, daysAgo(120)),
            mkIncome(userId, 5_000_000, daysAgo(150)),
            mkIncome(userId, 20_000_000, daysAgo(5)), // windfall
        ]);
    });

    describe('GET /api/recommendations/windfall', () => {
        it('detects the large recent income and returns active goals to split into', async () => {
            const goal = await Goal.create({ user: userId, description: 'Emergency fund', price: 30_000_000, savedAmount: 0 });

            const res = await chai.request(server)
                .get('/api/recommendations/windfall?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.data.windfall).to.exist;
            expect(res.body.data.windfall.amount).to.equal(20_000_000);
            expect(res.body.data.windfall.remaining).to.equal(20_000_000);
            expect(res.body.data.windfall.handled).to.equal(false);
            expect(res.body.data.goals.map(g => g.id)).to.include(String(goal._id));
        });

        it('reports remaining after a partial allocation', async () => {
            const goal = await Goal.create({ user: userId, description: 'Trip', price: 30_000_000, savedAmount: 0 });

            const detect = await chai.request(server)
                .get('/api/recommendations/windfall?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);
            const txnId = detect.body.data.windfall.transactionId;

            await chai.request(server).post('/api/recommendations/allocate').set('Cookie', authCookie)
                .send({ source: 'windfall', sourceKey: txnId, goalId: String(goal._id), amount: 8_000_000 });

            const res = await chai.request(server)
                .get('/api/recommendations/windfall?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

            expect(res.body.data.windfall.allocated).to.equal(8_000_000);
            expect(res.body.data.windfall.remaining).to.equal(12_000_000);
            expect(res.body.data.windfall.handled).to.equal(true);
        });

        it('returns no windfall when income is steady', async () => {
            await Transaction.deleteMany({ user: userId });
            await Transaction.insertMany([
                mkIncome(userId, 5_000_000, daysAgo(5)),
                mkIncome(userId, 5_000_000, daysAgo(35)),
                mkIncome(userId, 5_000_000, daysAgo(65)),
                mkIncome(userId, 5_000_000, daysAgo(95)),
            ]);

            const res = await chai.request(server)
                .get('/api/recommendations/windfall?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

            expect(res.body.data.windfall).to.equal(null);
        });

        it('returns 401 without a session', async () => {
            const res = await chai.request(server).get('/api/recommendations/windfall');
            expect(res).to.have.status(401);
        });
    });

    describe('Windfall nudge in GET /api/recommendations', () => {
        it('surfaces the windfall nudge, then suppresses it once allocated', async () => {
            const goal = await Goal.create({ user: userId, description: 'House', price: 500_000_000, savedAmount: 0 });

            const first = await chai.request(server)
                .get('/api/recommendations?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);
            const windfallRec = first.body.data.recommendations.find(r => r.id.startsWith('windfall_'));
            expect(windfallRec, 'windfall nudge present').to.exist;
            const txnId = windfallRec.id.replace('windfall_', '');

            await chai.request(server).post('/api/recommendations/allocate').set('Cookie', authCookie)
                .send({ source: 'windfall', sourceKey: txnId, goalId: String(goal._id), amount: 5_000_000 });

            const second = await chai.request(server)
                .get('/api/recommendations?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);
            expect(second.body.data.recommendations.find(r => r.id.startsWith('windfall_'))).to.not.exist;

            expect(await Allocation.countDocuments({ user: userId, source: 'windfall' })).to.equal(1);
        });
    });
});
