const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const { setupTestDB, teardownTestDB, cleanupCollections } = require('./setup');

chai.use(chaiHttp);

before(async () => {
    await setupTestDB();
});

after(async () => {
    await teardownTestDB();
});

afterEach(async () => {
    await cleanupCollections();
});

describe('App Integration Tests', () => {
    describe('GET /', () => {
        it('should return welcome message', async () => {
            const res = await chai.request(server)
                .get('/');

            expect(res).to.have.status(200);
            expect(res.body).to.equal('HEHHHH');
        });
    });

    describe('GET /api-docs', () => {
        it('should serve Swagger UI', async () => {
            const res = await chai.request(server)
                .get('/api-docs');

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
});
