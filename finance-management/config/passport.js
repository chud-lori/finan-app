const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../models/user.model');
const Balance = require('../models/balance.model');
const logger = require('../helpers/logger');
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = require('./keys');

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  logger.warn('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google OAuth will be unavailable');
} else {
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('Google account has no email address'));

        // 1. Existing user with this Google ID
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
          logger.info(`Google OAuth: existing user ${user._id}`);
          return done(null, user);
        }

        // 2. Existing user with same email → link Google ID
        user = await User.findOne({ email });
        if (user) {
          user.googleId = profile.id;
          await user.save();
          logger.info(`Google OAuth: linked Google ID to user ${user._id}`);
          return done(null, user);
        }

        // 3. New user — create account + balance
        const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
        const suffix = Math.random().toString(36).slice(2, 6);
        const username = `${baseUsername}_${suffix}`;

        user = new User({
          name: profile.displayName || baseUsername,
          username,
          email,
          googleId: profile.id,
        });
        const savedUser = await user.save();
        await new Balance({ user: savedUser._id, amount: 0 }).save();

        logger.info(`Google OAuth: created new user ${savedUser._id}`);
        return done(null, savedUser);
      } catch (err) {
        logger.error(`Google OAuth strategy error: ${err.message}`);
        return done(err);
      }
    }
  )
);
} // end if credentials set

// Minimal serialize/deserialize — only used for the transient OAuth session handshake
passport.serializeUser((user, done) => done(null, user._id.toString()));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
