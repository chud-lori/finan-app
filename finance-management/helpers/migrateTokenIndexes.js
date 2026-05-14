// One-shot migration helper run at startup after DB connect.
//
// Phase 3 security fix: PasswordReset and EmailVerification collections moved
// from storing a plaintext `token` (with unique index `token_1`) to storing
// `tokenHash` instead. New documents have no `token` field, so the legacy
// unique index would treat them all as `token: null` and reject inserts after
// the first one.
//
// This helper is idempotent: it only acts when the legacy index is present.
// Once dropped + orphan rows removed, subsequent runs find nothing to do.
// Safe to run on every startup — fresh DBs see no legacy index, already-
// migrated DBs see no legacy index, only the first deploy after the schema
// change does any work.
//
// Active in-flight reset/verify tokens at the moment of migration become
// invalid. Users can request a new email — acceptable cost for the security
// upgrade given the 1-hour reset and 24-hour verify TTLs.

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
    // NamespaceNotFound = collection never existed yet; nothing to migrate.
    if (err && err.codeName === 'NamespaceNotFound') return;
    logger.warn(`migrate: ${name} index check failed: ${err.message}`);
  }
};

const migrateTokenIndexes = async () => {
  for (const Model of [PasswordReset, EmailVerification]) {
    await dropLegacyTokenIndex(Model);
    // syncIndexes() picks up the new tokenHash_1 index defined in the schema.
    try { await Model.syncIndexes(); } catch (err) {
      logger.warn(`migrate: syncIndexes(${Model.modelName}) failed: ${err.message}`);
    }
  }
};

module.exports = { migrateTokenIndexes };
