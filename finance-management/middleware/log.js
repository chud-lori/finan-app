// logMiddleware.js
const logger = require('../helpers/logger'); // Your existing logger

const logMiddleware = (req, res, next) => {
  const startHrTime = process.hrtime();

  res.on('finish', () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedTimeInMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;

    logger.info(`HTTP ${req.method} ${req.originalUrl} ${res.statusCode} - ${elapsedTimeInMs.toFixed(3)} ms`, {
      metadata: {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTimeMs: elapsedTimeInMs,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    });
  });

  next();
};

module.exports = logMiddleware;
