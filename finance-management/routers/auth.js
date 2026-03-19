const router = require('express').Router();
const { loginValidatorRules, registerValidatorRules, validate } = require('../helpers/validator');
const { registerUser, loginUser, checkAuth, verifyGoogleToken, deleteAccount, changePassword, logoutAllDevices, forgotPassword, resetPassword } = require('../controllers/auth');
const authenticateJWT = require('../middleware/authJWT');
const limiter = require('../middleware/rateLimit');

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Login user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: "jajang_aja"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Login successful
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
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     token_type:
 *                       type: string
 *                       example: "bearer"
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *       400:
 *         description: Validation error or invalid credentials
 *       404:
 *         description: Username not found
 *       500:
 *         description: Server error
 */
router.post('/login', limiter.byIp(10), loginValidatorRules(), validate, loginUser);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Register user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - username
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Jajang Aja"
 *               username:
 *                 type: string
 *                 example: "jajan_aja"
 *               email:
 *                 type: string
 *                 example: "jajang@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       201:
 *         description: User registered successfully
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
 *                   example: "User created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         username:
 *                           type: string
 *                         email:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                     balance:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         updatedAt:
 *                           type: string
 *       400:
 *         description: Validation error
 *       409:
 *         description: Username or email already exists
 *       500:
 *         description: Server error
 */
router.post('/register', limiter.byIp(10), registerValidatorRules(), validate, registerUser)

/**
 * @openapi
 * /api/auth/check:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Check auth token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
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
 *                   example: "Authorized"
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorized:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Unauthorized - No token or invalid token format
 *       403:
 *         description: Forbidden - Invalid token
 *       500:
 *         description: Server error
 */
router.get('/check', checkAuth);

/**
 * @openapi
 * /api/auth/google/verify:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Verify Google id_token and issue a JWT
 *     description: |
 *       Accepts the Google credential (id_token) obtained by the frontend via
 *       the Google Identity Services popup. Verifies it server-side with google-auth-library,
 *       then finds or creates a user and returns a JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential:
 *                 type: string
 *                 description: Google id_token JWT from the frontend
 *     responses:
 *       200:
 *         description: Login successful — returns JWT
 *       400:
 *         description: Missing credential
 *       401:
 *         description: Invalid Google token
 */
router.post('/google/verify', limiter.byIp(20), verifyGoogleToken);
router.delete('/account', authenticateJWT, deleteAccount);
router.patch('/password', authenticateJWT, limiter.byUser(5), changePassword);
router.post('/logout-all', authenticateJWT, limiter.byUser(5), logoutAllDevices);
router.post('/forgot-password', limiter.byIp(5), forgotPassword);
router.post('/reset-password', limiter.byIp(10), resetPassword);

module.exports = router;