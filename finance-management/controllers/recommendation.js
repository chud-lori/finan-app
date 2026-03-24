const moment = require('moment-timezone');
const Transaction = require('../models/transaction.model');
const Goal = require('../models/goal.model');
const Balance = require('../models/balance.model');
const MLInsight = require('../models/mlinsight.model');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';

const getSmartRecommendations = async (req, res) => {
    const userId = req.user.id;
    const tz     = validTz(req.query.tz);

    try {
        const now           = moment.tz(tz);
        const monthStart    = now.clone().startOf('month').toDate();
        const monthEnd      = now.clone().endOf('month').toDate();
        const threeMonthsAgo = now.clone().subtract(3, 'months').startOf('month').toDate();
        const weekAgo       = now.clone().subtract(7, 'days').toDate();

        const [thisMonthTxns, last3MonthsTxns, recentTxn, goals, balance, mlCache] = await Promise.all([
            Transaction.find({ user: userId, time: { $gte: monthStart, $lte: monthEnd } })
                .select('amount type category').lean(),
            Transaction.find({ user: userId, time: { $gte: threeMonthsAgo, $lt: monthStart } })
                .select('amount type category').lean(),
            Transaction.findOne({ user: userId }).sort({ time: -1 }).select('time').lean(),
            Goal.find({ user: userId, achieve: 0 }).select('description price savedAmount createdAt').lean(),
            Balance.findOne({ user: userId }).select('amount').lean(),
            MLInsight.findOne({ user: userId }).sort({ createdAt: -1 }).select('anomalyCount').lean(),
        ]);

        const recs = [];

        // ── 1. No transactions this week ──────────────────────────────────────
        if (!recentTxn || new Date(recentTxn.time) < weekAgo) {
            recs.push({
                id:   'no_activity',
                type: 'tip',
                icon: '📝',
                title: 'No activity logged this week',
                body:  'Regular logging keeps your data accurate and your streak alive. Add a transaction to stay on track.',
                cta:  { label: 'Add transaction', href: '/add' },
            });
        }

        // ── 2. Savings rate this month ────────────────────────────────────────
        const income  = thisMonthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = thisMonthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const savingsRate = income > 0 ? ((income - expense) / income) * 100 : null;

        if (savingsRate !== null && savingsRate >= 25) {
            recs.push({
                id:   'savings_rate_good',
                type: 'success',
                icon: '🎯',
                title: `${Math.round(savingsRate)}% savings rate this month`,
                body:  `You're saving ${Math.round(savingsRate)}% of your income — above the recommended 20%. See when you can reach financial independence.`,
                cta:  { label: 'Try FIRE Calculator', href: '/recommendation?tool=fire' },
            });
        } else if (savingsRate !== null && income > 0 && expense > income) {
            const overpct = Math.round(((expense - income) / income) * 100);
            recs.push({
                id:   'overspending_month',
                type: 'warning',
                icon: '⚠️',
                title: 'Spending exceeds income this month',
                body:  `Expenses are ${overpct}% over your income this month. The 50/30/20 rule can help you realign your spending.`,
                cta:  { label: 'Check 50/30/20 Budget', href: '/recommendation?tool=budget5030' },
            });
        }

        // ── 3. Category overspend vs 3-month average ─────────────────────────
        const catAvg  = {};
        const catThis = {};
        for (const t of last3MonthsTxns) {
            if (t.type !== 'expense') continue;
            catAvg[t.category] = (catAvg[t.category] || 0) + t.amount;
        }
        for (const cat in catAvg) catAvg[cat] /= 3;
        for (const t of thisMonthTxns) {
            if (t.type !== 'expense') continue;
            catThis[t.category] = (catThis[t.category] || 0) + t.amount;
        }

        let topCat = null, topRatio = 0;
        for (const cat in catThis) {
            const avg = catAvg[cat];
            if (!avg || avg < 1) continue;
            const ratio = catThis[cat] / avg;
            if (ratio > 1.3 && ratio > topRatio) { topRatio = ratio; topCat = cat; }
        }
        if (topCat) {
            const pct = Math.round((topRatio - 1) * 100);
            recs.push({
                id:   `overspend_${topCat}`,
                type: 'warning',
                icon: '📊',
                title: `${topCat} spending up ${pct}% this month`,
                body:  `You've spent ${pct}% more on ${topCat} than your 3-month average. Small cuts here add up quickly.`,
                cta:  { label: 'View Analytics', href: '/analytics' },
            });
        }

        // ── 4. Emergency fund nudge ───────────────────────────────────────────
        const hasEmergencyGoal = goals.some(g => /emergency/i.test(g.description));
        if (!hasEmergencyGoal) {
            const totalExp3       = last3MonthsTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            const avgMonthlyExp   = totalExp3 / 3;
            const balanceAmt      = balance?.amount ?? 0;
            const monthsCovered   = avgMonthlyExp > 0 ? balanceAmt / avgMonthlyExp : null;
            if (monthsCovered !== null && monthsCovered < 3) {
                recs.push({
                    id:   'emergency_fund',
                    type: 'tip',
                    icon: '🛡️',
                    title: 'No emergency fund detected',
                    body:  `Your balance covers ~${monthsCovered.toFixed(1)} months of expenses. Experts recommend 3–6 months as a safety net.`,
                    cta:  { label: 'Set an Emergency Fund Goal', href: '/recommendation?tool=emergency' },
                });
            }
        }

        // ── 5. Goal behind schedule ───────────────────────────────────────────
        for (const goal of goals) {
            const daysSince   = moment().diff(moment(goal.createdAt), 'days');
            // Assume 90-day default window; clamp at 1.0
            const expected    = goal.price * Math.min(daysSince / 90, 1);
            const actual      = goal.savedAmount || 0;
            if (expected > 0 && actual < expected * 0.7) {
                const pct = Math.round((actual / goal.price) * 100);
                recs.push({
                    id:   `goal_behind_${goal._id}`,
                    type: 'warning',
                    icon: '🎯',
                    title: `"${goal.description}" is ${pct}% funded`,
                    body:  'This goal is a bit behind schedule. Adding even a small amount now builds momentum.',
                    cta:  { label: 'Add savings', href: '/recommendation?tool=goal' },
                });
                break; // surface at most one goal warning
            }
        }

        // ── 6. ML anomaly alert ───────────────────────────────────────────────
        if (mlCache?.anomalyCount > 0) {
            recs.push({
                id:   'ml_anomaly',
                type: 'info',
                icon: '🔍',
                title: `${mlCache.anomalyCount} unusual transaction${mlCache.anomalyCount > 1 ? 's' : ''} detected`,
                body:  'AI analysis flagged some spending patterns that look out of the ordinary. Review your Insights for details.',
                cta:  { label: 'View AI Insights', href: '/insights' },
            });
        }

        // Prioritise: warning → info → success → tip; cap at 5
        const sorted = [
            ...recs.filter(r => r.type === 'warning'),
            ...recs.filter(r => r.type === 'info'),
            ...recs.filter(r => r.type === 'success'),
            ...recs.filter(r => r.type === 'tip'),
        ].slice(0, 5);

        return res.json({ status: 1, data: { recommendations: sorted } });
    } catch {
        return res.status(500).json({ status: 0, message: 'Failed to compute recommendations' });
    }
};

module.exports = { getSmartRecommendations };
