const Sentry = require('@sentry/node');

// Sentry must be initialised before any other import.
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    // Sentry's own scrubber misses "email"/"identifier" — add any new auth-style body field here.
    const SCRUB_KEYS = new Set([
        'password', 'newpassword', 'currentpassword',
        'token', 'tokenhash', 'secret',
        'email', 'identifier',
    ]);
    const scrub = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        for (const k of Object.keys(obj)) {
            if (SCRUB_KEYS.has(k.toLowerCase())) obj[k] = '[redacted]';
            else if (typeof obj[k] === 'object') scrub(obj[k]);
        }
        return obj;
    };
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.2,
        integrations: [
            Sentry.expressIntegration(),
            Sentry.mongooseIntegration(),
        ],
        beforeSend(event) {
            if (event.request) {
                if (event.request.headers) {
                    delete event.request.headers.authorization;
                    delete event.request.headers.cookie;
                    delete event.request.headers['set-cookie'];
                }
                if (event.request.data) scrub(event.request.data);
                if (event.request.query_string) scrub(event.request.query_string);
            }
            if (event.user) {
                delete event.user.email;
                delete event.user.ip_address;
            }
            return event;
        },
    });
}

const express = require('express');
const morgan = require('morgan');
require('winston-daily-rotate-file');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const connectDB = require("./config/db");
const logMiddleware = require('./middleware/log');
const csrfGuard = require('./middleware/csrfGuard');
const {PORT: port, HOST: host, FE_URL} = require("./config/keys");
const logger = require("./helpers/logger");
const { verifyMailer } = require('./helpers/mailer');
const mongoose = require('mongoose');

const app = express();

// Without this req.ip is nginx's address and the per-IP rate limiter buckets everyone under one key.
app.set('trust proxy', 1);

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

app.use(cors({
    origin:      FE_URL,
    credentials: true,   // required for HttpOnly cookie to be sent cross-origin
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));
app.use(cookieParser());
app.use(csrfGuard);
app.use(helmet({
  // API-only, no HTML rendered; HSTS is handled by the nginx proxy in front.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(morgan(morganJSONFormat(), {
    stream: logger.stream
}));
// Do NOT mount express.urlencoded() — JSON-only is what forces cross-site form POSTs into a rejected preflight.
app.use(express.json({ limit: '100kb' }));

if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
app.use(logMiddleware);
const authRoutes = require('./routers/auth');
const transactionRoutes = require('./routers/transaction');
const goalRoutes = require('./routers/goal');
const profileRoutes = require('./routers/profile');
const gamificationRoutes = require('./routers/gamification');
const recommendationRoutes = require('./routers/recommendation');
const categoryRoutes = require('./routers/category');
const netWorthRoutes = require('./routers/netWorth');
const groupBudgetRoutes = require('./routers/groupBudget');
// Routes
app.get("/", (req, res) => res.json("HEHHHH"));
app.get('/health', (_req, res) => {
    res.json({ status: 1, message: 'alive' });
});
app.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({
        status: ready ? 1 : 0,
        message: ready ? 'ready' : 'database not ready',
        data: {
            db: ready ? 'connected' : 'disconnected',
        },
    });
});
app.use('/api/auth', authRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/goal', goalRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/networth', netWorthRoutes);
app.use('/api/group-budget', groupBudgetRoutes);

// Must come after all routes.
Sentry.setupExpressErrorHandler(app);

process.on('uncaughtException', (e) => {
    Sentry.captureException(e);
    console.error(e);
    process.exit(10);
});

const start = async () => {
    if (process.env.NODE_ENV !== 'test') {
        await connectDB();
    }

    return app.listen(port, () => {
        const baseUrl = `http://${host}:${port}`;
        logger.info(`App started on ${baseUrl}`);
        logger.info(`Swagger UI: ${baseUrl}/api-docs`);
        console.log(`Swagger UI: ${baseUrl}/api-docs`);
        if (process.env.NODE_ENV !== 'test') verifyMailer();
    });
};

if (require.main === module) {
    start().catch((error) => {
        logger.error(`Startup failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = app; // for testing
module.exports.start = start;
