/**
 * In-process sliding-window rate limiter. No external dependencies.
 *
 * Suitable for single-server deployments.
 * Scaling path: replace with an express-rate-limit + Redis store when
 * running multiple instances.
 *
 * Usage:
 *   const limiter = require('./rateLimit');
 *
 *   // 10 req/min per IP (unauthenticated, e.g. login/register)
 *   router.post('/login', limiter.byIp(10), loginUser);
 *
 *   // 60 req/min per authenticated user
 *   router.get('/analytics', authenticateJWT, limiter.byUser(60), getAnalytics);
 */

const WINDOW_MS = 60 * 1000; // 1 minute

class RateLimiter {
    constructor() {
        this._buckets = new Map(); // key -> [timestamp, ...]
        setInterval(() => this._sweep(), WINDOW_MS).unref();
    }

    _hit(key) {
        const now = Date.now();
        const cutoff = now - WINDOW_MS;
        const prev = (this._buckets.get(key) || []).filter(t => t > cutoff);
        prev.push(now);
        this._buckets.set(key, prev);
        return prev.length;
    }

    _middleware(max, keyFn) {
        // Rate limiting is a no-op in test environment so integration tests
        // can run repeated requests without tripping the limiter.
        if (process.env.NODE_ENV === 'test') {
            return (_req, _res, next) => next();
        }
        return (req, res, next) => {
            const key = keyFn(req);
            const count = this._hit(key);
            if (count > max) {
                return res.status(429).json({
                    status: 0,
                    message: `Too many requests — try again in a minute (limit: ${max}/min)`,
                });
            }
            next();
        };
    }

    /** Rate limit by IP address. Use for unauthenticated endpoints. */
    byIp(max) {
        return this._middleware(max, (req) => `ip:${req.ip}`);
    }

    /** Rate limit by authenticated user ID. Use after authenticateJWT. */
    byUser(max) {
        return this._middleware(max, (req) => `user:${req.user?.id ?? req.ip}`);
    }

    _sweep() {
        const cutoff = Date.now() - WINDOW_MS;
        for (const [key, hits] of this._buckets.entries()) {
            const recent = hits.filter(t => t > cutoff);
            if (recent.length === 0) this._buckets.delete(key);
            else this._buckets.set(key, recent);
        }
    }
}

module.exports = new RateLimiter();
