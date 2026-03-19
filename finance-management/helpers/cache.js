/**
 * In-process per-user analytics cache with TTL.
 *
 * Why in-process, not Redis?
 *   - This is a single-server deployment. Redis would add ops overhead for no gain.
 *   - Analytics data changes only when transactions are mutated (add / delete / import).
 *   - A 5-minute TTL gives a tight freshness guarantee even without explicit invalidation.
 *   - If the server restarts the cache is cold — that is fine, MongoDB is the source of truth.
 *
 * Scaling path: swap this module for a Redis-backed equivalent with the same API
 * when running multiple instances behind a load balancer.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

class AnalyticsCache {
    constructor(ttlMs = DEFAULT_TTL_MS) {
        this._store = new Map(); // key -> { value, expiresAt }
        this._ttl = ttlMs;
        // Sweep expired entries periodically to prevent unbounded memory growth.
        setInterval(() => this._sweep(), ttlMs).unref();
    }

    _key(userId, endpoint, params) {
        return `${userId}:${endpoint}:${params}`;
    }

    get(userId, endpoint, params = '') {
        const k = this._key(userId, endpoint, params);
        const entry = this._store.get(k);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this._store.delete(k);
            return null;
        }
        return entry.value;
    }

    set(userId, endpoint, params = '', value) {
        this._store.set(this._key(userId, endpoint, params), {
            value,
            expiresAt: Date.now() + this._ttl,
        });
    }

    /**
     * Invalidate every cached entry for a user.
     * Call this after any write that changes the user's transaction data.
     */
    invalidateUser(userId) {
        const prefix = `${userId}:`;
        for (const key of this._store.keys()) {
            if (key.startsWith(prefix)) this._store.delete(key);
        }
    }

    _sweep() {
        const now = Date.now();
        for (const [key, entry] of this._store.entries()) {
            if (now > entry.expiresAt) this._store.delete(key);
        }
    }
}

module.exports = new AnalyticsCache();
