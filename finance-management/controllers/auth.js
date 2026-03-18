const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user.model');
const Balance = require('../models/balance.model');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {USER_EMAIL:email, SECRET_TOKEN, FE_URL, GOOGLE_CLIENT_ID} = require('../config/keys');
const logger = require("../helpers/logger");
const {
    RegisterRequestDTO,
    LoginRequestDTO,
    RegisterResponseDTO,
    LoginResponseDTO,
    AuthCheckResponseDTO,
    BaseResponseDTO
} = require('../dtos/auth.dto');

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

    const newUser = new User({
      name: registerDTO.name,
      username: registerDTO.username,
      email: registerDTO.email,
      password: registerDTO.password
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

    // Return DTO response
    const responseDTO = new RegisterResponseDTO(savedUser, savedBalance);
    res.status(201).json(BaseResponseDTO.success('User created successfully', responseDTO));

  } catch (error) {
    logger.error('Register user error:', error);
    res.status(500).json(BaseResponseDTO.error('Failed to create user', error.message));
  }
}

const loginUser = async (req, res, next) => {
  try {
    logger.info(`Auth Login: ${req.body.username}`);

    // Validate request data
    const loginDTO = new LoginRequestDTO(req.body);
    const validationErrors = loginDTO.validate();
    if (validationErrors.length > 0) {
      return res.status(400).json(BaseResponseDTO.error('Validation failed', validationErrors));
    }

    // Find user by username
    const user = await User.findOne({ username: loginDTO.username });
    if (!user) {
      logger.error(`Auth Login: ${loginDTO.username} username not found`);
      return res.status(404).json(BaseResponseDTO.error("Invalid username/password"));
    }

    // Block OAuth-only accounts from password login
    if (!user.password) {
      return res.status(400).json(BaseResponseDTO.error("This account was created with Google. Please sign in with Google."));
    }

    // Check password
    const isMatch = await bcrypt.compare(loginDTO.password, user.password);
    if (!isMatch) {
      logger.error(`Auth Login: ${loginDTO.username} password incorrect`);
      return res.status(400).json(BaseResponseDTO.error("Invalid username/password"));
    }

    // Create JWT Payload
    const payload = {
      id: user._id,
      name: user.name,
    };

    // Sign token
    const token = jwt.sign(payload, SECRET_TOKEN, {
      expiresIn: 31556926, // 1 year in seconds
    });

    logger.info(`Auth Login Response: ${token}`);

    // Return DTO response
    const responseDTO = new LoginResponseDTO(token, user);
    res.status(200).json(BaseResponseDTO.success('Login successful', responseDTO));

  } catch (error) {
    logger.error('Login user error:', error);
    res.status(500).json(BaseResponseDTO.error('Login failed', error.message));
  }
}

const checkAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json(BaseResponseDTO.error('Unauthorized - No token provided'));
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json(BaseResponseDTO.error('Unauthorized - Invalid token format'));
    }

    jwt.verify(token, SECRET_TOKEN, (err, user) => {
      if (err) {
        return res.status(403).json(BaseResponseDTO.error('Forbidden - Invalid token'));
      }

      const responseDTO = new AuthCheckResponseDTO(true);
      res.status(200).json(BaseResponseDTO.success('Authorized', responseDTO));
    });
  } catch (error) {
    logger.error('Check auth error:', error);
    res.status(500).json(BaseResponseDTO.error('Auth check failed', error.message));
  }
}

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

    const token = jwt.sign({ id: user._id, name: user.name }, SECRET_TOKEN, { expiresIn: 31556926 });
    logger.info(`Google verify: issued token for user ${user._id}`);

    res.status(200).json(BaseResponseDTO.success('Login successful', {
      token,
      token_type: 'bearer',
      user: { id: user._id, name: user.name },
    }));
  } catch (error) {
    logger.error(`Google verify error: ${error.message}`);
    res.status(401).json(BaseResponseDTO.error('Google authentication failed', error.message));
  }
};

module.exports = { registerUser, loginUser, checkAuth, verifyGoogleToken };
