// Load test env vars before anything else (dotenv won't overwrite already-set vars)
require('dotenv').config({ path: __dirname + '/test.env' });

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { drainBackgroundJobs } = require('../helpers/backgroundJobs');

let mongoServer;

const setupTestDB = async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
};

const teardownTestDB = async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
};

const cleanupCollections = async () => {
    // listCollections, NOT `connection.collections` — the latter misses anything Mongoose hasn't registered.
    const cols = await mongoose.connection.db.listCollections().toArray();
    await Promise.all(cols.map(c => mongoose.connection.db.collection(c.name).deleteMany({})));
};

before(async () => {
    await setupTestDB();
});

afterEach(async () => {
    // Let fire-and-forget writes settle BEFORE truncating, or a straggler contaminates the next test.
    await drainBackgroundJobs();
    await cleanupCollections();
});

after(async () => {
    await teardownTestDB();
});

module.exports = {
    setupTestDB,
    teardownTestDB,
    cleanupCollections
};
