const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getGroupBudgets, setGroupBudget } = require('../controllers/groupBudget');

router.get('/', authenticateJWT, limiter.byUser(30), getGroupBudgets);

router.put('/:group', authenticateJWT, limiter.byUser(30), setGroupBudget);

module.exports = router;
