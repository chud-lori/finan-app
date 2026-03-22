const express = require('express');
const router  = express.Router();
const { authenticateJWT } = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getSmartRecommendations } = require('../controllers/recommendation');

// GET /api/recommendations
// Returns 1–5 personalised nudges based on rule-based logic over live data.
// Light endpoint: one $lt/$gte query per data source. 20/min is generous.
router.get('/', authenticateJWT, limiter.byUser(20), getSmartRecommendations);

module.exports = router;
