const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getNetWorth, updateNetWorth, getNetWorthHistory } = require('../controllers/netWorth');

router.get('/history', authenticateJWT, limiter.byUser(60), getNetWorthHistory);

router.get('/', authenticateJWT, limiter.byUser(60), getNetWorth);

router.put('/', authenticateJWT, limiter.byUser(30), updateNetWorth);

module.exports = router;
