const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { SECRET_TOKEN } = require('../config/keys');
const Session = require('../models/session.model');

const authenticateJWT = async (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    let decoded;
    try {
        decoded = jwt.verify(token, SECRET_TOKEN);
    } catch {
        return res.status(403).json({ message: 'Forbidden' });
    }

    // A valid JWT is not enough — the Session doc is the real auth gate.
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

    Session.updateOne({ _id: session._id }, { lastSeen: new Date() }).catch(() => {});

    req.user      = decoded;
    req.token     = token;          // used by logout to find & delete this session
    req.sessionId = session._id;    // used by "revoke this device" endpoint
    next();
};

module.exports = authenticateJWT;
