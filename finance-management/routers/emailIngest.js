const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const {
    getPendingTransactions,
    dismissPendingTransaction,
    getIngestAddress,
    getIngestStatus,
    gmailConnect,
    gmailCallback,
    gmailDisconnect,
} = require('../controllers/emailIngest');

// GET /api/email-ingest/pending — pending email-imported transactions awaiting review
router.get('/pending', authenticateJWT, limiter.byUser(30), getPendingTransactions);

// DELETE /api/email-ingest/pending/:id — dismiss a pending item (also called after confirm)
router.delete('/pending/:id', authenticateJWT, limiter.byUser(30), dismissPendingTransaction);

// GET /api/email-ingest/address — get (or lazily create) the user's forwarding address
router.get('/address', authenticateJWT, limiter.byUser(10), getIngestAddress);

// GET /api/email-ingest/status — availability + connection state of both transports
router.get('/status', authenticateJWT, limiter.byUser(30), getIngestStatus);

// GET /api/email-ingest/gmail/connect — consent URL for the Connect Gmail button
router.get('/gmail/connect', authenticateJWT, limiter.byUser(10), gmailConnect);

// GET /api/email-ingest/gmail/callback — Google OAuth redirect target.
// No authJWT: it's a top-level browser navigation authenticated by the signed
// state JWT (10-min TTL, purpose-bound, carries the user id).
router.get('/gmail/callback', limiter.byIp(10), gmailCallback);

// DELETE /api/email-ingest/gmail — disconnect Gmail + best-effort token revoke
router.delete('/gmail', authenticateJWT, limiter.byUser(10), gmailDisconnect);

module.exports = router;
