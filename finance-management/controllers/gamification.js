const moment = require('moment-timezone');
const User = require('../models/user.model');
const Goal = require('../models/goal.model');
const Budget = require('../models/budget.model');
const Balance = require('../models/balance.model');
const Transaction = require('../models/transaction.model');
const logger = require('../helpers/logger');
const { computeFinancialHealth } = require('../helpers/financialHealth');
const { BaseResponseDTO } = require('../dtos/transaction.dto');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';

// Gather the four financial-health pillars for a user and score them.
// Each input is null when it can't be measured, so the score renormalizes.
const computeHealth = async (userId, tz) => {
    const now = moment.tz(tz);
    const monthStart = now.clone().startOf('month').toDate();
    const threeMonthsAgo = now.clone().subtract(3, 'months').startOf('month').toDate();
    const sixMonthsAgo = now.clone().subtract(6, 'months').startOf('month').toDate();
    const yearMonth = now.format('YYYY-MM');

    const [trailingTxns, sixMoExpenseTxns, monthExpenseTxns, balanceDoc, budgetDoc, goals] = await Promise.all([
        // Trailing 3 complete months → a stable savings rate.
        Transaction.find({ user: userId, time: { $gte: threeMonthsAgo, $lt: monthStart } }).select('amount type').lean(),
        Transaction.find({ user: userId, type: 'expense', time: { $gte: sixMonthsAgo, $lt: monthStart } }).select('amount time').lean(),
        Transaction.find({ user: userId, type: 'expense', time: { $gte: monthStart } }).select('amount').lean(),
        Balance.findOne({ user: userId }).select('amount').lean(),
        Budget.findOne({ user: userId, yearMonth }).lean(),
        Goal.find({ user: userId, achieve: { $ne: 1 } }).select('price savedAmount').lean(),
    ]);

    // Savings rate over the trailing window.
    const trailIncome  = trailingTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const trailExpense = trailingTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const savingsRate = trailIncome > 0 ? (trailIncome - trailExpense) / trailIncome : null;

    // Emergency fund = balance ÷ average monthly expense over 6 complete months.
    const monthsWithExpense = new Set(sixMoExpenseTxns.map(t => moment(t.time).tz(tz).format('YYYY-MM'))).size;
    const avgMonthlyExpense = monthsWithExpense > 0
        ? sixMoExpenseTxns.reduce((s, t) => s + t.amount, 0) / monthsWithExpense
        : null;
    const balanceAmt = balanceDoc?.amount ?? 0;
    const emergencyMonths = avgMonthlyExpense && avgMonthlyExpense > 0 ? Math.max(balanceAmt, 0) / avgMonthlyExpense : null;

    // Budget pace = spent so far this month ÷ expected by now.
    let budgetPaceRatio = null;
    if (budgetDoc && budgetDoc.amount > 0) {
        const spentSoFar = monthExpenseTxns.reduce((s, t) => s + t.amount, 0);
        const expectedByNow = budgetDoc.amount * (now.date() / now.daysInMonth());
        budgetPaceRatio = expectedByNow > 0 ? spentSoFar / expectedByNow : (spentSoFar > 0 ? 2 : 0);
    }

    // Average progress across active goals.
    const progresses = goals.filter(g => g.price > 0).map(g => (g.savedAmount ?? 0) / g.price);
    const avgGoalProgress = progresses.length ? progresses.reduce((s, p) => s + p, 0) / progresses.length : null;

    return computeFinancialHealth({ savingsRate, emergencyMonths, budgetPaceRatio, avgGoalProgress });
};

const getGamificationSummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const tz = validTz(req.query.tz);

        // ── Streak ──────────────────────────────────────────────────────────
        const user = await User.findById(userId).select('streakDays streakLastDate longestStreak');
        const today = moment.tz(tz).format('YYYY-MM-DD');
        const todayLogged = user?.streakLastDate === today;

        // If last activity was not yesterday or today, streak is broken — report 0
        const yesterday = moment.tz(today, 'YYYY-MM-DD', tz).subtract(1, 'day').format('YYYY-MM-DD');
        const streakActive = user?.streakLastDate === today || user?.streakLastDate === yesterday;
        const currentStreak = streakActive ? (user?.streakDays || 0) : 0;

        const streak = {
            current: currentStreak,
            longest: user?.longestStreak || 0,
            todayLogged,
        };

        // ── Budget Win (previous month) ──────────────────────────────────────
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

        // ── Goal Milestones ─────────────────────────────────────────────────
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

        // ── Financial Health Score ───────────────────────────────────────────
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
