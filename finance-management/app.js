const Sentry = require('@sentry/node');

// Sentry must be initialised before any other imports.
// @sentry/node v8+ uses OpenTelemetry internally — Sentry.init() sets up the
// OTel SDK and registers Sentry as the exporter automatically.
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        // Sample 20% of transactions for performance/tracing data
        tracesSampleRate: 0.2,
        integrations: [
            // Instruments Express routes → spans show named routes (e.g. GET /api/transaction/:id)
            Sentry.expressIntegration(),
            // Instruments Mongoose queries → spans show collection + operation
            Sentry.mongooseIntegration(),
        ],
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
app.use(helmet({
  // API-only server — no HTML is rendered, so CSP is not useful here.
  // HSTS is handled by the nginx reverse proxy in front of this service.
  contentSecurityPolicy: false,
  // Allow cross-origin fetch from the frontend domain (set by CORS above)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(morgan(morganJSONFormat(), {
    stream: logger.stream
}));
// Cap JSON and URL-encoded body size to prevent memory exhaustion from large payloads
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

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
const gamificationRoutes = require('./routers/gamification');
// Routes
app.get("/", (req, res) => res.json("HEHHHH"));
app.use('/api/auth', authRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/goal', goalRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/gamification', gamificationRoutes);
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
