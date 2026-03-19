const jwt = require("jsonwebtoken");
const { SECRET_TOKEN } = require("../config/keys");
const User = require("../models/user.model");

const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });

  const token = authHeader.split(" ")[1];
  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_TOKEN);
  } catch (err) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // If token contains tokenVersion, verify it hasn't been invalidated
  if (decoded.tv !== undefined) {
    try {
      const user = await User.findById(decoded.id).select('tokenVersion').lean();
      // Use ?? 0 so users created before tokenVersion was added (field = undefined) still pass
      const dbVersion = user?.tokenVersion ?? 0;
      if (!user || dbVersion !== decoded.tv) {
        return res.status(403).json({ message: 'Session expired. Please log in again.' });
      }
    } catch (e) {
      return res.status(500).json({ message: 'Auth check failed' });
    }
  }

  req.user = decoded;
  next();
};

module.exports = authenticateJWT;
