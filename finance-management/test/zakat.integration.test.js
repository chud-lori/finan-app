const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');

const User        = require('../models/user.model');
const Category    = require('../models/category.model');
const Transaction = require('../models/transaction.model');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';

const register = async (creds) => {
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ username: creds.username, password: creds.password });
    return { cookie: login.headers['set-cookie'], userId: login.body.data.user.id };
};

describe('Zakat Integration Tests', () => {
    let authCookie, userId;

    beforeEach(async () => {
        ({ cookie: authCookie, userId } = await register({
            name: 'Zakat User', username: 'zakatuser', email: 'zakat@example.com', password: 'password123',
        }));
    });

    it('estimates 2.5% of the zakatable base from saved net-worth holdings', async () => {
        await chai.request(server).put('/api/networth').set('Cookie', authCookie).send({
            assets: [
                { label: 'Savings',      amount: 50_000_000, type: 'cash' },
                { label: 'Mutual funds', amount: 30_000_000, type: 'investment' },
                { label: 'House',        amount: 800_000_000, type: 'property' }, // excluded
            ],
            liabilities: [
                { label: 'Card', amount: 5_000_000, type: 'credit_card' },
            ],
        });

        const res = await chai.request(server)
            .get('/api/recommendations/zakat?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

        expect(res).to.have.status(200);
        expect(res.body.data.hasHoldings).to.equal(true);
        expect(res.body.data.zakatableAssets).to.equal(80_000_000); // cash + investment, not the house
        expect(res.body.data.deductibleDebts).to.equal(5_000_000);
        expect(res.body.data.zakatableBase).to.equal(75_000_000);
        expect(res.body.data.zakatDue).to.equal(1_875_000);         // 2.5% of 75,000,000
    });

    it('counts this year\'s social-group giving toward the estimate', async () => {
        await chai.request(server).put('/api/networth').set('Cookie', authCookie).send({
            assets: [{ label: 'Cash', amount: 40_000_000, type: 'cash' }],
            liabilities: [],
        });
        // A giving category grouped as social, with two donations this year.
        await Category.create({ user: userId, name: 'zakat', type: 'expense', group: 'social' });
        await Transaction.insertMany([
            { user: userId, description: 'zakat', category: 'zakat', amount: 300_000, currency: 'IDR', type: 'expense', time: new Date(), transaction_timezone: TZ },
            { user: userId, description: 'donation', category: 'zakat', amount: 200_000, currency: 'IDR', type: 'expense', time: new Date(), transaction_timezone: TZ },
        ]);

        const res = await chai.request(server)
            .get('/api/recommendations/zakat?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

        expect(res.body.data.zakatDue).to.equal(1_000_000); // 2.5% of 40,000,000
        expect(res.body.data.givingYtd).to.equal(500_000);
        expect(res.body.data.remaining).to.equal(500_000);
        expect(res.body.data.coverage).to.equal(50);
        expect(res.body.data.socialCategories).to.include('zakat');
    });

    it('returns zero due below an explicit nisab', async () => {
        await chai.request(server).put('/api/networth').set('Cookie', authCookie).send({
            assets: [{ label: 'Cash', amount: 10_000_000, type: 'cash' }],
            liabilities: [],
        });

        const res = await chai.request(server)
            .get('/api/recommendations/zakat?nisab=85000000&tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

        expect(res.body.data.meetsNisab).to.equal(false);
        expect(res.body.data.zakatDue).to.equal(0);
        expect(res.body.data.nisab).to.equal(85_000_000);
    });

    it('reports hasHoldings=false for a user who has never saved holdings', async () => {
        const res = await chai.request(server)
            .get('/api/recommendations/zakat?tz=' + encodeURIComponent(TZ)).set('Cookie', authCookie);

        expect(res).to.have.status(200);
        expect(res.body.data.hasHoldings).to.equal(false);
        expect(res.body.data.zakatDue).to.equal(0);
    });

    it('returns 401 without a session', async () => {
        const res = await chai.request(server).get('/api/recommendations/zakat');
        expect(res).to.have.status(401);
    });
});
