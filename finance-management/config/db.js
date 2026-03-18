const mongoose = require('mongoose');
const { DB_URI: mongoURI } = require('./keys');

const connectDB = async () => {
    return mongoose
      .connect(mongoURI)
      .then((response) => console.log(`Mongo connected on ${response.connection.host} db: ${response.connection.name}`))
      .catch((error) => {
        console.error(`Mongo error: ${error}`);
        // process.exit(1);
      });
  };


module.exports = connectDB;
