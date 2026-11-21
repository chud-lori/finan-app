// One listening server for the whole suite. chai.request() binds a fresh
// listener for every request when handed a bare Express app, and a request
// landing on one still closing came back as a socket hang up, an ECONNRESET,
// or an empty-bodied 404. setup.js listens before the first test and closes
// after the last.
const http = require('http');
const app = require('../app');

module.exports = http.createServer(app);
