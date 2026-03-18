const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Set test environment before requiring app
process.env.NODE_ENV = 'test';

const server = require('../app');

chai.use(chaiHttp);

let mongoServer;

before(async () => {
    // Disconnect from any existing connection
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
});

after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
});

describe('Working Test', () => {
    it('should return welcome message', async () => {
        const res = await chai.request(server)
            .get('/');

        expect(res).to.have.status(200);
        expect(res.body).to.equal('HEHHHH');
    });

    it('should serve Swagger UI', async () => {
        const res = await chai.request(server)
            .get('/api-docs');

        expect(res).to.have.status(200);
        expect(res).to.have.header('content-type', /html/);
    });
});

