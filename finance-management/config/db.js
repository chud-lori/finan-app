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
      .then((response) => console.log(`Mongo connected on ${response.connection.host} db: ${response.connection.name}`))
      .catch((error) => {
        console.error(`Mongo error: ${error}`);
        // process.exit(1);
      });
  };


module.exports = connectDB;
