// Load test env vars before anything else (dotenv won't overwrite already-set vars)
require('dotenv').config({ path: __dirname + '/test.env' });

// Test setup utilities
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
    // Clear every collection that actually exists in the database, read from the
    // server via listCollections — NOT `connection.collections`, which only holds
    // collections Mongoose has already registered. That gap let documents (a
    // `testuser`) survive into the next test, whose register then 409s and breaks
    // the follow-up login. Deleting rather than dropping keeps indexes intact so
    // unique-constraint tests still behave.
    const cols = await mongoose.connection.db.listCollections().toArray();
    await Promise.all(cols.map(c => mongoose.connection.db.collection(c.name).deleteMany({})));
};

// Register as global Mocha hooks — runs for every test file
before(async () => {
    await setupTestDB();
});

afterEach(async () => {
    // Wait for fire-and-forget writes (snapshot deltas, ML-cache invalidation,
    // streak/activity updates, category seeding/classification) kicked off by the
    // just-finished test to settle BEFORE truncating. Otherwise a straggler lands
    // mid-cleanup or during the next test's setup and contaminates it — the source
    // of the suite's intermittent failures.
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
