const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');

const User             = require('../models/user.model');
const Balance          = require('../models/balance.model');
const NetWorth         = require('../models/netWorth.model');
const NetWorthSnapshot = require('../models/netWorthSnapshot.model');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';

describe('Net Worth Integration Tests', () => {
    let authCookie;
    let userId;

    beforeEach(async () => {
        const creds = {
            name: 'Net Worth User',
            username: 'networthuser',
            email: 'networth@example.com',
            password: 'password123',
        };
        await chai.request(server).post('/api/auth/register').send(creds);
        const login = await chai.request(server)
            .post('/api/auth/login')
            .send({ identifier: creds.email, password: creds.password });

        authCookie = login.headers['set-cookie'];
        userId = (await User.findOne({ email: creds.email }))._id;
    });

    describe('GET /api/networth', () => {
        it('returns an empty draft for a user who has never saved holdings', async () => {
            const res = await chai.request(server).get('/api/networth').set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.status).to.equal(1);
            expect(res.body.data.assets).to.be.an('array').with.lengthOf(0);
            expect(res.body.data.liabilities).to.be.an('array').with.lengthOf(0);
            expect(res.body.data.netWorth).to.equal(0);
            expect(res.body.data.seeded).to.equal(true);
        });

        it('seeds the app cash balance as an asset row without persisting it', async () => {
            // Registration already creates a zero Balance — update it rather than
            // inserting a second document.
            await Balance.updateOne({ user: userId }, { $set: { amount: 7_500_000 } }, { upsert: true });

            const res = await chai.request(server).get('/api/networth').set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.data.assets).to.have.lengthOf(1);
            expect(res.body.data.assets[0]).to.include({ label: 'Cash balance', amount: 7_500_000, type: 'cash' });
            expect(res.body.data.netWorth).to.equal(7_500_000);
            expect(res.body.data.seeded).to.equal(true);

            // GET must stay read-only — the seed is a suggestion, not stored state.
            expect(await NetWorth.countDocuments({ user: userId })).to.equal(0);
        });

        it('returns 401 without a session', async () => {
            const res = await chai.request(server).get('/api/networth');
            expect(res).to.have.status(401);
        });
    });

    describe('PUT /api/networth', () => {
        it('computes net worth as assets minus liabilities and persists holdings', async () => {
            const res = await chai.request(server)
                .put('/api/networth')
                .set('Cookie', authCookie)
                .send({
                    assets: [
                        { label: 'Savings account', amount: 50_000_000, type: 'cash' },
                        { label: 'Mutual funds',    amount: 30_000_000, type: 'investment' },
                    ],
                    liabilities: [
                        { label: 'Car loan', amount: 20_000_000, type: 'loan' },
                    ],
                });

            expect(res).to.have.status(200);
            expect(res.body.data.totalAssets).to.equal(80_000_000);
            expect(res.body.data.totalLiabilities).to.equal(20_000_000);
            expect(res.body.data.netWorth).to.equal(60_000_000);

            const stored = await NetWorth.findOne({ user: userId }).lean();
            expect(stored.assets).to.have.lengthOf(2);
            expect(stored.liabilities).to.have.lengthOf(1);
            expect(stored.assets[0]).to.include({ label: 'Savings account', amount: 50_000_000, type: 'cash' });
        });

        it('reports a negative net worth when liabilities exceed assets', async () => {
            const res = await chai.request(server)
                .put('/api/networth')
                .set('Cookie', authCookie)
                .send({
                    assets:      [{ label: 'Cash', amount: 1_000_000 }],
                    liabilities: [{ label: 'Credit card', amount: 4_000_000, type: 'credit_card' }],
                });

            expect(res).to.have.status(200);
            expect(res.body.data.netWorth).to.equal(-3_000_000);
        });

        it('falls back to type "other" for an unknown type and sanitises the label', async () => {
            const res = await chai.request(server)
                .put('/api/networth')
                .set('Cookie', authCookie)
                .send({
                    assets: [{ label: '  <b>Gold</b> bars ', amount: 12_000_000, type: 'crypto_moon' }],
                    liabilities: [],
                });

            expect(res).to.have.status(200);
            expect(res.body.data.assets[0].label).to.equal('Gold bars');
            expect(res.body.data.assets[0].type).to.equal('other');
        });

        it('rejects invalid payloads', async () => {
            const cases = [
                {},
                { assets: 'not-an-array' },
                { assets: [{ label: '', amount: 100 }] },
                { assets: [{ label: 'No amount' }] },
                { assets: [{ label: 'Negative', amount: -5 }] },
                { liabilities: [{ label: 'NaN amount', amount: 'lots' }] },
            ];

            for (const body of cases) {
                const res = await chai.request(server)
                    .put('/api/networth').set('Cookie', authCookie).send(body);
                expect(res, JSON.stringify(body)).to.have.status(400);
                expect(res.body.status).to.equal(0);
            }

            expect(await NetWorth.countDocuments({ user: userId })).to.equal(0);
        });

        it('returns 401 without a session', async () => {
            const res = await chai.request(server).put('/api/networth').send({ assets: [] });
            expect(res).to.have.status(401);
        });
    });

    describe('Snapshot upsert — one reading per month', () => {
        it('writes a snapshot for the current month on save', async () => {
            await chai.request(server)
                .put('/api/networth?tz=' + encodeURIComponent(TZ))
                .set('Cookie', authCookie)
                .send({
                    assets:      [{ label: 'Savings', amount: 40_000_000, type: 'cash' }],
                    liabilities: [{ label: 'Loan', amount: 15_000_000, type: 'loan' }],
                });

            const ym = moment.tz(TZ).format('YYYY-MM');
            const snaps = await NetWorthSnapshot.find({ user: userId }).lean();

            expect(snaps).to.have.lengthOf(1);
            expect(snaps[0]).to.include({
                yearMonth: ym, assets: 40_000_000, liabilities: 15_000_000, netWorth: 25_000_000,
            });
        });

        it('overwrites rather than appends when holdings change twice in the same month', async () => {
            const url = '/api/networth?tz=' + encodeURIComponent(TZ);

            await chai.request(server).put(url).set('Cookie', authCookie)
                .send({ assets: [{ label: 'Savings', amount: 10_000_000 }], liabilities: [] });
            await chai.request(server).put(url).set('Cookie', authCookie)
                .send({ assets: [{ label: 'Savings', amount: 25_000_000 }], liabilities: [] });

            const snaps = await NetWorthSnapshot.find({ user: userId }).lean();
            expect(snaps).to.have.lengthOf(1);
            expect(snaps[0].netWorth).to.equal(25_000_000);

            // Holdings are replaced wholesale, not merged.
            const stored = await NetWorth.findOne({ user: userId }).lean();
            expect(stored.assets).to.have.lengthOf(1);
            expect(stored.assets[0].amount).to.equal(25_000_000);
        });

        it('keeps one document per (user, yearMonth) — a duplicate insert is rejected', async () => {
            const ym = moment.tz(TZ).format('YYYY-MM');
            await NetWorthSnapshot.create({ user: userId, yearMonth: ym, assets: 1, liabilities: 0, netWorth: 1 });

            let failed = false;
            try {
                await NetWorthSnapshot.create({ user: userId, yearMonth: ym, assets: 2, liabilities: 0, netWorth: 2 });
            } catch (err) {
                failed = true;
                expect(err.code).to.equal(11000);
            }
            expect(failed).to.equal(true);
        });
    });

    describe('GET /api/networth/history', () => {
        it('returns snapshots oldest-first for the trend line', async () => {
            await NetWorthSnapshot.create([
                { user: userId, yearMonth: '2026-06', assets: 10, liabilities: 4, netWorth: 6 },
                { user: userId, yearMonth: '2026-08', assets: 30, liabilities: 5, netWorth: 25 },
                { user: userId, yearMonth: '2026-07', assets: 20, liabilities: 5, netWorth: 15 },
            ]);

            const res = await chai.request(server).get('/api/networth/history').set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.data.history.map(h => h.yearMonth)).to.deep.equal(['2026-06', '2026-07', '2026-08']);
            expect(res.body.data.history[2].netWorth).to.equal(25);
        });

        it('returns the most recent months when limit is smaller than the history', async () => {
            await NetWorthSnapshot.create([
                { user: userId, yearMonth: '2026-05', assets: 1, liabilities: 0, netWorth: 1 },
                { user: userId, yearMonth: '2026-06', assets: 2, liabilities: 0, netWorth: 2 },
                { user: userId, yearMonth: '2026-07', assets: 3, liabilities: 0, netWorth: 3 },
            ]);

            const res = await chai.request(server)
                .get('/api/networth/history?limit=2').set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.data.history.map(h => h.yearMonth)).to.deep.equal(['2026-06', '2026-07']);
        });

        it('returns an empty history for a user with no snapshots', async () => {
            const res = await chai.request(server).get('/api/networth/history').set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.data.history).to.be.an('array').with.lengthOf(0);
        });

        it('never leaks another user\'s snapshots', async () => {
            const other = await User.create({
                name: 'Other', username: 'othernw', email: 'othernw@example.com', password: 'x',
            });
            await NetWorthSnapshot.create({ user: other._id, yearMonth: '2026-07', assets: 999, liabilities: 0, netWorth: 999 });

            const res = await chai.request(server).get('/api/networth/history').set('Cookie', authCookie);

            expect(res).to.have.status(200);
            expect(res.body.data.history).to.have.lengthOf(0);
        });

        it('returns 401 without a session', async () => {
            const res = await chai.request(server).get('/api/networth/history');
            expect(res).to.have.status(401);
        });
    });
});
