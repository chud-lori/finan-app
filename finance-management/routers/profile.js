const router = require('express').Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getProfile, updateIdentity, updatePreferences, exportTransactions } = require('../controllers/profile');

router.get('/',              authenticateJWT, limiter.byUser(60), getProfile);
router.patch('/identity',    authenticateJWT, limiter.byUser(10), updateIdentity);
router.patch('/preferences', authenticateJWT, limiter.byUser(30), updatePreferences);
router.get('/export',        authenticateJWT, limiter.byUser(10), exportTransactions);

module.exports = router;
