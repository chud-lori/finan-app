const moment = require('moment-timezone');
const User = require('../models/user.model');
const Goal = require('../models/goal.model');
const Balance = require('../models/balance.model');
const Budget = require('../models/budget.model');
const Transaction = require('../models/transaction.model');
const logger = require('../helpers/logger');
const { BaseResponseDTO } = require('../dtos/transaction.dto');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';

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
        const [goals, balance] = await Promise.all([
            Goal.find({ user: userId }).sort({ createdAt: -1 }),
            Balance.findOne({ user: userId }),
        ]);

        const MILESTONES = [25, 50, 75, 100];
        const savings = (balance?.amount ?? 0) * 0.2; // 20% of balance allocated toward goals

        const goalMilestones = goals.map(g => {
            const pct = g.price > 0 ? Math.min(100, (savings / g.price) * 100) : 0;
            // Highest milestone crossed
            const milestone = [...MILESTONES].reverse().find(m => pct >= m) || 0;
            return {
                id: g._id,
                description: g.description,
                price: g.price,
                progress: Math.round(pct),
                milestone,
                achieved: g.achieve === 1,
            };
        });

        return res.json(BaseResponseDTO.success('Gamification summary retrieved', {
            streak,
            budgetWin,
            goals: goalMilestones,
        }));
    } catch (err) {
        logger.error(`getGamificationSummary ${req.user?.id} error: ${err.message}`);
        return res.status(500).json(BaseResponseDTO.error('Failed to load gamification summary'));
    }
};

module.exports = { getGamificationSummary };
