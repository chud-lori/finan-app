const moment = require('moment-timezone');
const User = require('../models/user.model');
const Goal = require('../models/goal.model');
const Budget = require('../models/budget.model');
const Balance = require('../models/balance.model');
const Transaction = require('../models/transaction.model');
const logger = require('../helpers/logger');
const { computeFinancialHealth } = require('../helpers/financialHealth');
const { getSavingsCategoryNames } = require('../helpers/savingsCategories');
const { BaseResponseDTO } = require('../dtos/transaction.dto');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';

// Each pillar is null when it can't be measured, so the score renormalizes.
const computeHealth = async (userId, tz) => {
    const now = moment.tz(tz);
    const monthStart = now.clone().startOf('month').toDate();
    const threeMonthsAgo = now.clone().subtract(3, 'months').startOf('month').toDate();
    const sixMonthsAgo = now.clone().subtract(6, 'months').startOf('month').toDate();
    const yearMonth = now.format('YYYY-MM');

    const [trailingTxns, sixMoExpenseTxns, monthExpenseTxns, balanceDoc, budgetDoc, goals, savingsNames] = await Promise.all([
        Transaction.find({ user: userId, time: { $gte: threeMonthsAgo, $lt: monthStart } }).select('amount type category').lean(),
        Transaction.find({ user: userId, type: 'expense', time: { $gte: sixMonthsAgo, $lt: monthStart } }).select('amount time category').lean(),
        Transaction.find({ user: userId, type: 'expense', time: { $gte: monthStart } }).select('amount category').lean(),
        Balance.findOne({ user: userId }).select('amount').lean(),
        Budget.findOne({ user: userId, yearMonth }).lean(),
        Goal.find({ user: userId, achieve: { $ne: 1 } }).select('price savedAmount').lean(),
        getSavingsCategoryNames(userId),
    ]);

    // Savings-group outflow is retained, not spent — exclude it from every expense figure below.
    const isSavings = (t) => savingsNames.has((t.category || '').toLowerCase());

    // savingsRate = (income − nonSavingsExpense) / income.
    const trailIncome  = trailingTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const trailExpense = trailingTxns
        .filter(t => t.type === 'expense' && !isSavings(t))
        .reduce((s, t) => s + t.amount, 0);
    const savingsRate = trailIncome > 0 ? (trailIncome - trailExpense) / trailIncome : null;

    // Investing is not a cost you must cover in an emergency, so it doesn't shrink the runway.
    const nonSavingsSixMo = sixMoExpenseTxns.filter(t => !isSavings(t));
    const monthsWithExpense = new Set(nonSavingsSixMo.map(t => moment(t.time).tz(tz).format('YYYY-MM'))).size;
    const avgMonthlyExpense = monthsWithExpense > 0
        ? nonSavingsSixMo.reduce((s, t) => s + t.amount, 0) / monthsWithExpense
        : null;
    const balanceAmt = balanceDoc?.amount ?? 0;
    const emergencyMonths = avgMonthlyExpense && avgMonthlyExpense > 0 ? Math.max(balanceAmt, 0) / avgMonthlyExpense : null;

    let budgetPaceRatio = null;
    if (budgetDoc && budgetDoc.amount > 0) {
        const spentSoFar = monthExpenseTxns.filter(t => !isSavings(t)).reduce((s, t) => s + t.amount, 0);
        const expectedByNow = budgetDoc.amount * (now.date() / now.daysInMonth());
        budgetPaceRatio = expectedByNow > 0 ? spentSoFar / expectedByNow : (spentSoFar > 0 ? 2 : 0);
    }

    const progresses = goals.filter(g => g.price > 0).map(g => (g.savedAmount ?? 0) / g.price);
    const avgGoalProgress = progresses.length ? progresses.reduce((s, p) => s + p, 0) / progresses.length : null;

    return computeFinancialHealth({ savingsRate, emergencyMonths, budgetPaceRatio, avgGoalProgress });
};

const getGamificationSummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const tz = validTz(req.query.tz);

        const user = await User.findById(userId).select('streakDays streakLastDate longestStreak');
        const today = moment.tz(tz).format('YYYY-MM-DD');
        const todayLogged = user?.streakLastDate === today;

        // Not yesterday or today = broken streak, report 0
        const yesterday = moment.tz(today, 'YYYY-MM-DD', tz).subtract(1, 'day').format('YYYY-MM-DD');
        const streakActive = user?.streakLastDate === today || user?.streakLastDate === yesterday;
        const currentStreak = streakActive ? (user?.streakDays || 0) : 0;

        const streak = {
            current: currentStreak,
            longest: user?.longestStreak || 0,
            todayLogged,
        };

        const prevMonth = moment.tz(tz).subtract(1, 'month').format('YYYY-MM');
        const prevStart = moment.tz(prevMonth, 'YYYY-MM', tz).startOf('month').toDate();
        const prevEnd   = moment.tz(prevMonth, 'YYYY-MM', tz).endOf('month').toDate();

        const [budgetDoc, prevTxns] = await Promise.all([
            Budget.findOne({ user: userId, yearMonth: prevMonth }),
            Transaction.find({
                user: userId,
                type: 'expense',
                time: { $gte: prevStart, $lte: prevEnd },
            }).select('amount'),
        ]);

        let budgetWin = null;
        if (budgetDoc && budgetDoc.amount > 0) {
            const spent = prevTxns.reduce((sum, t) => sum + t.amount, 0);
            if (spent < budgetDoc.amount) {
                budgetWin = {
                    month: prevMonth,
                    spent,
                    budget: budgetDoc.amount,
                    saved: budgetDoc.amount - spent,
                    won: true,
                };
            }
        }

        const goals = await Goal.find({ user: userId }).sort({ achieve: 1, createdAt: -1 });

        const MILESTONES = [25, 50, 75, 100];

        const goalMilestones = goals.map(g => {
            const saved = g.savedAmount ?? 0;
            const pct = g.price > 0 ? Math.min(100, (saved / g.price) * 100) : 0;
            const milestone = [...MILESTONES].reverse().find(m => pct >= m) || 0;
            return {
                id: g._id,
                description: g.description,
                price: g.price,
                savedAmount: saved,
                progress: Math.round(pct),
                milestone,
                achieved: g.achieve === 1,
            };
        });

        const health = await computeHealth(userId, tz);

        return res.json(BaseResponseDTO.success('Gamification summary retrieved', {
            streak,
            budgetWin,
            goals: goalMilestones,
            health,
        }));
    } catch (err) {
        logger.error(`getGamificationSummary ${req.user?.id} error: ${err.message}`);
        return res.status(500).json(BaseResponseDTO.error('Failed to load gamification summary'));
    }
};

module.exports = { getGamificationSummary, computeHealth };
