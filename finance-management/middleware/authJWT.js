const jwt = require("jsonwebtoken");
const { SECRET_TOKEN } = require("../config/keys");

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(" ")[1];

    jwt.verify(token, SECRET_TOKEN, (err, user) => {
      if (err) {
        return res.status(403).json({message: 'Forbidden'});
      }

      req.user = user;
      next();
    });
  } else {
    res.status(401).json({message: 'Unauthorized'});
  }
};

module.exports = authenticateJWT;
