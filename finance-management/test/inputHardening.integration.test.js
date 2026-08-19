const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');

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
});
