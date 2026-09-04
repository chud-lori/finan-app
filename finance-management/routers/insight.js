const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { listDismissals, dismissInsight, restoreInsight } = require('../controllers/insightDismissal');

router.get('/dismissals', authenticateJWT, limiter.byUser(60), listDismissals);

router.post('/dismissals', authenticateJWT, limiter.byUser(30), dismissInsight);

router.delete('/dismissals/:id', authenticateJWT, limiter.byUser(30), restoreInsight);

module.exports = router;
