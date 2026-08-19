// In-process sliding window — per-instance only, so it does not hold across multiple servers.

const WINDOW_MS = 60 * 1000; // 1 minute — default window for byIp/byUser
// Retention must exceed the longest window any check() caller uses (currently 10 min).
const SWEEP_RETENTION_MS = 60 * 60 * 1000; // 1 hour — generous headroom

class RateLimiter {
    constructor() {
        this._buckets = new Map(); // key -> [timestamp, ...]
        setInterval(() => this._sweep(), WINDOW_MS).unref();
    }

    _hit(key, windowMs = WINDOW_MS) {
        const now = Date.now();
        const cutoff = now - windowMs;
        const prev = (this._buckets.get(key) || []).filter(t => t > cutoff);
        prev.push(now);
        this._buckets.set(key, prev);
        return prev.length;
    }

    _middleware(max, keyFn) {
        // No-op in test env so integration tests can hammer endpoints.
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

    byIp(max) {
        return this._middleware(max, (req) => `ip:${req.ip}`);
    }

    byUser(max) {
        return this._middleware(max, (req) => `user:${req.user?.id ?? req.ip}`);
    }

    // For limiting on a parsed body field, which middleware can't see. True = allowed.
    check(key, max, windowMs) {
        if (process.env.NODE_ENV === 'test') return true;
        return this._hit(key, windowMs) <= max;
    }

    _sweep() {
        const cutoff = Date.now() - SWEEP_RETENTION_MS;
        for (const [key, hits] of this._buckets.entries()) {
            const recent = hits.filter(t => t > cutoff);
            if (recent.length === 0) this._buckets.delete(key);
            else this._buckets.set(key, recent);
        }
    }
}

module.exports = new RateLimiter();
