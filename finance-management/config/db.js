const mongoose = require('mongoose');
const { DB_URI: mongoURI } = require('./keys');

const connectDB = async () => {
    try {
      const response = await mongoose.connect(mongoURI, {
        // Small pool on purpose — the default maxPoolSize of 100 wastes sockets on a small VPS
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });

      console.log(`Mongo connected on ${response.connection.host} db: ${response.connection.name}`);
      // Lazy-required to avoid a circular import at module load.
      try {
        const { migrateTokenIndexes } = require('../helpers/migrateTokenIndexes');
        await migrateTokenIndexes();
      } catch (err) {
        console.error(`Index migration error: ${err && err.message}`);
      }
      try {
        const { migrateGoalKinds } = require('../helpers/migrateGoalKinds');
        await migrateGoalKinds();
      } catch (err) {
        console.error(`Goal kind migration error: ${err && err.message}`);
      }
      return response;
    } catch (error) {
      console.error(`Mongo error: ${error}`);
      throw error;
    }
  };


module.exports = connectDB;
