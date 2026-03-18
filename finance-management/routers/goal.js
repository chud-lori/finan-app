const router = require('express').Router();
const authenticateJWT = require('../middleware/authJWT');
// const { transactionValidatorRules, validate } = require('../helpers/validator');
const Goal = require('../models/goal.model');
const User = require('../models/user.model');
const { 
    addGoal, 
    getGoalDetail, 
    getAllGoals
 } = require('../controllers/goal');

/**
 * @openapi
 * /api/goal/add:
 *   post:
 *     tags:
 *       - Goal
 *     summary: Add a new financial goal
 *     description: Creates a new financial goal for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *               - price
 *             properties:
 *               description:
 *                 type: string
 *                 minLength: 1
 *                 example: "Buy a new laptop"
 *                 description: Description of the financial goal
 *               price:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 15000000
 *                 description: Target price/amount for the goal
 *     responses:
 *       201:
 *         description: Goal created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: "Goal created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     goal:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         description:
 *                           type: string
 *                         price:
 *                           type: number
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/add', authenticateJWT, addGoal);
/**
 * @openapi
 * /api/goal/goals:
 *   get:
 *     tags:
 *       - Goal
 *     summary: Get all user goals
 *     description: Retrieves all financial goals for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Goals retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: "All goals retrieved"
 *                 data:
 *                   type: object
 *                   properties:
 *                     goals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           description:
 *                             type: string
 *                           price:
 *                             type: number
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *       500:
 *         description: Server error
 */
router.get('/goals', authenticateJWT, getAllGoals);
/**
 * @openapi
 * /api/goal/goal/{goal}:
 *   get:
 *     tags:
 *       - Goal
 *     summary: Get goal detail with savings calculation
 *     description: Retrieves detailed information about a specific goal including savings progress and remaining amount needed
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goal
 *         required: true
 *         schema:
 *           type: string
 *         description: Goal ID
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Goal detail retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: "Goal detail retrieved"
 *                 data:
 *                   type: object
 *                   properties:
 *                     goal:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         description:
 *                           type: string
 *                         price:
 *                           type: number
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     balance:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     achieve:
 *                       type: object
 *                       properties:
 *                         savings:
 *                           type: number
 *                           description: 20% of current balance allocated to this goal
 *                           example: 1000000
 *                         need:
 *                           type: number
 *                           description: Remaining amount needed to achieve the goal
 *                           example: 14000000
 *       404:
 *         description: Goal not found or user balance not found
 *       500:
 *         description: Server error
 */
router.get('/goal/:goal', authenticateJWT, getGoalDetail);

module.exports = router;