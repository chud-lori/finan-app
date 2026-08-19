const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getSmartRecommendations } = require('../controllers/recommendation');
const { allocate } = require('../controllers/allocation');
const { getWindfall } = require('../controllers/windfall');
const { getZakat } = require('../controllers/zakat');

router.get('/', authenticateJWT, limiter.byUser(20), getSmartRecommendations);

router.post('/allocate', authenticateJWT, limiter.byUser(30), allocate);

router.get('/windfall', authenticateJWT, limiter.byUser(30), getWindfall);

router.get('/zakat', authenticateJWT, limiter.byUser(30), getZakat);

module.exports = router;
