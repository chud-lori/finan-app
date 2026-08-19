const moment      = require('moment-timezone');
const NetWorth    = require('../models/netWorth.model');
const Category    = require('../models/category.model');
const Transaction = require('../models/transaction.model');
const { estimateZakat } = require('../helpers/zakat');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';

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

        // Category names are stored lowercase on both sides, so an exact `$in` match is correct.
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
