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

describe('Simple Test', () => {
    it('should return welcome message', async () => {
        const res = await chai.request(server)
            .get('/');

        expect(res).to.have.status(200);
        expect(res.body).to.equal('HEHHHH');
    });
});

