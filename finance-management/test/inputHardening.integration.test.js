const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const Category = require('../models/category.model');
const User = require('../models/user.model');

chai.use(chaiHttp);

const register = async (suffix) => {
    const creds = { name: `Hard ${suffix}`, username: `hard${suffix}`, email: `hard${suffix}@example.com`, password: 'password123' };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server).post('/api/auth/login').send({ identifier: creds.email, password: creds.password });
    return login.headers['set-cookie'];
};

describe('Input hardening', () => {
    describe('CSV export — formula injection', () => {
        it('prefixes a description that starts with a formula character', async () => {
            const cookie = await register('csv');
            await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
                description: '=HYPERLINK("http://evil","click")', amount: 1000, category: 'food', type: 'expense',
                time: '2026-08-01 10:00:00', currency: 'idr', transaction_timezone: 'Asia/Jakarta',
            });

            const res = await chai.request(server)
                .get('/api/profile/export?period=all')
                .set('Cookie', cookie);

            expect(res).to.have.status(200);
            const body = res.text;
            // Must be neutralised with a leading single quote — no cell may begin with "=HYPERLINK".
            expect(body).to.contain('"\'=HYPERLINK');
            expect(body).to.not.contain(',=HYPERLINK');
            expect(body).to.not.match(/^=HYPERLINK/m);
        });
    });

    describe('Query params — NoSQL operator objects', () => {
        it('does not 500 when a filter param is an object, and returns results', async () => {
            const cookie = await register('nosql');
            await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
                description: 'Lunch', amount: 25000, category: 'food', type: 'expense',
                time: '2026-08-01 10:00:00', currency: 'idr', transaction_timezone: 'Asia/Jakarta',
            });

            // qs parses category[$ne]=x into { category: { $ne: 'x' } }.
            const res = await chai.request(server)
                .get('/api/transaction?category[$ne]=x&search[$gt]=')
                .set('Cookie', cookie);

            expect(res).to.have.status(200);
            expect(res.body.data.transactions).to.be.an('array');
            // The object params are ignored, not run as operators — the real tx is returned.
            expect(res.body.data.transactions.some(t => t.description === 'Lunch')).to.equal(true);
        });

        it('does not 500 on an object search param to the category list', async () => {
            const cookie = await register('nosqlcat');
            const res = await chai.request(server)
                .get('/api/transaction/category?search[$ne]=x')
                .set('Cookie', cookie);
            expect(res).to.have.status(200);
        });
    });

    describe('String length caps', () => {
        const txn = (overrides) => ({
            description: 'Lunch', amount: 25000, category: 'food', type: 'expense',
            time: '2026-08-01 10:00:00', currency: 'idr', transaction_timezone: 'Asia/Jakarta',
            ...overrides,
        });

        it('rejects a registration name longer than 100 characters', async () => {
            const res = await chai.request(server).post('/api/auth/register').send({
                name: 'a'.repeat(101), username: 'longname', email: 'longname@example.com', password: 'password123',
            });
            expect(res).to.have.status(400);
            expect(res.body.error.join(' ')).to.contain('100 characters or fewer');
            expect(await User.countDocuments({ username: 'longname' })).to.equal(0);
        });

        it('accepts a registration name at the 100 character limit', async () => {
            const res = await chai.request(server).post('/api/auth/register').send({
                name: 'a'.repeat(100), username: 'okname', email: 'okname@example.com', password: 'password123',
            });
            expect(res).to.have.status(201);
        });

        it('rejects a transaction description longer than 500 characters', async () => {
            const cookie = await register('desc');
            const res = await chai.request(server).post('/api/transaction').set('Cookie', cookie)
                .send(txn({ description: 'a'.repeat(501) }));
            expect(res).to.have.status(400);
            expect(res.body.error.join(' ')).to.contain('500 characters or fewer');
        });

        it('rejects a transaction category longer than 100 characters', async () => {
            const cookie = await register('cat');
            const res = await chai.request(server).post('/api/transaction').set('Cookie', cookie)
                .send(txn({ category: 'a'.repeat(101) }));
            expect(res).to.have.status(400);
            expect(res.body.error.join(' ')).to.contain('100 characters or fewer');
            expect(await Category.countDocuments({ name: 'a'.repeat(101) })).to.equal(0);
        });

        it('accepts a transaction at both limits', async () => {
            const cookie = await register('limit');
            const res = await chai.request(server).post('/api/transaction').set('Cookie', cookie)
                .send(txn({ description: 'a'.repeat(500), category: 'a'.repeat(100) }));
            expect(res).to.have.status(201);
        });

        it('rejects an over-long description on patch, where schema validators do not run', async () => {
            const cookie = await register('patch');
            const added = await chai.request(server).post('/api/transaction').set('Cookie', cookie).send(txn({}));
            const id = added.body.data.transaction.id;

            const rejected = await chai.request(server).patch(`/api/transaction/${id}`).set('Cookie', cookie)
                .send({ description: 'a'.repeat(501) });
            expect(rejected).to.have.status(400);
            expect(rejected.body.message).to.contain('500 characters or fewer');

            const accepted = await chai.request(server).patch(`/api/transaction/${id}`).set('Cookie', cookie)
                .send({ description: 'Dinner' });
            expect(accepted).to.have.status(200);
            expect(accepted.body.data.transaction.description).to.equal('Dinner');
        });

        it('rejects an over-long category name at the schema', async () => {
            const user = await User.create({ name: 'Cap', username: 'capuser', email: 'cap@example.com', password: 'x' });
            const err = await Category.create({ user: user._id, name: 'a'.repeat(101), type: 'expense' })
                .then(() => null, e => e);

            expect(err && err.name).to.equal('ValidationError');
        });
    });
});
