const mongoose = require('mongoose');
const { DB_URI: mongoURI } = require('./keys');

const connectDB = async () => {
    return mongoose
      .connect(mongoURI, {
        // Fail fast if mongo is unreachable at startup instead of hanging
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
