const router = require('express').Router();
const limiter = require('../middleware/rateLimit');
const mcpAuth = require('../middleware/mcpAuth');
const { postMcp, getMcp } = require('../controllers/mcp');

router.post('/', mcpAuth, limiter.byUser(120), postMcp);
router.get('/', mcpAuth, getMcp);

module.exports = router;
