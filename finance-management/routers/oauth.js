const express = require('express');
const router = express.Router();
const limiter = require('../middleware/rateLimit');
const {
  getAuthorize, postAuthorize, postToken, postRegister, postRevoke,
} = require('../controllers/oauth');

// Mounted here and nowhere else. The app is JSON-only on purpose, but the OAuth
// token endpoint is form-encoded by specification and the consent screen is a
// real HTML form, so the parser is scoped to this router alone.
router.use(express.urlencoded({ extended: false, limit: '10kb' }));

router.get('/authorize', limiter.byIp(20), getAuthorize);
router.post('/authorize', limiter.byIp(20), postAuthorize);
router.post('/token', limiter.byIp(30), postToken);
router.post('/register', limiter.byIp(5), postRegister);
router.post('/revoke', limiter.byIp(20), postRevoke);

module.exports = router;
