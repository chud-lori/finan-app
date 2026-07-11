const { FE_URL } = require('../config/keys');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

const normalizeOrigin = (value) => {
    if (!value) return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
};

const expectedOrigin = normalizeOrigin(FE_URL);

const csrfGuard = (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = normalizeOrigin(req.get('origin'));
    const fetchSite = (req.get('sec-fetch-site') || '').toLowerCase();
    const hasSessionCookie = Boolean(req.cookies?.token);

    if (fetchSite === 'cross-site') {
        return res.status(403).json({ status: 0, message: 'Cross-site request blocked' });
    }

    if (origin && expectedOrigin && origin !== expectedOrigin) {
        return res.status(403).json({ status: 0, message: 'Invalid request origin' });
    }

    if (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite)) {
        return res.status(403).json({ status: 0, message: 'Invalid fetch metadata' });
    }

    // Browser cookie-auth mutations in production must present either Origin or
    // Fetch Metadata. Non-browser clients and tests often omit both.
    if (process.env.NODE_ENV === 'production' && hasSessionCookie && !origin && !fetchSite) {
        return res.status(403).json({ status: 0, message: 'Missing CSRF request metadata' });
    }

    next();
};

module.exports = csrfGuard;
