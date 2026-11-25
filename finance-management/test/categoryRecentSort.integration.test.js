const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');

const Category    = require('../models/category.model');
const Transaction = require('../models/transaction.model');
const { drainBackgroundJobs } = require('../helpers/backgroundJobs');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const NAMES = ['rent', 'food', 'transport', 'coffee', 'books', 'gifts'];

const register = async (creds) => {
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ username: creds.username, password: creds.password });
    return { cookie: login.headers['set-cookie'], userId: login.body.data.user.id };
};

const spend = (userId, category, time) => ({
    user: userId, description: category, category, amount: 10_000,
    currency: 'IDR', type: 'expense', time, transaction_timezone: TZ,
});

const listDefault = async (cookie) => {
    const res = await chai.request(server).get('/api/transaction/category?type=expense').set('Cookie', cookie);
    expect(res).to.have.status(200);
    return res.body.data.categories;
};

const listRecent = async (cookie, tz = TZ) => {
    const res = await chai.request(server)
        .get(`/api/transaction/category?type=expense&sort=recent&tz=${encodeURIComponent(tz)}`)
        .set('Cookie', cookie);
    expect(res).to.have.status(200);
    return res.body.data.categories;
};

describe('GET /api/transaction/category?sort=recent', () => {
    let cookie, userId;

    beforeEach(async () => {
        ({ cookie, userId } = await register({
            name: 'Sort User', username: 'sortuser', email: 'sort@example.com', password: 'password123',
        }));
        await drainBackgroundJobs();
        await Category.deleteMany({ user: userId });
        await Category.insertMany(NAMES.map(name => ({ user: userId, name, type: 'expense' })));
    });

    it('puts a recently used category first', async () => {
        await Transaction.create(spend(userId, 'gifts', daysAgo(2)));
        const cats = await listRecent(cookie);
        expect(cats[0]).to.equal('gifts');
    });

    it('ranks a category used today above one used more often before today', async () => {
        await Transaction.insertMany([
            ...Array.from({ length: 5 }, () => spend(userId, 'coffee', daysAgo(1.5))),
            spend(userId, 'books', new Date()),
        ]);
        const cats = await listRecent(cookie);
        expect(cats.slice(0, 2)).to.deep.equal(['books', 'coffee']);
    });

    it('ranks by recency-weighted count before today: three uses last week beat one use two months ago', async () => {
        await Transaction.insertMany([
            spend(userId, 'transport', daysAgo(60)),
            ...Array.from({ length: 3 }, () => spend(userId, 'food', daysAgo(7))),
        ]);
        const cats = await listRecent(cookie);
        expect(cats.slice(0, 2)).to.deep.equal(['food', 'transport']);
    });

    it('ignores use older than 90 days and keeps unused categories in their default order', async () => {
        await Transaction.insertMany([
            spend(userId, 'rent', daysAgo(120)),
            spend(userId, 'coffee', daysAgo(3)),
        ]);
        const unused = (await listDefault(cookie)).filter(c => c !== 'coffee');
        const cats = await listRecent(cookie);
        expect(cats).to.deep.equal(['coffee', ...unused]);
    });

    it('breaks equal scores alphabetically', async () => {
        const t = daysAgo(4);
        await Transaction.insertMany([spend(userId, 'transport', t), spend(userId, 'books', t)]);
        const cats = await listRecent(cookie);
        expect(cats.slice(0, 2)).to.deep.equal(['books', 'transport']);
    });

    it('decides "today" in the requested timezone', async () => {
        const localMidnight = moment.tz(TZ).startOf('day');
        await Transaction.insertMany([
            spend(userId, 'books', localMidnight.clone().add(1, 'minute').toDate()),
            ...Array.from({ length: 3 }, () => spend(userId, 'coffee', localMidnight.clone().subtract(1, 'minute').toDate())),
        ]);
        expect((await listRecent(cookie, TZ))[0]).to.equal('books');
        expect((await listRecent(cookie, 'UTC'))[0]).to.equal('coffee');
    });

    it('counts only transactions of the requested type', async () => {
        await Transaction.create({ ...spend(userId, 'gifts', new Date()), type: 'income' });
        expect(await listRecent(cookie)).to.deep.equal(await listDefault(cookie));
    });

    it("is not affected by another user's transactions", async () => {
        const other = await register({
            name: 'Other User', username: 'otheruser', email: 'other@example.com', password: 'password123',
        });
        await Transaction.insertMany(Array.from({ length: 5 }, () => spend(other.userId, 'gifts', new Date())));
        expect(await listRecent(cookie)).to.deep.equal(await listDefault(cookie));
    });
});
