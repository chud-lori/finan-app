const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');

chai.use(chaiHttp);

describe('App Integration Tests', () => {
    describe('GET /', () => {
        it('should return welcome message', async () => {
            const res = await chai.request(server)
                .get('/');

            expect(res).to.have.status(200);
            expect(res.body).to.equal('HEHHHH');
        });
    });

    describe('Health endpoints', () => {
        it('should report liveness without checking dependencies', async () => {
            const res = await chai.request(server)
                .get('/health');

            expect(res).to.have.status(200);
            expect(res.body).to.deep.include({ status: 1, message: 'alive' });
        });

        it('should report database readiness', async () => {
            const res = await chai.request(server)
                .get('/ready');

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body.data).to.have.property('db', 'connected');
        });
    });

    describe('GET /api-docs', () => {
        it('should serve Swagger UI', async () => {
            const res = await chai.request(server)
                .get('/api-docs/')
                .redirects(0);

            expect(res).to.have.status(200);
            expect(res).to.have.header('content-type', /html/);
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            const res = await chai.request(server)
                .get('/api/non-existent');

            expect(res).to.have.status(404);
        });

        it('should handle malformed JSON in request body', async () => {
            const res = await chai.request(server)
                .post('/api/auth/register')
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}');

            expect(res).to.have.status(400);
        });
    });

    describe('CORS Headers', () => {
        it('should include CORS headers', async () => {
            const res = await chai.request(server)
                .get('/');

            expect(res).to.have.header('access-control-allow-origin');
        });
    });

    describe('Security Headers', () => {
        it('should include security headers from helmet', async () => {
            const res = await chai.request(server)
                .get('/');

            expect(res).to.have.header('x-content-type-options');
            expect(res).to.have.header('x-frame-options');
        });
    });

    describe('CSRF Guard', () => {
        it('should block explicit cross-site unsafe requests', async () => {
            const res = await chai.request(server)
                .post('/api/auth/register')
                .set('Sec-Fetch-Site', 'cross-site')
                .send({});

            expect(res).to.have.status(403);
            expect(res.body).to.have.property('message', 'Cross-site request blocked');
        });

        it('should block unsafe requests with an untrusted origin', async () => {
            const res = await chai.request(server)
                .post('/api/auth/register')
                .set('Origin', 'https://evil.example')
                .send({});

            expect(res).to.have.status(403);
            expect(res.body).to.have.property('message', 'Invalid request origin');
        });
    });

    describe('Transaction route order', () => {
        it('should match specific date routes before the optional type route', async () => {
            const user = {
                name: 'Route Order User',
                username: 'routeorder',
                email: 'routeorder@example.com',
                password: 'password123',
            };

            await chai.request(server)
                .post('/api/auth/register')
                .send(user);

            const loginRes = await chai.request(server)
                .post('/api/auth/login')
                .send({ username: user.username, password: user.password });

            const res = await chai.request(server)
                .get('/api/transaction/date/2025-01-15')
                .set('Cookie', loginRes.headers['set-cookie']);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('message', 'Transactions at 2025-01-15');
        });
    });
});
