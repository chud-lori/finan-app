const mongoose = require('mongoose');
const InsightDismissal = require('../models/insightDismissal.model');
const cache = require('../helpers/cache');
const logger = require('../helpers/logger');
const {
    DismissInsightRequestDTO,
    InsightDismissalResponseDTO,
    BaseResponseDTO,
} = require('../dtos/insightDismissal.dto');

const { MAX_DISMISSALS_PER_USER } = InsightDismissal;

const stillActiveFor = (userId) => ({ user: userId, expiresAt: { $gt: new Date() } });

const listDismissals = async (req, res) => {
    try {
        const docs = await InsightDismissal.find(stillActiveFor(req.user.id))
            .sort({ updatedAt: -1 })
            .limit(MAX_DISMISSALS_PER_USER)
            .lean();
        res.status(200).json(BaseResponseDTO.success('Dismissed insights', {
            dismissals: docs.map(doc => new InsightDismissalResponseDTO(doc)),
        }));
    } catch (error) {
        logger.error(`List insight dismissals error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

const dismissInsight = async (req, res) => {
    const dto    = new DismissInsightRequestDTO(req.body || {});
    const errors = dto.validate();
    if (errors.length) {
        return res.status(400).json(BaseResponseDTO.error('Validation failed', errors));
    }

    try {
        const filter = { user: req.user.id, kind: dto.kind, subject: dto.subject };

        const alreadyDismissed = await InsightDismissal.exists(filter);
        if (!alreadyDismissed) {
            const held = await InsightDismissal.countDocuments(stillActiveFor(req.user.id));
            if (held >= MAX_DISMISSALS_PER_USER) {
                return res.status(409).json(BaseResponseDTO.error(
                    `You can hide up to ${MAX_DISMISSALS_PER_USER} insights at a time — show one again to make room`,
                ));
            }
        }

        const dismissal = await InsightDismissal.findOneAndUpdate(
            filter,
            { $set: { reason: dto.reason, expiresAt: InsightDismissal.expiryFor(dto.reason) } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        cache.invalidateUser(req.user.id);
        res.status(200).json(BaseResponseDTO.success('Insight dismissed', {
            dismissal: new InsightDismissalResponseDTO(dismissal),
        }));
    } catch (error) {
        logger.error(`Dismiss insight error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

const restoreInsight = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(BaseResponseDTO.error('Invalid dismissal id'));
    }

    try {
        const removed = await InsightDismissal.findOneAndDelete({ _id: id, user: req.user.id });
        if (!removed) {
            return res.status(404).json(BaseResponseDTO.error('Dismissal not found'));
        }
        cache.invalidateUser(req.user.id);
        res.status(200).json(BaseResponseDTO.success('Insight restored', { id: removed._id }));
    } catch (error) {
        logger.error(`Restore insight error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Internal server error'));
    }
};

module.exports = { listDismissals, dismissInsight, restoreInsight };
