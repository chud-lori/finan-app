const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { classifyAll, getGroupSummary, setCategoryGroup, listCategories, deleteCategory, renameCategory, repairTypes } = require('../controllers/category');

// POST /api/category/classify-all — classify all unclassified categories for the user
router.post('/classify-all', authenticateJWT, limiter.byUser(10), classifyAll);

// POST /api/category/repair-types — fix categories whose type doesn't match transaction usage
router.post('/repair-types', authenticateJWT, limiter.byUser(5), repairTypes);

// GET /api/category/group-summary — spending breakdown by semantic group for a month
router.get('/group-summary', authenticateJWT, limiter.byUser(30), getGroupSummary);

// GET /api/category — list all categories with full metadata
router.get('/', authenticateJWT, limiter.byUser(60), listCategories);

// PATCH /api/category/:id/group — manually override a category's spending group
router.patch('/:id/group', authenticateJWT, limiter.byUser(30), setCategoryGroup);

// PATCH /api/category/:id/rename — rename a category (and update all referencing transactions)
router.patch('/:id/rename', authenticateJWT, limiter.byUser(30), renameCategory);

// DELETE /api/category/:id — delete a category (blocked if any transaction uses it)
router.delete('/:id', authenticateJWT, limiter.byUser(30), deleteCategory);

module.exports = router;
