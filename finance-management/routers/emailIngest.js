const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const {
    getPendingTransactions,
    dismissPendingTransaction,
    getIngestAddress,
} = require('../controllers/emailIngest');

// GET /api/email-ingest/pending — pending email-imported transactions awaiting review
router.get('/pending', authenticateJWT, limiter.byUser(30), getPendingTransactions);

// DELETE /api/email-ingest/pending/:id — dismiss a pending item (also called after confirm)
router.delete('/pending/:id', authenticateJWT, limiter.byUser(30), dismissPendingTransaction);

// GET /api/email-ingest/address — get (or lazily create) the user's forwarding address
router.get('/address', authenticateJWT, limiter.byUser(10), getIngestAddress);

module.exports = router;
