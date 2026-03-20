const Sentry = require('@sentry/node');

// Sentry must be initialised before any other imports
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
    });
}

const express = require('express');
const morgan = require('morgan');
require('winston-daily-rotate-file');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const connectDB = require("./config/db");
const logMiddleware = require('./middleware/log');
const {PORT: port, HOST: host, FE_URL} = require("./config/keys");
const logger = require("./helpers/logger");
const { verifyMailer } = require('./helpers/mailer');
// connect database (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

const app = express();

logger.stream = {
    write: function(message, encoding){
        const data = JSON.parse(message);
        return logger.info("accesslog", data);
    }
};

const morganJSONFormat = () => JSON.stringify({
    method: ':method',
    url: ':url',
    http_version: ':http-version',
    remote_addr: ':remote-addr',
    response_time: ':response-time',
    status: ':status',
    content_length: ':res[content-length]',
    user_agent: ':user-agent',
});

// middleware — lock CORS to the frontend origin only
app.use(cors({
  origin: FE_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(helmet());
app.use(morgan(morganJSONFormat(), {
    stream: logger.stream
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// swagger docs (only available if NODE_ENV is not 'production')
if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
app.use(logMiddleware);
// initiate router
const authRoutes = require('./routers/auth');
const transactionRoutes = require('./routers/transaction');
const goalRoutes = require('./routers/goal');
const profileRoutes = require('./routers/profile');
// Routes
app.get("/", (req, res) => res.json("HEHHHH"));
app.use('/api/auth', authRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/goal', goalRoutes);
app.use('/api/profile', profileRoutes);
// views
// app.get('/', (req, res, next) => {
//     res.render('./public/index');
// });

// Sentry error handler — must come after all routes
Sentry.setupExpressErrorHandler(app);

process.on('uncaughtException', (e) => {
    Sentry.captureException(e);
    console.error(e);
    process.exit(10);
});

app.listen(port, () => {
    const baseUrl = `http://${host}:${port}`;
    logger.info(`App started on ${baseUrl}`);
    logger.info(`Swagger UI: ${baseUrl}/api-docs`);
    console.log(`Swagger UI: ${baseUrl}/api-docs`);
    if (process.env.NODE_ENV !== 'test') verifyMailer();
});

module.exports = app; // for testing
