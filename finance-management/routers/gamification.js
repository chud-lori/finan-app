const router = require('express').Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getGamificationSummary } = require('../controllers/gamification');

router.get('/summary', authenticateJWT, limiter.byUser(30), getGamificationSummary);

module.exports = router;
