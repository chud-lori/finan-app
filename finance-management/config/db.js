const mongoose = require('mongoose');
const { DB_URI: mongoURI } = require('./keys');

const connectDB = async () => {
    return mongoose
      .connect(mongoURI, {
        // Keep connection pool small — this is a low-traffic single-server app
        // Default maxPoolSize is 100 which would waste sockets on a small VPS
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      })
      .then(async (response) => {
        console.log(`Mongo connected on ${response.connection.host} db: ${response.connection.name}`);
        // Run idempotent index migrations (see helpers/migrateTokenIndexes.js).
        // Lazy-required here to avoid a circular import if logger transitively
        // pulls in any model at module load.
        try {
          const { migrateTokenIndexes } = require('../helpers/migrateTokenIndexes');
          await migrateTokenIndexes();
        } catch (err) {
          console.error(`Index migration error: ${err && err.message}`);
        }
      })
      .catch((error) => {
        console.error(`Mongo error: ${error}`);
        // process.exit(1);
      });
  };


module.exports = connectDB;
