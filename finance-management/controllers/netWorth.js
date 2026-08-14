const moment = require('moment-timezone');
const NetWorth = require('../models/netWorth.model');
const NetWorthSnapshot = require('../models/netWorthSnapshot.model');
const Balance = require('../models/balance.model');
const logger = require('../helpers/logger');
const {
    UpdateNetWorthRequestDTO,
    NetWorthResponseDTO,
    NetWorthHistoryResponseDTO,
    BaseResponseDTO,
    sumHoldings,
} = require('../dtos/netWorth.dto');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';
const currentYearMonth = (tz) => moment.tz(tz).format('YYYY-MM');

const MAX_HISTORY = 60; // 5 years of monthly points — plenty for a trend line

/**
 * GET /api/networth
 *
 * Returns the user's holdings and the derived net worth. A user who has never
 * saved holdings gets a seed suggestion built from the app's cash Balance so
 * the editor is not empty on first open. That seed is NOT persisted — GET stays
 * read-only, and the row only becomes real once the user saves via PUT. Balance
 * itself is only ever read here; it is written exclusively by the transaction
 * controller's atomic $inc.
 */
const getNetWorth = async (req, res) => {
    try {
        const userId = req.user.id;
        const doc = await NetWorth.findOne({ user: userId }).lean();

        if (doc) {
            return res.json(BaseResponseDTO.success('Net worth retrieved', new NetWorthResponseDTO(doc)));
        }

        const balance = await Balance.findOne({ user: userId }).select('amount').lean();
        const seedAssets = balance && balance.amount > 0
            ? [{ label: 'Cash balance', amount: Math.round(balance.amount), type: 'cash' }]
            : [];

        const payload = new NetWorthResponseDTO({ assets: seedAssets, liabilities: [] });
        payload.seeded = true; // never saved yet — the FE marks this as a draft

        return res.json(BaseResponseDTO.success('Net worth retrieved', payload));
    } catch (err) {
        logger.error(`Get net worth error: ${err.message}`);
        return res.status(500).json(BaseResponseDTO.error('Failed to get net worth'));
    }
};

/**
 * PUT /api/networth
 *
 * Replaces the holdings, recomputes the totals, and upserts the current
 * month's snapshot. Upsert (not insert) is deliberate: editing holdings three
 * times in August must leave one August point on the trend, not three.
 */
const updateNetWorth = async (req, res) => {
    try {
        const userId = req.user.id;
        const dto = new UpdateNetWorthRequestDTO(req.body || {});
        const errors = dto.validate();
        if (errors.length > 0) {
            return res.status(400).json(BaseResponseDTO.error('Validation failed', errors));
        }

        const patch = {};
        if (dto.assets      !== undefined) patch.assets      = dto.assets;
        if (dto.liabilities !== undefined) patch.liabilities = dto.liabilities;

        const doc = await NetWorth.findOneAndUpdate(
            { user: userId },
            { $set: patch, $setOnInsert: { user: userId } },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();

        const totalAssets      = sumHoldings(doc.assets);
        const totalLiabilities = sumHoldings(doc.liabilities);
        const netWorth         = totalAssets - totalLiabilities;
        const yearMonth        = currentYearMonth(validTz(req.query.tz));

        await NetWorthSnapshot.updateOne(
            { user: userId, yearMonth },
            { $set: { assets: totalAssets, liabilities: totalLiabilities, netWorth } },
            { upsert: true }
        );

        const payload = new NetWorthResponseDTO(doc);
        payload.snapshotMonth = yearMonth;

        return res.json(BaseResponseDTO.success('Net worth updated', payload));
    } catch (err) {
        logger.error(`Update net worth error: ${err.message}`);
        return res.status(500).json(BaseResponseDTO.error('Failed to update net worth'));
    }
};

/**
 * GET /api/networth/history — monthly snapshots, oldest first, for the trend line.
 */
const getNetWorthHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const requested = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requested) && requested > 0
            ? Math.min(requested, MAX_HISTORY)
            : 12;

        // Sort descending to take the most recent `limit` months, then flip so
        // the chart reads left-to-right in chronological order.
        const snapshots = await NetWorthSnapshot.find({ user: userId })
            .sort({ yearMonth: -1 })
            .limit(limit)
            .select('yearMonth assets liabilities netWorth')
            .lean();

        return res.json(BaseResponseDTO.success(
            'Net worth history retrieved',
            new NetWorthHistoryResponseDTO(snapshots.reverse())
        ));
    } catch (err) {
        logger.error(`Get net worth history error: ${err.message}`);
        return res.status(500).json(BaseResponseDTO.error('Failed to get net worth history'));
    }
};

module.exports = { getNetWorth, updateNetWorth, getNetWorthHistory };
