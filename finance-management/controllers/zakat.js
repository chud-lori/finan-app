const moment      = require('moment-timezone');
const NetWorth    = require('../models/netWorth.model');
const Category    = require('../models/category.model');
const Transaction = require('../models/transaction.model');
const { estimateZakat } = require('../helpers/zakat');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';

/**
 * GET /api/recommendations/zakat
 *
 * Estimates zakat-maal (2.5% of the zakatable base derived from NetWorth
 * holdings) and tracks this year's giving in `social`-group categories
 * (zakat / donation / sharing) against it. The output is an ESTIMATE — nisab and
 * haul nuance are not modelled — which the FE labels clearly. Optional and
 * dismissible, including for non-Muslim users.
 *
 * Query: `?tz=IANA` for the year boundary; `?nisab=<amount>` to apply an explicit
 * nisab threshold (below it, nothing is due).
 */
const getZakat = async (req, res) => {
    const userId   = req.user.id;
    const tz       = validTz(req.query.tz);
    const nisabRaw = Number(req.query.nisab);
    const nisab    = Number.isFinite(nisabRaw) && nisabRaw > 0 ? nisabRaw : null;

    try {
        const now       = moment.tz(tz);
        const yearStart = now.clone().startOf('year').toDate();

        const [holdings, socialCats] = await Promise.all([
            NetWorth.findOne({ user: userId }).select('assets liabilities').lean(),
            Category.find({ user: userId, group: 'social' }).select('name').lean(),
        ]);

        // Giving YTD = this year's expense transactions in social-group categories.
        // Category and transaction category names are both stored lowercase, so an
        // exact `$in` match is correct and indexed-friendly.
        const socialCategoryNames = socialCats.map(c => c.name);
        let givingYtd = 0;
        if (socialCategoryNames.length) {
            const giving = await Transaction.find({
                user:     userId,
                type:     'expense',
                time:     { $gte: yearStart },
                category: { $in: socialCategoryNames },
            }).select('amount').lean();
            givingYtd = giving.reduce((s, t) => s + t.amount, 0);
        }

        const estimate = estimateZakat(holdings || { assets: [], liabilities: [] }, givingYtd, nisab);

        return res.json({
            status: 1,
            data: {
                ...estimate,
                year:             now.format('YYYY'),
                hasHoldings:      Boolean(holdings),
                socialCategories: socialCategoryNames,
            },
        });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to estimate zakat' });
    }
};

module.exports = { getZakat };
