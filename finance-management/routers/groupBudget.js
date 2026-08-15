const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { getGroupBudgets, setGroupBudget } = require('../controllers/groupBudget');

// GET /api/group-budget — cappable groups with cap, current-month spend, progress
router.get('/', authenticateJWT, limiter.byUser(30), getGroupBudgets);

// PUT /api/group-budget/:group — set or clear a soft cap for one group
router.put('/:group', authenticateJWT, limiter.byUser(30), setGroupBudget);

module.exports = router;
