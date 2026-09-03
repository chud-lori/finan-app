const moment = require('moment-timezone');
const Transaction = require('../models/transaction.model');
const Goal = require('../models/goal.model');
const Balance = require('../models/balance.model');
const MLInsight = require('../models/mlinsight.model');
const Snapshot = require('../models/snapshot.model');
const Allocation = require('../models/allocation.model');
const NetWorth = require('../models/netWorth.model');
const { lookAhead } = require('../helpers/seasonalRadar');
const { detectWindfall } = require('../helpers/windfall');
const { materialityFloor, isMaterial } = require('../helpers/materiality');

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

        const [thisMonthTxns, last3MonthsTxns, recentTxn, goals, balance, mlCache, snapshots, netWorthDoc] = await Promise.all([
            Transaction.find({ user: userId, time: { $gte: monthStart, $lte: monthEnd } })
                .select('amount type category').lean(),
            Transaction.find({ user: userId, time: { $gte: threeMonthsAgo, $lt: monthStart } })
                .select('amount type category').lean(),
            Transaction.findOne({ user: userId }).sort({ time: -1 }).select('time').lean(),
            // Must include achieved goals, or completing the emergency fund resurrects the nudge.
            Goal.find({ user: userId }).select('description price savedAmount achieve createdAt kind').lean(),
            Balance.findOne({ user: userId }).select('amount').lean(),
            MLInsight.findOne({ user: userId }).sort({ createdAt: -1 }).select('anomalyCount').lean(),
            Snapshot.find({ user: userId }).select('yearMonth expense').lean(),
            NetWorth.findOne({ user: userId }).select('assets').lean(),
        ]);

        const recs = [];

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

        const income  = thisMonthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = thisMonthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const savingsRate = income > 0 ? ((income - expense) / income) * 100 : null;

        const totalExpense3     = last3MonthsTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const avgMonthlyExpense = totalExpense3 / 3;
        const floor             = materialityFloor(expense, avgMonthlyExpense);

        if (savingsRate !== null && savingsRate >= 25) {
            recs.push({
                id:   'savings_rate_good',
                type: 'success',
                icon: '🎯',
                title: `${Math.round(savingsRate)}% savings rate this month`,
                body:  `You're saving ${Math.round(savingsRate)}% of your income — above the recommended 20%. See when you can reach financial independence.`,
                cta:  { label: 'Try FIRE Calculator', href: '/recommendation?tool=fire' },
            });
        } else if (savingsRate !== null && income > 0 && expense > income && isMaterial(expense - income, floor)) {
            recs.push({
                id:   'overspending_month',
                type: 'warning',
                icon: '⚠️',
                title: 'Spending exceeds income this month',
                body:  'You\'ve spent more than you earned this month. The 50/30/20 rule can help you realign your spending.',
                figures: { from: Math.round(income), to: Math.round(expense), fromLabel: 'earned', toLabel: 'spent' },
                cta:  { label: 'Check 50/30/20 Budget', href: '/recommendation?tool=budget5030' },
            });
        }

        const catAvg   = {};
        const catThis  = {};
        const catCount = {};
        for (const t of last3MonthsTxns) {
            if (t.type !== 'expense') continue;
            catAvg[t.category] = (catAvg[t.category] || 0) + t.amount;
        }
        for (const cat in catAvg) catAvg[cat] /= 3;
        for (const t of thisMonthTxns) {
            if (t.type !== 'expense') continue;
            catThis[t.category]  = (catThis[t.category] || 0) + t.amount;
            catCount[t.category] = (catCount[t.category] || 0) + 1;
        }

        let topCat = null, topExcess = 0;
        for (const cat in catThis) {
            const avg = catAvg[cat];
            if (!avg || avg < 1) continue;
            const excess = catThis[cat] - avg;
            if (catThis[cat] / avg <= 1.3) continue;
            if (!isMaterial(excess, floor)) continue;
            if (excess <= topExcess) continue;
            topExcess = excess; topCat = cat;
        }
        if (topCat) {
            const restsOnOnePurchase = catCount[topCat] === 1;
            recs.push({
                id:   `overspend_${topCat}`,
                type: restsOnOnePurchase ? 'info' : 'warning',
                icon: '📊',
                title: restsOnOnePurchase
                    ? `One ${topCat} purchase drove this month`
                    : `${topCat} is running above your usual`,
                body:  restsOnOnePurchase
                    ? `A single ${topCat} purchase put this month above your 3-month average — a one-off, not a new habit.`
                    : `You've spent more on ${topCat} than your 3-month average. Small cuts here add up quickly.`,
                figures: { from: Math.round(catAvg[topCat]), to: Math.round(catThis[topCat]), fromLabel: '3-month average', toLabel: 'this month', count: catCount[topCat] },
                cta:  { label: 'View Analytics', href: '/analytics' },
            });
        }

        // Suppressed only by structured state (emergency_fund asset row or kind='emergency' goal) — never match on name here.
        const hasEmergencyGoal = (netWorthDoc?.assets || []).some(a => a.type === 'emergency_fund')
            || goals.some(g => g.kind === 'emergency');
        if (!hasEmergencyGoal) {
            const balanceAmt      = balance?.amount ?? 0;
            const monthsCovered   = avgMonthlyExpense > 0 ? balanceAmt / avgMonthlyExpense : null;
            if (monthsCovered !== null && monthsCovered < 3) {
                const params = new URLSearchParams({
                    tool:    'emergency',
                    monthly: String(Math.round(avgMonthlyExpense)),
                    saved:   String(Math.max(Math.round(balanceAmt), 0)),
                });
                recs.push({
                    id:   'emergency_fund',
                    type: 'tip',
                    icon: '🛡️',
                    title: 'Emergency fund under 3 months',
                    body:  `Your balance covers ~${monthsCovered.toFixed(1)} months of expenses. Experts recommend 3–6 months as a safety net.`,
                    cta:  { label: 'Plan & save this goal', href: `/recommendation?${params.toString()}` },
                });
            }
        }

        for (const goal of goals.filter(g => g.achieve !== 1)) {
            const daysSince   = moment().diff(moment(goal.createdAt), 'days');
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

        // The CTA creates the seasonal-fund Goal that suppresses this nudge.
        const hasSeasonalGoal = goals.some(g => /ramadan|lebaran|thr|hari raya|seasonal|holiday|festive/i.test(g.description || ''));
        if (!hasSeasonalGoal) {
            const ahead = lookAhead(snapshots, { year: now.year(), month: now.month() + 1 }, 2);
            if (ahead) {
                const when = ahead.monthsAway === 1 ? 'next month' : `in ${ahead.monthsAway} months`;
                const params = new URLSearchParams({ tool: 'goal' });
                let body;
                let figures = null;
                if (ahead.coldStart || ahead.suggestedSetAside == null) {
                    body = `${ahead.monthName} tends to be a higher-spending stretch${ahead.label ? ` (${ahead.label})` : ''}. Setting a little aside now softens the hit.`;
                } else {
                    params.set('desc', `${ahead.monthName} set-aside`);
                    params.set('target', String(ahead.suggestedSetAside));
                    body = `You usually spend more than a normal month in ${ahead.monthName}. Putting this aside ${when} keeps ${ahead.label || 'the season'} from denting your budget.`;
                    figures = { amount: Math.round(ahead.suggestedSetAside), amountLabel: 'suggested set-aside' };
                }
                recs.push({
                    id:   'seasonal_lookahead',
                    type: 'tip',
                    icon: '🗓️',
                    title: `${ahead.monthName} spike coming — set aside early`,
                    body,
                    ...(figures ? { figures } : {}),
                    cta:  { label: 'Plan a set-aside goal', href: `/recommendation?${params.toString()}` },
                });
            }
        }

        // The CTA's one-tap sweep writes the Allocation that suppresses this nudge; nothing is auto-moved.
        const activeGoals = goals.filter(g => g.achieve !== 1);
        if (activeGoals.length > 0) {
            const lastMonthYM = now.clone().subtract(1, 'month').format('YYYY-MM');
            const [lastSnap, alreadySwept] = await Promise.all([
                Snapshot.findOne({ user: userId, yearMonth: lastMonthYM }).select('income expense').lean(),
                Allocation.exists({ user: userId, source: 'surplus', sourceKey: lastMonthYM }),
            ]);
            const surplus = lastSnap ? Math.round((lastSnap.income || 0) - (lastSnap.expense || 0)) : 0;
            if (lastSnap && lastSnap.income > 0 && surplus > 0 && isMaterial(surplus, floor) && !alreadySwept) {
                // Amount stays in the CTA params — the server never embeds a formatted currency figure.
                const params = new URLSearchParams({
                    tool:   'goal',
                    sweep:  lastMonthYM,
                    amount: String(surplus),
                });
                recs.push({
                    id:   'surplus_sweep',
                    type: 'tip',
                    icon: '💰',
                    title: 'You had a surplus last month',
                    body:  'You spent less than you earned last month. Sweep some of that surplus into a goal before it blends into this month\'s spending — it stays your money, just earmarked.',
                    figures: { amount: surplus, amountLabel: 'surplus last month' },
                    cta:  { label: 'Sweep surplus to a goal', href: `/recommendation?${params.toString()}` },
                });
            }

            // Suppressed once an Allocation exists for that income — the Windfall Planner writes it.
            const windowStart   = now.clone().subtract(45, 'days').toDate();
            const baselineStart = now.clone().subtract(365, 'days').toDate();
            const [recentIncome, baselineIncome] = await Promise.all([
                Transaction.find({ user: userId, type: 'income', time: { $gte: windowStart } })
                    .select('amount time').lean(),
                Transaction.find({ user: userId, type: 'income', time: { $gte: baselineStart } })
                    .select('amount').lean(),
            ]);
            const windfall = detectWindfall(recentIncome, baselineIncome.map(t => t.amount));
            if (windfall) {
                const handled = await Allocation.exists({ user: userId, source: 'windfall', sourceKey: windfall.transactionId });
                if (!handled) {
                    recs.push({
                        id:   `windfall_${windfall.transactionId}`,
                        type: 'info',
                        icon: '🎁',
                        title: 'Large income just landed',
                        body:  'A recent deposit is well above your usual income — a bonus or THR, perhaps. Plan a split into your goals before it gets absorbed into everyday spending.',
                        cta:  { label: 'Plan your windfall', href: '/recommendation?tool=windfall' },
                    });
                }
            }
        }

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
