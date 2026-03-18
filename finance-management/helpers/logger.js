const winston = require('winston');
require('winston-daily-rotate-file');

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
  winston.format.printf(info => {
    const meta = Object.keys(info.metadata).length ? JSON.stringify(info.metadata) : '';
    return `[${info.timestamp}] - {"level": "${info.level}", "message": "${info.message}"${meta ? `, "metadata": ${meta}` : ''}}`;
  })
);


const transportInfoRotate = new winston.transports.DailyRotateFile({
    level: 'info',
    filename: './logs/app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    json: true,
    maxSize: '20m',
    maxFiles: '14d',
    logFormat: logFormat
  });

transportInfoRotate.on('rotate', function(oldFilename, newFilename) {
    // do something fun
});

const logger = winston.createLogger({
    format: logFormat,
    transports: [
        transportInfoRotate,
        new winston.transports.Console({
            level: 'info'
        }),
        new winston.transports.File({
            filename: './logs/error.log', level: 'error',
            json: true,
            handleExceptions: true,

        }),
    ]
});

module.exports = logger;
