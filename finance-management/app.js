const Sentry = require('@sentry/node');

// Sentry must be initialised before any other imports.
// @sentry/node v8+ uses OpenTelemetry internally — Sentry.init() sets up the
// OTel SDK and registers Sentry as the exporter automatically.
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    // Strip credentials and PII from request bodies before they leave the process.
    // Sentry's default scrubber covers obvious keys like "password" but not "email"
    // or "identifier", both of which the login/register/forgot-password handlers
    // accept and which we don't want sitting in error reports.
    const SCRUB_KEYS = new Set([
        'password', 'newpassword', 'currentpassword',
        'token', 'tokenhash', 'secret',
        'email', 'identifier',
        // Gmail OAuth flow — never let grant material reach Sentry
        'code', 'state', 'refresh_token', 'access_token', 'refreshtokenenc',
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
        // Sample 20% of transactions for performance/tracing data
        tracesSampleRate: 0.2,
        integrations: [
            // Instruments Express routes → spans show named routes (e.g. GET /api/transaction/:id)
            Sentry.expressIntegration(),
            // Instruments Mongoose queries → spans show collection + operation
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
const {PORT: port, HOST: host, FE_URL} = require("./config/keys");
const logger = require("./helpers/logger");
const { verifyMailer } = require('./helpers/mailer');
// connect database (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

const app = express();

// Trust the first reverse-proxy hop (nginx in prod). Without this, req.ip is
// the proxy address and the per-IP rate limiter buckets every request under a
// single key, defeating brute-force protection. Single hop = "1".
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

// middleware — lock CORS to the frontend origin only
app.use(cors({
    origin:      FE_URL,
    credentials: true,   // required for HttpOnly cookie to be sent cross-origin
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));
app.use(cookieParser());
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
// JSON-only body parser. We intentionally do NOT mount express.urlencoded():
// cross-site <form> POSTs (the only kind of CSRF that bypasses CORS preflight)
// would be parsed if urlencoded were enabled. With JSON-only, any CSRF attempt
// triggers a CORS preflight that gets rejected by the origin allow-list above.
app.use(express.json({ limit: '100kb' }));

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
const recommendationRoutes = require('./routers/recommendation');
const categoryRoutes = require('./routers/category');
const emailIngestRoutes = require('./routers/emailIngest');
// Routes
app.get("/", (req, res) => res.json("HEHHHH"));
app.use('/api/auth', authRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/goal', goalRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/email-ingest', emailIngestRoutes);
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
    if (process.env.NODE_ENV !== 'test') {
        verifyMailer();
        // Email ingestion transports — each is a no-op unless its env vars are set
        const { startEmailIngestPoller } = require('./services/emailIngest/imapPoller');
        startEmailIngestPoller();
        const { startGmailIngestPoller } = require('./services/emailIngest/gmailSync');
        startGmailIngestPoller();
    }
});

module.exports = app; // for testing
