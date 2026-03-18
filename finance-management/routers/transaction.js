const router = require('express').Router();
const multer = require('multer');
const authenticateJWT = require('../middleware/authJWT');
const { transactionValidatorRules, validate } = require('../helpers/validator');
const {
    addTransaction,
    getUserTransaction,
    getCategory,
    seedCategory,
    getByDate,
    getByTimeRange,
    getOutcomes,
    deleteTransaction,
    getRecommendation,
    importCsv,
    getAnalytics,
} = require('../controllers/transaction');

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});



/**
 * @openapi
 * /api/transaction/outcomes:
 *   get:
 *     tags:
 *       - Transaction
 *     summary: Get total outcomes summary
 *     description: Retrieves the total amount of all outcome transactions for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total outcomes retrieved successfully
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
 *                   example: "Total outcomes retrieved"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalOutcomes:
 *                       type: number
 *                       description: Sum of all outcome transactions
 *                       example: 1500000
 *       500:
 *         description: Server error
 */
router.get('/outcomes', authenticateJWT, getOutcomes);
router.get('/analytics', authenticateJWT, getAnalytics);

/**
 * @openapi
 * /api/transaction/import/csv:
 *   post:
 *     tags:
 *       - Transaction
 *     summary: Import transactions from CSV file
 *     description: |
 *       Upload a CSV file to bulk-import transactions. Expected columns (case-insensitive):
 *       - **Title** or **Description** — transaction description
 *       - **Amount** — numeric or formatted like "Rp1,000,000"
 *       - **Type** — "income" or "outcome"
 *       - **Category** — must match an existing category name
 *       - **Timestamp**, **Date**, or **Time** — date/time in common formats (M/D/YYYY H:mm:ss, YYYY-MM-DD HH:mm:ss, ISO 8601, etc.)
 *       - **Timezone** (optional) — IANA timezone identifier, defaults to Asia/Jakarta
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file to import
 *     responses:
 *       200:
 *         description: Import completed (check success/failed counts)
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
 *                   example: "CSV import completed"
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     success:
 *                       type: integer
 *                       example: 48
 *                     failed:
 *                       type: integer
 *                       example: 2
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: No file uploaded or empty CSV
 *       500:
 *         description: Server error
 */
router.post('/import/csv', authenticateJWT, upload.single('file'), importCsv);

/**
 * @openapi
 * /api/transaction:
 *   post:
 *     tags:
 *       - Transaction
 *     summary: Add a new transaction
 *     description: Creates a new transaction and updates the user's balance accordingly
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
 *               - category
 *               - amount
 *               - type
 *               - time
 *               - transaction_timezone
 *             properties:
 *               description:
 *                 type: string
 *                 minLength: 1
 *                 example: "Grocery shopping at supermarket"
 *                 description: Description of the transaction
 *               category:
 *                 type: string
 *                 minLength: 1
 *                 example: "Food & Dining"
 *                 description: Category of the transaction (must exist in system)
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 250000
 *                 description: Amount involved in the transaction
 *               currency:
 *                 type: string
 *                 pattern: '^[A-Z]{3}$'
 *                 example: "IDR"
 *                 description: 3-letter ISO 4217 currency code
 *               type:
 *                 type: string
 *                 enum: [income, outcome]
 *                 example: "outcome"
 *                 description: Type of transaction
 *               time:
 *                 type: string
 *                 example: "9/27/2025 22:30:00"
 *                 description: Local time in M/D/YYYY H:mm:ss format
 *               transaction_timezone:
 *                 type: string
 *                 example: "Asia/Jakarta"
 *                 description: IANA timezone identifier
 *     responses:
 *       201:
 *         description: Transaction created successfully
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
 *                   example: "Transaction created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         description:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         category:
 *                           type: string
 *                         type:
 *                           type: string
 *                         currency:
 *                           type: string
 *                         time:
 *                           type: string
 *                           format: date-time
 *                         transaction_timezone:
 *                           type: string
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
 *       400:
 *         description: Validation error or invalid data
 *       404:
 *         description: User balance not found
 *       500:
 *         description: Server error
 */

router.post('', transactionValidatorRules(), validate, authenticateJWT, addTransaction);

/**
 * @openapi
 * /api/transaction/category:
 *   post:
 *     tags:
 *       - Transaction
 *     summary: Seed transaction categories
 *     description: Populates the database with predefined transaction categories from categories.json
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories seeded successfully
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
 *                   example: "Categories seeded"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "Food & Dining"
 *       500:
 *         description: Server error
 */
router.post('/category', authenticateJWT, seedCategory)

/**
 * @openapi
 * /api/transaction/category:
 *   get:
 *     tags:
 *       - Transaction
 *     summary: Get transaction categories
 *     description: Retrieves available transaction categories, optionally filtered by search term
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Search term to filter categories (case insensitive)
 *         example: "food"
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
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
 *                   example: "Categories retrieved"
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Food & Dining", "Transportation", "Entertainment"]
 *       500:
 *         description: Server error
 */
router.get(`/category`, authenticateJWT, getCategory);

