const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const UAParser = require('ua-parser-js');
const User = require('../models/user.model');
const Balance = require('../models/balance.model');
const PasswordReset = require('../models/passwordReset.model');
const EmailVerification = require('../models/emailVerification.model');
const Session = require('../models/session.model');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {USER_EMAIL:email, SECRET_TOKEN, FE_URL, GOOGLE_CLIENT_ID} = require('../config/keys');
const logger = require("../helpers/logger");
const { sendPasswordResetEmail, sendVerificationEmail } = require('../helpers/mailer');
const { seedDefaultCategories } = require('../helpers/seedDefaultCategories');
const {
    RegisterRequestDTO,
    LoginRequestDTO,
    RegisterResponseDTO,
    AuthCheckResponseDTO,
    BaseResponseDTO
} = require('../dtos/auth.dto');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const COOKIE_OPTS = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge:   SESSION_TTL_MS,
};

// clearCookie must NOT include maxAge — Express merges options into a cookie() call
// and maxAge overrides the expires:epoch that clearCookie sets, so the cookie never expires.
const CLEAR_COOKIE_OPTS = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path:     '/',
};

/** Create a session doc + set HttpOnly cookie. Call after signing a JWT. */
const createSession = async (userId, token, req, res) => {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const ua      = new UAParser(req.headers['user-agent'] || '').getResult();
    const browser = [ua.browser?.name, ua.browser?.version].filter(Boolean).join(' ') || 'Unknown browser';
    const os      = [ua.os?.name, ua.os?.version].filter(Boolean).join(' ') || 'Unknown OS';
    const deviceName = `${browser} on ${os}`;

    await Session.create({
        user:      userId,
        tokenHash,
        device: {
            name:    deviceName,
            browser,
            os,
            ip: (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown',
        },
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    res.cookie('token', token, COOKIE_OPTS);
};

const registerUser = async (req, res, next) => {
  try {
    // Validate request data
    const registerDTO = new RegisterRequestDTO(req.body);
    const validationErrors = registerDTO.validate();
    if (validationErrors.length > 0) {
      return res.status(400).json(BaseResponseDTO.error('Validation failed', validationErrors));
    }

    // Check if username exists
    const existingUserByUsername = await User.findOne({ username: registerDTO.username });
    if (existingUserByUsername) {
      return res.status(409).json(BaseResponseDTO.error("Username already exists"));
    }

    // Check if email exists
    const existingUserByEmail = await User.findOne({ email: registerDTO.email });
    if (existingUserByEmail) {
      if (existingUserByEmail.googleId) {
        return res.status(409).json(BaseResponseDTO.error("This email is already registered via Google. Please sign in with Google."));
      }
      return res.status(409).json(BaseResponseDTO.error("Email already exists"));
    }

    const isTest = process.env.NODE_ENV === 'test';

    const newUser = new User({
      name: registerDTO.name,
      username: registerDTO.username,
      email: registerDTO.email,
      password: registerDTO.password,
      emailVerified: isTest, // auto-verified in test env so login works immediately
    });

    // Hash password and save user
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newUser.password, salt);
    newUser.password = hash;

    const savedUser = await newUser.save();

    // Create balance for new user
    const newBalance = new Balance({
      user: savedUser._id,
      amount: 0
    });

    const savedBalance = await newBalance.save();

    // Seed default categories for new user (fire-and-forget)
    seedDefaultCategories(savedUser._id).catch(err =>
        logger.error(`Failed to seed categories for new user ${savedUser._id}: ${err.message}`)
    );

    // Send verification email (non-blocking — don't fail registration if email fails)
    // Skipped in test environment
    if (!isTest) {
      try {
        const verifyToken = crypto.randomBytes(32).toString('hex');
        await EmailVerification.create({
          user:      savedUser._id,
          token:     verifyToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
        const verifyUrl = `${FE_URL}/verify-email/${verifyToken}`;
        await sendVerificationEmail(savedUser.email, verifyUrl);
      } catch (mailErr) {
        logger.error(`Failed to send verification email on register: ${mailErr.message}`);
      }
    }

    // Return DTO response
    const responseDTO = new RegisterResponseDTO(savedUser, savedBalance);
    const message = isTest
      ? 'User created successfully'
      : 'User created successfully. Please check your email to verify your account.';
    res.status(201).json(BaseResponseDTO.success(message, responseDTO));

  } catch (error) {
    logger.error('Register user error:', error);
    res.status(500).json(BaseResponseDTO.error('\1'));
  }
}

const loginUser = async (req, res, next) => {
  try {
    const loginDTO = new LoginRequestDTO(req.body);
    logger.info(`Auth Login: ${loginDTO.identifier}`);

    // Validate request data
    const validationErrors = loginDTO.validate();
    if (validationErrors.length > 0) {
      return res.status(400).json(BaseResponseDTO.error('Validation failed', validationErrors));
    }

    // Find user by email or username (auto-detect by presence of @)
    const isEmail = loginDTO.identifier.includes('@');
    const user = isEmail
      ? await User.findOne({ email: loginDTO.identifier.toLowerCase() })
      : await User.findOne({ username: loginDTO.identifier });
    if (!user) {
      logger.error(`Auth Login: ${loginDTO.identifier} not found`);
      return res.status(404).json(BaseResponseDTO.error(isEmail ? "Email not found" : "Username not found"));
    }

    // Block OAuth-only accounts from password login
    if (!user.password) {
      return res.status(400).json(BaseResponseDTO.error("This account was created with Google. Please sign in with Google."));
    }

    // Block unverified email accounts
    if (user.emailVerified === false) {
      return res.status(403).json({ ...BaseResponseDTO.error('Please verify your email before signing in.'), code: 'EMAIL_NOT_VERIFIED' });
    }

    // Check password
    const isMatch = await bcrypt.compare(loginDTO.password, user.password);
    if (!isMatch) {
      logger.error(`Auth Login: ${loginDTO.identifier} password incorrect`);
      return res.status(400).json(BaseResponseDTO.error("Password incorrect"));
    }

    // Create JWT Payload
    const payload = {
      id: user._id,
      name: user.name,
      tv: user.tokenVersion || 0,
    };

    // Sign token and create session (sets HttpOnly cookie)
    const token = jwt.sign(payload, SECRET_TOKEN, { expiresIn: '7d' });
    await createSession(user._id, token, req, res);

    User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() }).catch(() => {});

    res.status(200).json(BaseResponseDTO.success('Login successful', {
        user: { id: user._id, name: user.name },
    }));

  } catch (error) {
    logger.error('Login user error:', error);
    res.status(500).json(BaseResponseDTO.error('\1'));
  }
}

// checkAuth is called after authenticateJWT middleware, so req.user is already verified
const checkAuth = (req, res) => {
    const responseDTO = new AuthCheckResponseDTO(true);
    res.status(200).json(BaseResponseDTO.success('Authorized', {
        ...responseDTO,
        user: { id: req.user.id, name: req.user.name },
    }));
};

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const findOrCreateGoogleUser = async (googleId, email, name) => {
  // 1. Existing user with this Google ID
  let user = await User.findOne({ googleId });
  if (user) return user;

  // 2. Existing email → link Google ID
  user = await User.findOne({ email });
  if (user) {
    user.googleId = googleId;
    await user.save();
    return user;
  }

  // 3. New user — create account + balance
  const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  const username = `${baseUsername}_${Math.random().toString(36).slice(2, 6)}`;
  user = new User({ name, username, email, googleId });
  const saved = await user.save();
  await new Balance({ user: saved._id, amount: 0 }).save();
  // Seed default categories for new Google user (fire-and-forget)
  seedDefaultCategories(saved._id).catch(err =>
      logger.error(`Failed to seed categories for new Google user ${saved._id}: ${err.message}`)
  );
  return saved;
};

const verifyGoogleToken = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json(BaseResponseDTO.error('Google credential is required'));
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const { sub: googleId, email, name } = ticket.getPayload();
    const user = await findOrCreateGoogleUser(googleId, email, name);

    const token = jwt.sign({ id: user._id, name: user.name, tv: user.tokenVersion || 0 }, SECRET_TOKEN, { expiresIn: '7d' });
    logger.info(`Google verify: issued token for user ${user._id}`);

    await createSession(user._id, token, req, res);
    User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() }).catch(() => {});

    res.status(200).json(BaseResponseDTO.success('Login successful', {
        user: { id: user._id, name: user.name },
    }));
  } catch (error) {
    logger.error(`Google verify error: ${error.message}`);
    res.status(401).json(BaseResponseDTO.error('\1'));
  }
};

const deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;
        const Transaction = require('../models/transaction.model');
        const Category = require('../models/category.model');

        await Promise.all([
            Transaction.deleteMany({ user: userId }),
            Balance.deleteOne({ user: userId }),
            Category.deleteMany({ user: userId }),
        ]);
        await User.deleteOne({ _id: userId });

        logger.info(`Account deleted: ${userId}`);
        res.status(200).json(BaseResponseDTO.success('Account and all data deleted successfully'));
    } catch (error) {
        logger.error(`Delete account error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json(BaseResponseDTO.error('New password must be at least 8 characters'));
    }

    const user = await User.findById(userId).select('password googleId');
    if (!user) return res.status(404).json(BaseResponseDTO.error('User not found'));
    if (!user.password) {
      return res.status(400).json(BaseResponseDTO.error('Google accounts cannot change password here'));
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json(BaseResponseDTO.error('Current password is incorrect'));

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await User.findByIdAndUpdate(userId, { password: hash, $inc: { tokenVersion: 1 } });
    await Session.deleteMany({ user: userId });
    res.clearCookie('token', CLEAR_COOKIE_OPTS);

    res.status(200).json(BaseResponseDTO.success('Password changed. Please log in again.'));
  } catch (e) {
    logger.error(`Change password error: ${e.message}`);
    res.status(500).json(BaseResponseDTO.error('Failed to change password', e.message));
  }
};

const logout = async (req, res) => {
    try {
        const tokenHash = crypto.createHash('sha256').update(req.token).digest('hex');
        await Session.deleteOne({ tokenHash });
        res.clearCookie('token', CLEAR_COOKIE_OPTS);
        res.status(200).json(BaseResponseDTO.success('Logged out successfully.'));
    } catch (e) {
        logger.error(`Logout error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to logout'));
    }
};

