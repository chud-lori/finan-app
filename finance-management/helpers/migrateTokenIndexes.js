// Drops the legacy unique `token_1` index — hashed tokens leave `token: null`, which it rejects past the first insert.

const logger = require('./logger');
const PasswordReset = require('../models/passwordReset.model');
const EmailVerification = require('../models/emailVerification.model');

const dropLegacyTokenIndex = async (Model) => {
  const name = Model.collection.collectionName;
  try {
    const indexes = await Model.collection.indexes();
    const legacy = indexes.find((i) => i.name === 'token_1');
    if (!legacy) return;
    logger.info(`migrate: dropping legacy index token_1 on ${name}`);
    await Model.collection.dropIndex('token_1');
    const orphans = await Model.deleteMany({ tokenHash: { $exists: false } });
    if (orphans.deletedCount) {
      logger.info(`migrate: removed ${orphans.deletedCount} orphan ${name} rows (pre-hash tokens are now unusable)`);
    }
  } catch (err) {
    if (err && err.codeName === 'NamespaceNotFound') return;
    logger.warn(`migrate: ${name} index check failed: ${err.message}`);
  }
};

const migrateTokenIndexes = async () => {
  for (const Model of [PasswordReset, EmailVerification]) {
    await dropLegacyTokenIndex(Model);
    try { await Model.syncIndexes(); } catch (err) {
      logger.warn(`migrate: syncIndexes(${Model.modelName}) failed: ${err.message}`);
    }
  }
};

module.exports = { migrateTokenIndexes };
