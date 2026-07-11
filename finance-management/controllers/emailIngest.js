const crypto = require('crypto');
const PendingTransaction = require('../models/pendingTransaction.model');
const User = require('../models/user.model');
const logger = require('../helpers/logger');
const vault = require('../helpers/cryptoVault');
const gmailSync = require('../services/emailIngest/gmailSync');
const { EMAIL_INGEST_ADDRESS, FE_URL } = require('../config/keys');
const {
    GetPendingTransactionsResponseDTO,
    IngestAddressResponseDTO,
    BaseResponseDTO,
} = require('../dtos/emailIngest.dto');

// GET /api/email-ingest/pending — pending transaction candidates for review
const getPendingTransactions = async (req, res) => {
    try {
        const pendings = await PendingTransaction
            .find({ user: req.user.id })
            .sort({ receivedAt: -1 })
            .limit(100)
            .exec();
        const responseDTO = new GetPendingTransactionsResponseDTO(pendings);
        res.status(200).json(BaseResponseDTO.success('Pending transactions retrieved', responseDTO));
    } catch (error) {
        logger.error(`Get pending transactions ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

// DELETE /api/email-ingest/pending/:id — dismiss a pending item.
// Called on explicit dismiss AND after the frontend confirms the item through
// the normal POST /api/transaction path.
const dismissPendingTransaction = async (req, res) => {
    try {
        const deleted = await PendingTransaction.findOneAndDelete({
            _id: req.params.id,
            user: req.user.id,
        });
        if (!deleted) {
            return res.status(404).json(BaseResponseDTO.error('Pending transaction not found'));
        }
        logger.info(`Dismiss pending transaction: ${req.user.id}`);
        res.status(200).json(BaseResponseDTO.success('Pending transaction dismissed'));
    } catch (error) {
        logger.error(`Dismiss pending transaction ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

const forwardingConfigured = () =>
    Boolean(EMAIL_INGEST_ADDRESS && EMAIL_INGEST_ADDRESS.includes('@'));

// Get-or-create the user's forwarding address (finan+<token>@domain)
const ensureIngestAddress = async (userId) => {
    const user = await User.findById(userId);
    if (!user) return null;

    if (!user.emailIngestToken) {
        // Retry on the (astronomically unlikely) unique-index collision
        for (let attempt = 0; attempt < 3 && !user.emailIngestToken; attempt++) {
            try {
                user.emailIngestToken = crypto.randomBytes(8).toString('hex');
                await user.save();
            } catch (e) {
                if (e.code === 11000) { user.emailIngestToken = undefined; continue; }
                throw e;
            }
        }
        if (!user.emailIngestToken) throw new Error('Could not allocate ingest token');
    }

    const [local, domain] = EMAIL_INGEST_ADDRESS.split('@');
    return `${local}+${user.emailIngestToken}@${domain}`;
};

// GET /api/email-ingest/address — the user's personal forwarding address.
const getIngestAddress = async (req, res) => {
    try {
        if (!forwardingConfigured()) {
            return res.status(503).json(BaseResponseDTO.error('Email import is not configured on this server'));
        }
        const address = await ensureIngestAddress(req.user.id);
        if (!address) return res.status(404).json(BaseResponseDTO.error('User not found'));
        res.status(200).json(BaseResponseDTO.success('Ingest address retrieved', new IngestAddressResponseDTO(address)));
    } catch (error) {
        logger.error(`Get ingest address ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

// GET /api/email-ingest/status — availability + connection state of both
// ingestion transports, in one call for the profile card.
const getIngestStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('gmailIngest emailIngestToken');
        if (!user) return res.status(404).json(BaseResponseDTO.error('User not found'));

        const forwarding = { available: forwardingConfigured(), address: null };
        if (forwarding.available) forwarding.address = await ensureIngestAddress(req.user.id);

        const gmail = { available: gmailSync.isConfigured(), status: null, email: null };
        if (gmail.available && user.gmailIngest?.refreshTokenEnc) {
            gmail.status = user.gmailIngest.status || 'connected';
            gmail.email = user.gmailIngest.email || null;
        }

        res.status(200).json(BaseResponseDTO.success('Ingest status retrieved', { forwarding, gmail }));
    } catch (error) {
        logger.error(`Get ingest status ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

// GET /api/email-ingest/gmail/connect — consent URL for the Connect Gmail button
const gmailConnect = async (req, res) => {
    try {
        if (!gmailSync.isConfigured()) {
            return res.status(503).json(BaseResponseDTO.error('Gmail import is not configured on this server'));
        }
        res.status(200).json(BaseResponseDTO.success('Gmail consent URL', { url: gmailSync.buildAuthUrl(req.user.id) }));
    } catch (error) {
        logger.error(`Gmail connect ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

// GET /api/email-ingest/gmail/callback — Google redirects here after consent.
// Browser navigation, not fetch — auth comes from the signed state JWT, and
// success/failure is communicated by redirecting back to the profile page.
const gmailCallback = async (req, res) => {
    const fail = (reason) => {
        logger.warn(`Gmail callback rejected: ${reason}`);
        res.redirect(`${FE_URL}/profile?gmail=error`);
    };
    try {
        if (!gmailSync.isConfigured()) return fail('not configured');

        const userId = gmailSync.verifyState(req.query.state);
        if (!userId) return fail('bad state');
        if (req.query.error) return fail(`consent denied (${req.query.error})`);
        if (!req.query.code) return fail('missing code');

        const tokens = await gmailSync.exchangeCode(req.query.code);
        if (!tokens.refresh_token) return fail('no refresh token in response');

        const gmailAddress = await gmailSync.fetchGmailAddress(tokens.access_token);
        await User.updateOne(
            { _id: userId },
            { $set: { gmailIngest: {
                refreshTokenEnc: vault.encrypt(tokens.refresh_token),
                email: gmailAddress,
                status: 'connected',
                connectedAt: new Date(),
                lastSyncAt: null,
            } } }
        );
        logger.info(`Gmail ingest: connected for user ${userId}`);

        // Fire-and-forget initial sync so pending items appear immediately
        User.findById(userId).select('_id gmailIngest')
            .then(u => u && gmailSync.syncUser(u))
            .catch(() => {});

        res.redirect(`${FE_URL}/profile?gmail=connected`);
    } catch (error) {
        logger.error(`Gmail callback error: ${error.message}`);
        res.redirect(`${FE_URL}/profile?gmail=error`);
    }
};

// DELETE /api/email-ingest/gmail — disconnect + best-effort token revoke
const gmailDisconnect = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('gmailIngest');
        if (!user) return res.status(404).json(BaseResponseDTO.error('User not found'));

        const enc = user.gmailIngest?.refreshTokenEnc;
        if (enc) {
            try { gmailSync.revokeToken(vault.decrypt(enc)); } catch { /* revoke is best-effort */ }
        }
        await User.updateOne({ _id: req.user.id }, { $unset: { gmailIngest: 1 } });
        logger.info(`Gmail ingest: disconnected for user ${req.user.id}`);
        res.status(200).json(BaseResponseDTO.success('Gmail disconnected'));
    } catch (error) {
        logger.error(`Gmail disconnect ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

module.exports = {
    getPendingTransactions,
    dismissPendingTransaction,
    getIngestAddress,
    getIngestStatus,
    gmailConnect,
    gmailCallback,
    gmailDisconnect,
};
