const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { classifyAll, getGroupSummary, setCategoryGroup } = require('../controllers/category');

// POST /api/category/classify-all — classify all unclassified categories for the user
router.post('/classify-all', authenticateJWT, limiter.byUser(10), classifyAll);

// GET /api/category/group-summary — spending breakdown by semantic group for a month
router.get('/group-summary', authenticateJWT, limiter.byUser(30), getGroupSummary);

// PATCH /api/category/:name/group — manually override a category's spending group
router.patch('/:name/group', authenticateJWT, limiter.byUser(30), setCategoryGroup);

module.exports = router;
