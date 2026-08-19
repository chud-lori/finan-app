const express = require('express');
const router  = express.Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { classifyAll, getGroupSummary, setCategoryGroup, listCategories, deleteCategory, renameCategory, repairTypes } = require('../controllers/category');

router.post('/classify-all', authenticateJWT, limiter.byUser(10), classifyAll);

router.post('/repair-types', authenticateJWT, limiter.byUser(10), repairTypes);

router.get('/group-summary', authenticateJWT, limiter.byUser(30), getGroupSummary);

router.get('/', authenticateJWT, limiter.byUser(60), listCategories);

router.patch('/:id/group', authenticateJWT, limiter.byUser(30), setCategoryGroup);

router.patch('/:id/rename', authenticateJWT, limiter.byUser(30), renameCategory);

router.delete('/:id', authenticateJWT, limiter.byUser(30), deleteCategory);

module.exports = router;
