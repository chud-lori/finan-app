const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getSmartRecommendations } = require('../controllers/recommendation');
const { allocate } = require('../controllers/allocation');

// GET /api/recommendations
// Returns 1–5 personalised nudges based on rule-based logic over live data.
// Light endpoint: one $lt/$gte query per data source. 20/min is generous.
router.get('/', authenticateJWT, limiter.byUser(20), getSmartRecommendations);

// POST /api/recommendations/allocate
// One-tap allocation of a surplus / windfall into a goal (atomic per-goal $inc).
// This is the persistent action that suppresses the surplus-sweep and windfall
// nudges. Aligned with goal-mutation limits (writes are cheap but state-changing).
router.post('/allocate', authenticateJWT, limiter.byUser(30), allocate);

module.exports = router;
