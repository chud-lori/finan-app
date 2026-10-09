const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');

const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');

chai.use(chaiHttp);

const register = async (suffix) => {
    const creds = { name: `Hard ${suffix}`, username: `hard${suffix}`, email: `hard${suffix}@example.com`, password: 'password123' };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server).post('/api/auth/login').send({ identifier: creds.email, password: creds.password });
    return { cookie: login.headers['set-cookie'], email: creds.email };
};

describe('Input hardening', () => {
    describe('CSV export — formula injection', () => {
        it('prefixes a description that starts with a formula character', async () => {
            const { cookie } = await register('csv');
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
            const { cookie } = await register('nosql');
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
            const { cookie } = await register('nosqlcat');
            const res = await chai.request(server)
                .get('/api/transaction/category?search[$ne]=x')
                .set('Cookie', cookie);
            expect(res).to.have.status(200);
        });
    });

    describe('transaction_timezone validation', () => {
        const hostileTz = '=cmd|\' /C calc\'!A1';

        it('rejects an unknown zone on add and stores nothing', async () => {
            const { cookie, email } = await register('tzadd');
            const res = await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
                description: 'Lunch', amount: 25000, category: 'food', type: 'expense',
                time: '2026-08-01 10:00:00', currency: 'idr', transaction_timezone: hostileTz,
            });

            expect(res).to.have.status(400);
            const user = await User.findOne({ email }).lean();
            expect(await Transaction.countDocuments({ user: user._id })).to.equal(0);
        });

        it('still accepts a real zone on add', async () => {
            const { cookie } = await register('tzok');
            const res = await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
                description: 'Lunch', amount: 25000, category: 'food', type: 'expense',
                time: '2026-08-01 10:00:00', currency: 'idr', transaction_timezone: 'Asia/Jakarta',
            });

            expect(res).to.have.status(201);
            expect(res.body.data.transaction.transaction_timezone).to.equal('Asia/Jakarta');
        });

        it('rejects an unknown userTimezone on CSV import', async () => {
            const { cookie, email } = await register('tzimp');
            const csv = [
                'description,amount,category,type,time',
                'Lunch,100000,food,expense,2026-08-01 10:00:00',
            ].join('\n');

            const res = await chai.request(server)
                .post('/api/transaction/import/csv')
                .set('Cookie', cookie)
                .field('userTimezone', hostileTz)
                .attach('files', Buffer.from(csv), 'import.csv');

            expect(res).to.have.status(400);
            const user = await User.findOne({ email }).lean();
            expect(await Transaction.countDocuments({ user: user._id })).to.equal(0);
        });

        it('still imports with a real userTimezone', async () => {
            const { cookie, email } = await register('tzimpok');
            const csv = [
                'description,amount,category,type,time',
                'Lunch,100000,food,expense,2026-08-01 10:00:00',
            ].join('\n');

            const res = await chai.request(server)
                .post('/api/transaction/import/csv')
                .set('Cookie', cookie)
                .field('userTimezone', 'Asia/Jakarta')
                .attach('files', Buffer.from(csv), 'import.csv');

            expect(res).to.have.status(200);
            const user = await User.findOne({ email }).lean();
            const saved = await Transaction.find({ user: user._id }).lean();
            expect(saved).to.have.lengthOf(1);
            expect(saved[0].transaction_timezone).to.equal('Asia/Jakarta');
        });

        it('exports a timezone stored before the check as inert text', async () => {
            const { cookie, email } = await register('tzexport');
            const user = await User.findOne({ email }).lean();
            await Transaction.create({
                user: user._id, description: 'Lunch', amount: 25000, category: 'food',
                type: 'expense', currency: 'idr', time: new Date('2026-08-01T03:00:00Z'),
                transaction_timezone: hostileTz,
            });

            const res = await chai.request(server)
                .get('/api/profile/export?period=all')
                .set('Cookie', cookie);

            expect(res).to.have.status(200);
            expect(res.text).to.contain(`"'${hostileTz}"`);
            expect(res.text).to.not.contain(',=cmd');
            expect(res.text).to.not.match(/^=cmd/m);
        });

        it('keeps a hostile period value out of the Content-Disposition filename', async () => {
            const { cookie } = await register('tzfile');
            const res = await chai.request(server)
                .get('/api/profile/export?period=monthly&month=2026-08"%3B%20drop')
                .set('Cookie', cookie);

            expect(res).to.have.status(200);
            expect(res.headers['content-disposition']).to.equal('attachment; filename="finan-app-transactions-2026-08drop.csv"');
        });
    });
});
