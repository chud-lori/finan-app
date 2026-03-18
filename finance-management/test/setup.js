// Load test env vars before anything else (dotenv won't overwrite already-set vars)
require('dotenv').config({ path: __dirname + '/test.env' });

// Test setup utilities
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

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
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
};

// Register as global Mocha hooks — runs for every test file
before(async () => {
    await setupTestDB();
});

afterEach(async () => {
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
