const moment      = require('moment-timezone');
const Transaction = require('../models/transaction.model');
const Goal        = require('../models/goal.model');
const Allocation  = require('../models/allocation.model');
const { detectWindfall } = require('../helpers/windfall');
const { GoalResponseDTO } = require('../dtos/goal.dto');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';

const LOOKBACK_DAYS = 45;  // a windfall must have landed inside this recent window
const BASELINE_DAYS = 365; // income history used to learn what "usual" looks like

const getWindfall = async (req, res) => {
    const userId = req.user.id;
    const tz     = validTz(req.query.tz);

    try {
        const now           = moment.tz(tz);
        const windowStart   = now.clone().subtract(LOOKBACK_DAYS, 'days').toDate();
        const baselineStart = now.clone().subtract(BASELINE_DAYS, 'days').toDate();

        const [recentIncome, baselineIncome, goals] = await Promise.all([
            Transaction.find({ user: userId, type: 'income', time: { $gte: windowStart } })
                .select('amount time').lean(),
            Transaction.find({ user: userId, type: 'income', time: { $gte: baselineStart } })
                .select('amount').lean(),
            Goal.find({ user: userId })
                .select('description price savedAmount achieve createdAt updatedAt').lean(),
        ]);

        const windfall = detectWindfall(recentIncome, baselineIncome.map(t => t.amount));

        let allocations = [];
        let allocated   = 0;
        if (windfall) {
            allocations = await Allocation.find({ user: userId, source: 'windfall', sourceKey: windfall.transactionId })
                .select('goal amount createdAt').lean();
            allocated = allocations.reduce((s, a) => s + a.amount, 0);
        }

        const activeGoals = goals.filter(g => g.achieve !== 1).map(g => new GoalResponseDTO(g));

        return res.json({
            status: 1,
            data: {
                windfall: windfall
                    ? {
                        ...windfall,
                        allocated,
                        remaining: Math.max(windfall.amount - allocated, 0),
                        handled:   allocated > 0,
                    }
                    : null,
                goals:       activeGoals,
                allocations: allocations.map(a => ({ goal: a.goal, amount: a.amount, createdAt: a.createdAt })),
            },
        });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to detect windfall' });
    }
};

module.exports = { getWindfall };
