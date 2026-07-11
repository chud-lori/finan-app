const crypto = require('crypto');
const PendingTransaction = require('../models/pendingTransaction.model');
const User = require('../models/user.model');
const logger = require('../helpers/logger');
const { EMAIL_INGEST_ADDRESS } = require('../config/keys');
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

// GET /api/email-ingest/address — the user's personal forwarding address
// (finan+<token>@domain). Generates the token on first call.
const getIngestAddress = async (req, res) => {
    try {
        if (!EMAIL_INGEST_ADDRESS || !EMAIL_INGEST_ADDRESS.includes('@')) {
            return res.status(503).json(BaseResponseDTO.error('Email import is not configured on this server'));
        }
        let user = await User.findById(req.user.id);
        if (!user) return res.status(404).json(BaseResponseDTO.error('User not found'));

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
        const address = `${local}+${user.emailIngestToken}@${domain}`;
        res.status(200).json(BaseResponseDTO.success('Ingest address retrieved', new IngestAddressResponseDTO(address)));
    } catch (error) {
        logger.error(`Get ingest address ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

module.exports = {
    getPendingTransactions,
    dismissPendingTransaction,
    getIngestAddress,
};
