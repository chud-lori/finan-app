const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');

const User        = require('../models/user.model');
const Category    = require('../models/category.model');
const GroupBudget = require('../models/groupBudget.model');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';

describe('Group Budget (envelope-lite soft caps)', () => {
    let authCookie;
    let userId;

    beforeEach(async () => {
        const creds = {
            name: 'Cap User', username: 'capuser',
            email: 'cap@example.com', password: 'password123',
        };
        await chai.request(server).post('/api/auth/register').send(creds);
        const login = await chai.request(server)
            .post('/api/auth/login')
            .send({ identifier: creds.email, password: creds.password });
        authCookie = login.headers['set-cookie'];
        userId = (await User.findOne({ email: creds.email }))._id;
    });

    const addExpense = (category, amount) =>
        chai.request(server).post('/api/transaction').set('Cookie', authCookie).send({
            description: `${category} spend`, amount, category, type: 'expense',
            time: '2026-08-10 10:00:00', currency: 'idr', transaction_timezone: TZ,
        });

    describe('GET /api/group-budget', () => {
        it('returns all four cappable groups with null caps for a new user', async () => {
            const res = await chai.request(server)
                .get(`/api/group-budget?tz=${encodeURIComponent(TZ)}`)
                .set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.status).to.equal(1);
            expect(res.body.data.hasCaps).to.equal(false);
            const groups = res.body.data.groups.map(g => g.group).sort();
            expect(groups).to.deep.equal(['discretionary', 'essential', 'savings', 'social']);
            res.body.data.groups.forEach(g => {
                expect(g.cap).to.equal(null);
                expect(g.spent).to.equal(0);
            });
        });

        it('reports spend against a set cap with progress and over-flag', async () => {
            // Give "dining" the discretionary group, then overspend the cap.
            await Category.updateOne(
                { user: userId, name: 'dining' },
                { $set: { user: userId, name: 'dining', type: 'expense', group: 'discretionary' } },
                { upsert: true },
            );
            await addExpense('dining', 300000);
            await addExpense('dining', 400000);

            await chai.request(server)
                .put('/api/group-budget/discretionary')
                .set('Cookie', authCookie)
                .send({ amount: 500000 });

            const res = await chai.request(server)
                .get(`/api/group-budget?tz=${encodeURIComponent(TZ)}&month=2026-08`)
                .set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.data.hasCaps).to.equal(true);
            const disc = res.body.data.groups.find(g => g.group === 'discretionary');
            expect(disc.cap).to.equal(500000);
            expect(disc.spent).to.equal(700000);
            expect(disc.pct).to.equal(140);
            expect(disc.over).to.equal(true);
            expect(disc.remaining).to.equal(-200000);
        });
    });

    describe('PUT /api/group-budget/:group', () => {
        it('rejects a group that is not cappable', async () => {
            const res = await chai.request(server)
                .put('/api/group-budget/income')
                .set('Cookie', authCookie)
                .send({ amount: 100000 });
            expect(res).to.have.status(400);
        });

        it('sets, updates and clears a cap (opt-out removes the row)', async () => {
            await chai.request(server).put('/api/group-budget/social')
                .set('Cookie', authCookie).send({ amount: 250000 });
            let doc = await GroupBudget.findOne({ user: userId, group: 'social' }).lean();
            expect(doc.amount).to.equal(250000);

            await chai.request(server).put('/api/group-budget/social')
                .set('Cookie', authCookie).send({ amount: 400000 });
            doc = await GroupBudget.findOne({ user: userId, group: 'social' }).lean();
            expect(doc.amount).to.equal(400000);

            // Clear with amount 0 → row deleted, so "no cap" is unambiguous
            const clear = await chai.request(server).put('/api/group-budget/social')
                .set('Cookie', authCookie).send({ amount: 0 });
            expect(clear).to.have.status(200);
            expect(clear.body.data.cap).to.equal(null);
            doc = await GroupBudget.findOne({ user: userId, group: 'social' }).lean();
            expect(doc).to.equal(null);
        });

        it('scopes caps to the requesting user', async () => {
            // Another user's cap must never leak into this user's read.
            const other = await User.create({ name: 'O', username: 'other', email: 'other@x.com', password: 'x' });
            await GroupBudget.create({ user: other._id, group: 'essential', amount: 999999 });

            const res = await chai.request(server)
                .get('/api/group-budget')
                .set('Cookie', authCookie);
            const essential = res.body.data.groups.find(g => g.group === 'essential');
            expect(essential.cap).to.equal(null);
            expect(res.body.data.hasCaps).to.equal(false);
        });
    });
});
