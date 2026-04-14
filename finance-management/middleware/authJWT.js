const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { SECRET_TOKEN } = require('../config/keys');
const Session = require('../models/session.model');
const User    = require('../models/user.model');

const authenticateJWT = async (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    let decoded;
    try {
        decoded = jwt.verify(token, SECRET_TOKEN);
    } catch {
        return res.status(403).json({ message: 'Forbidden' });
    }

    // Validate against the session store — this is what makes revocation instant
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    let session;
    try {
        session = await Session.findOne({ tokenHash }).lean();
    } catch {
        return res.status(500).json({ message: 'Auth check failed' });
    }

    if (!session) {
        return res.status(403).json({ message: 'Session expired. Please log in again.' });
    }

    // Defence-in-depth: reject tokens issued before the last "logout everywhere" /
    // password change, even if a stale Session doc somehow exists.
    try {
        const user = await User.findById(decoded.id).select('tokenVersion').lean();
        if (!user || (user.tokenVersion || 0) !== (decoded.tv || 0)) {
            return res.status(403).json({ message: 'Session expired. Please log in again.' });
        }
    } catch {
        return res.status(500).json({ message: 'Auth check failed' });
    }

    // Update lastSeen fire-and-forget — don't block the request
    Session.updateOne({ _id: session._id }, { lastSeen: new Date() }).catch(() => {});

    req.user      = decoded;
    req.token     = token;          // used by logout to find & delete this session
    req.sessionId = session._id;    // used by "revoke this device" endpoint
    next();
};

module.exports = authenticateJWT;
