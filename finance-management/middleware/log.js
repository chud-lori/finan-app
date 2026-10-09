const logger = require('../helpers/logger');
const { redactUrl } = require('../helpers/redactUrl');

const logMiddleware = (req, res, next) => {
  const startHrTime = process.hrtime();

  res.on('finish', () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedTimeInMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;
    const url = redactUrl(req.originalUrl);

    logger.info(`HTTP ${req.method} ${url} ${res.statusCode} - ${elapsedTimeInMs.toFixed(3)} ms`, {
      metadata: {
        method: req.method,
        url,
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