/**
 * @openapi
 * /api/transaction/{type}:
 *   get:
 *     tags:
 *       - Transaction
 *     summary: Get user transactions
 *     description: Retrieves a list of transactions for the authenticated user, optionally filtered by type, category, and month.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [income, outcome]
 *         description: Optional transaction type filter ('income' or 'outcome'). If omitted, returns all types.
 *       - in: query
 *         name: category
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional category filter (case insensitive).
 *       - in: query
 *         name: month
 *         required: false
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-(0[1-9]|1[0-2])$'
 *         description: Optional month filter in YYYY-MM format.
 *     responses:
 *       200:
 *         description: A list of transactions and the user's current balance.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: user transactions
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: Unique transaction ID.
 *                           description:
 *                             type: string
 *                           category:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           currency:
 *                             type: string
 *                             description: The 3-letter ISO 4217 currency code for the amount (e.g., IDR).
 *                           type:
 *                             type: string
 *                             enum: [income, outcome]
 *                           time:
 *                             type: string
 *                             format: date-time
 *                             description: The transaction date and time stored in **UTC**.
 *                           transaction_timezone:
 *                             type: string
 *                             description: The IANA timezone identifier used when the transaction was originally logged (e.g., Asia/Jakarta).
 *                     balance:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           description: The user's current balance amount.
 *       404:
 *         description: Not Found (e.g., invalid path type).
 *       500:
 *         description: Server error.
 */
router.get('/:type?', authenticateJWT, getUserTransaction);

/**
 * @openapi
 * /api/transaction/date/{date}:
 *   get:
 *     tags:
 *       - Transaction
 *     summary: Get transactions by specific date
 *     description: Retrieves all transactions for a specific date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date in YYYY-MM-DD format
 *         example: "2025-01-15"
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
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
 *                   example: "transactions at 2025-01-15"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       description:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       category:
 *                         type: string
 *                       type:
 *                         type: string
 *                       currency:
 *                         type: string
 *                       time:
 *                         type: string
 *                         format: date-time
 *       500:
 *         description: Server error
 */
router.get('/date/:date', authenticateJWT, getByDate);

/**
 * @openapi
 * /api/transaction/range/{start}/{end}:
 *   get:
 *     tags:
 *       - Transaction
 *     summary: Get transactions by date range
 *     description: Retrieves transactions within a specific date range with income/outcome summary
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date in YYYY-MM-DD format
 *         example: "2025-01-01"
 *       - in: path
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date in YYYY-MM-DD format
 *         example: "2025-01-31"
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
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
 *                   example: "sum all transaction by date"
 *                 data:
 *                   type: object
 *                   properties:
 *                     income:
 *                       type: number
 *                       description: Total income amount in the range
 *                       example: 5000000
 *                     outcome:
 *                       type: number
 *                       description: Total outcome amount in the range
 *                       example: 2500000
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           description:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           category:
 *                             type: string
 *                           type:
 *                             type: string
 *                           currency:
 *                             type: string
 *                           time:
 *                             type: string
 *                             format: date-time
 *       500:
 *         description: Server error
 */
router.get('/range/:start/:end', authenticateJWT, getByTimeRange);

/**
 * @openapi
 * /api/transaction/{id}:
 *   delete:
 *     tags:
 *       - Transaction
 *     summary: Delete a transaction
 *     description: Deletes a transaction and updates the user's balance accordingly
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID to delete
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Transaction deleted successfully
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
 *                   example: "delete success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     description:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     category:
 *                       type: string
 *                     type:
 *                       type: string
 *                     currency:
 *                       type: string
 *                     time:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authenticateJWT, deleteTransaction);

/**
 * @openapi
 * /api/transaction/recommendation/{monthly}/{spend}:
 *   get:
 *     tags:
 *       - Transaction
 *     summary: Get budget recommendation
 *     description: Provides budget recommendation based on monthly budget and planned spending
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: monthly
 *         required: true
 *         schema:
 *           type: number
 *         description: Monthly budget amount
 *         example: 10000000
 *       - in: path
 *         name: spend
 *         required: true
 *         schema:
 *           type: number
 *         description: Amount you plan to spend
 *         example: 500000
 *     responses:
 *       200:
 *         description: Budget recommendation retrieved successfully
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
 *                   example: "recommendation"
 *                 data:
 *                   type: object
 *                   properties:
 *                     outcome:
 *                       type: number
 *                       description: Total outcome amount in the last 7 days
 *                       example: 2000000
 *                     threshold:
 *                       type: number
 *                       description: Weekly budget threshold (monthly/4)
 *                       example: 2500000
 *                     leftOverBudget:
 *                       type: number
 *                       description: Remaining budget for the week
 *                       example: 500000
 *                     resultRecommendation:
 *                       type: integer
 *                       enum: [0, 1]
 *                       description: 1 if spending is recommended, 0 if not
 *                       example: 1
 *       500:
 *         description: Server error
 */
router.get('/recommendation/:monthly/:spend', authenticateJWT, getRecommendation);

module.exports = router;