const logoutAllDevices = async (req, res) => {
    try {
        await Session.deleteMany({ user: req.user.id });
        await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
        res.clearCookie('token', CLEAR_COOKIE_OPTS);
        res.status(200).json(BaseResponseDTO.success('All sessions invalidated. Please log in again.'));
    } catch (e) {
        logger.error(`Logout all error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to logout all devices'));
    }
};

const getSessions = async (req, res) => {
    try {
        const sessions = await Session.find({ user: req.user.id })
            .select('device createdAt lastSeen expiresAt')
            .sort({ lastSeen: -1 })
            .lean();

        const currentHash = crypto.createHash('sha256').update(req.token).digest('hex');
        const data = sessions.map(s => ({
            id:        s._id,
            device:    s.device,
            createdAt: s.createdAt,
            lastSeen:  s.lastSeen,
            isCurrent: String(s._id) === String(req.sessionId),
        }));

        res.status(200).json(BaseResponseDTO.success('Sessions retrieved', { sessions: data }));
    } catch (e) {
        logger.error(`Get sessions error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to retrieve sessions'));
    }
};

const revokeSession = async (req, res) => {
    try {
        const { id } = req.params;
        // Prevent revoking your own current session via this endpoint (use logout for that)
        if (String(id) === String(req.sessionId)) {
            return res.status(400).json(BaseResponseDTO.error('Use /logout to end your current session'));
        }
        const result = await Session.deleteOne({ _id: id, user: req.user.id });
        if (result.deletedCount === 0) {
            return res.status(404).json(BaseResponseDTO.error('Session not found'));
        }
        res.status(200).json(BaseResponseDTO.success('Session revoked'));
    } catch (e) {
        logger.error(`Revoke session error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to revoke session'));
    }
};

const forgotPassword = async (req, res) => {
  // Always return 200 to prevent user enumeration
  const OK = () => res.status(200).json(BaseResponseDTO.success('If that email is registered, a reset link has been sent'));
  try {
    const rawEmail = (req.body.email || '').trim().toLowerCase();
    if (!rawEmail) return res.status(400).json(BaseResponseDTO.error('Email is required'));

    const user = await User.findOne({ email: rawEmail });
    // Only send email for password-based accounts (not Google-only accounts)
    if (!user || !user.password) return OK();

    // Invalidate previous reset tokens for this user
    await PasswordReset.deleteMany({ user: user._id });

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await PasswordReset.create({ user: user._id, token, expiresAt });

    const resetUrl = `${FE_URL}/reset-password/${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);

    return OK();
  } catch (err) {
    logger.error(`Forgot password error: ${err.message}`);
    return OK(); // still 200 to avoid leaking info
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json(BaseResponseDTO.error('Token and new password are required'));
    }
    if (newPassword.length < 8) {
      return res.status(400).json(BaseResponseDTO.error('Password must be at least 8 characters'));
    }

    const record = await PasswordReset.findOne({
      token,
      used:      false,
      expiresAt: { $gt: new Date() },
    });
    if (!record) {
      return res.status(400).json(BaseResponseDTO.error('Invalid or expired reset link. Please request a new one.'));
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    // Update password, invalidate all sessions
    await User.findByIdAndUpdate(record.user, {
        password: hash,
        $inc: { tokenVersion: 1 },
    });
    await Session.deleteMany({ user: record.user });

    record.used = true;
    await record.save();

    res.status(200).json(BaseResponseDTO.success('Password reset successfully. You can now log in.'));
  } catch (err) {
    logger.error(`Reset password error: ${err.message}`);
    res.status(500).json(BaseResponseDTO.error('Failed to reset password'));
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json(BaseResponseDTO.error('Verification token is required'));

    const record = await EmailVerification.findOne({ token, expiresAt: { $gt: new Date() } });
    if (!record) {
      return res.status(400).json(BaseResponseDTO.error('Invalid or expired verification link. Please request a new one.'));
    }

    await User.findByIdAndUpdate(record.user, { emailVerified: true });
    await EmailVerification.deleteOne({ _id: record._id });

    logger.info(`Email verified for user ${record.user}`);
    res.status(200).json(BaseResponseDTO.success('Email verified successfully. You can now sign in.'));
  } catch (err) {
    logger.error(`Verify email error: ${err.message}`);
    res.status(500).json(BaseResponseDTO.error('Failed to verify email'));
  }
};

const resendVerification = async (req, res) => {
  // Always return 200 to prevent user enumeration
  const OK = () => res.status(200).json(BaseResponseDTO.success('If that account exists and is unverified, a new verification email has been sent'));
  try {
    const rawEmail = (req.body.email || '').trim().toLowerCase();
    if (!rawEmail) return res.status(400).json(BaseResponseDTO.error('Email is required'));

    const user = await User.findOne({ email: rawEmail });
    if (!user || user.emailVerified !== false) return OK();

    // Delete any existing token for this user and create a new one
    await EmailVerification.deleteMany({ user: user._id });

    const verifyToken = crypto.randomBytes(32).toString('hex');
    await EmailVerification.create({
      user:      user._id,
      token:     verifyToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const verifyUrl = `${FE_URL}/verify-email/${verifyToken}`;
    await sendVerificationEmail(user.email, verifyUrl);

    return OK();
  } catch (err) {
    logger.error(`Resend verification error: ${err.message}`);
    return OK();
  }
};

module.exports = { registerUser, loginUser, checkAuth, verifyGoogleToken, deleteAccount, changePassword, logout, logoutAllDevices, getSessions, revokeSession, forgotPassword, resetPassword, verifyEmail, resendVerification };
