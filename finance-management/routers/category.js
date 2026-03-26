const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { classifyAll, getGroupSummary, setCategoryGroup, listCategories, deleteCategory, renameCategory } = require('../controllers/category');

// POST /api/category/classify-all — classify all unclassified categories for the user
router.post('/classify-all', authenticateJWT, limiter.byUser(10), classifyAll);

// GET /api/category/group-summary — spending breakdown by semantic group for a month
router.get('/group-summary', authenticateJWT, limiter.byUser(30), getGroupSummary);

// GET /api/category — list all categories with full metadata
router.get('/', authenticateJWT, limiter.byUser(60), listCategories);

// PATCH /api/category/:name/group — manually override a category's spending group
router.patch('/:name/group', authenticateJWT, limiter.byUser(30), setCategoryGroup);

// PATCH /api/category/:name/rename — rename a category (and update all referencing transactions)
router.patch('/:name/rename', authenticateJWT, limiter.byUser(30), renameCategory);

// DELETE /api/category/:name — delete a category (blocked if any transaction uses it)
router.delete('/:name', authenticateJWT, limiter.byUser(30), deleteCategory);

module.exports = router;
