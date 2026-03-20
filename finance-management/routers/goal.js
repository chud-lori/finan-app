const router = require('express').Router();
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');
const { addGoal, getGoalDetail, getAllGoals, updateGoal, deleteGoal } = require('../controllers/goal');

router.post('/add',           authenticateJWT, limiter.byUser(20),  addGoal);
router.get('/goals',          authenticateJWT, limiter.byUser(60),  getAllGoals);
router.get('/goal/:goal',     authenticateJWT, limiter.byUser(60),  getGoalDetail);
router.patch('/:id',          authenticateJWT, limiter.byUser(30),  updateGoal);
router.delete('/:id',         authenticateJWT, limiter.byUser(20),  deleteGoal);

module.exports = router;
