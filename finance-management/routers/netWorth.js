const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getNetWorth, updateNetWorth, getNetWorthHistory } = require('../controllers/netWorth');

// GET /api/networth/history — monthly snapshots for the trend line
router.get('/history', authenticateJWT, limiter.byUser(60), getNetWorthHistory);

// GET /api/networth — current holdings + derived net worth
router.get('/', authenticateJWT, limiter.byUser(60), getNetWorth);

// PUT /api/networth — replace holdings, recompute, upsert this month's snapshot
router.put('/', authenticateJWT, limiter.byUser(30), updateNetWorth);

module.exports = router;
