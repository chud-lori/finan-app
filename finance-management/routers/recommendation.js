const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getSmartRecommendations } = require('../controllers/recommendation');
const { allocate } = require('../controllers/allocation');
const { getWindfall } = require('../controllers/windfall');
const { getZakat } = require('../controllers/zakat');

// GET /api/recommendations
// Returns 1–5 personalised nudges based on rule-based logic over live data.
// Light endpoint: one $lt/$gte query per data source. 20/min is generous.
router.get('/', authenticateJWT, limiter.byUser(20), getSmartRecommendations);

// POST /api/recommendations/allocate
// One-tap allocation of a surplus / windfall into a goal (atomic per-goal $inc).
// This is the persistent action that suppresses the surplus-sweep and windfall
// nudges. Aligned with goal-mutation limits (writes are cheap but state-changing).
router.post('/allocate', authenticateJWT, limiter.byUser(30), allocate);

// GET /api/recommendations/windfall
// Detects a recent unusually large income (THR / bonus) + returns active goals
// for a one-tap split. Read-only; a couple of income queries. Query: ?tz=IANA.
router.get('/windfall', authenticateJWT, limiter.byUser(30), getWindfall);

// GET /api/recommendations/zakat
// Zakat-maal ESTIMATE from NetWorth holdings + social-group giving YTD.
// Read-only. Query: ?tz=IANA, optional ?nisab=<amount>.
router.get('/zakat', authenticateJWT, limiter.byUser(30), getZakat);

module.exports = router;
