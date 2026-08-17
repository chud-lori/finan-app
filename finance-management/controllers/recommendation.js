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
            // All goals — the emergency-fund check must also see achieved ones,
            // otherwise completing the goal makes the nudge reappear.
            Goal.find({ user: userId }).select('description price savedAmount achieve createdAt').lean(),
            Balance.findOne({ user: userId }).select('amount').lean(),
            MLInsight.findOne({ user: userId }).sort({ createdAt: -1 }).select('anomalyCount').lean(),
            // Monthly history for the Seasonal Radar look-ahead nudge.
            Snapshot.find({ user: userId }).select('yearMonth expense').lean(),
            // Holdings — an emergency fund declared as a net-worth asset row
            // suppresses the emergency-fund nudge just like a goal does.
            NetWorth.findOne({ user: userId }).select('assets').lean(),
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
        // Suppressed once the user has *any* emergency-fund goal (achieved or not)
        // OR a net-worth asset row that reads as an emergency fund — both are
        // persistent records of "I have this covered", and nagging past either
        // trains users to ignore nudges. Bilingual match: "dana darurat" is the
        // standard Indonesian term.
        const EMERGENCY_RE = /emergency|darurat/i;
        const hasEmergencyGoal = goals.some(g => EMERGENCY_RE.test(g.description || ''))
            || (netWorthDoc?.assets || []).some(a => EMERGENCY_RE.test(a.label || ''));
        if (!hasEmergencyGoal) {
            const totalExp3       = last3MonthsTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            const avgMonthlyExp   = totalExp3 / 3;
            const balanceAmt      = balance?.amount ?? 0;
            const monthsCovered   = avgMonthlyExp > 0 ? balanceAmt / avgMonthlyExp : null;
            if (monthsCovered !== null && monthsCovered < 3) {
                const params = new URLSearchParams({
                    tool:    'emergency',
                    monthly: String(Math.round(avgMonthlyExp)),
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

        // ── 5. Goal behind schedule ───────────────────────────────────────────
        for (const goal of goals.filter(g => g.achieve !== 1)) {
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

        // ── 7. Seasonal Radar look-ahead ──────────────────────────────────────
        // Pre-warn before a personal seasonal spike (Ramadan/Lebaran/holidays,
        // learned from the user's own snapshot history with an in-process Hijri
        // prior) with a suggested set-aside. Suppressed once the user has a Goal
        // whose description reads as a seasonal fund — the CTA creates exactly that
        // state, so the nudge is dismissible instead of nagging forever.
        const hasSeasonalGoal = goals.some(g => /ramadan|lebaran|thr|hari raya|seasonal|holiday|festive/i.test(g.description || ''));
        if (!hasSeasonalGoal) {
            const ahead = lookAhead(snapshots, { year: now.year(), month: now.month() + 1 }, 2);
            if (ahead) {
                const when = ahead.monthsAway === 1 ? 'next month' : `in ${ahead.monthsAway} months`;
                const params = new URLSearchParams({ tool: 'goal' });
                let body;
                if (ahead.coldStart || ahead.suggestedSetAside == null) {
                    // <1yr history (or Hijri-only signal): generic heads-up, no number.
                    body = `${ahead.monthName} tends to be a higher-spending stretch${ahead.label ? ` (${ahead.label})` : ''}. Setting a little aside now softens the hit.`;
                } else {
                    params.set('desc', `${ahead.monthName} set-aside`);
                    params.set('target', String(ahead.suggestedSetAside));
                    body = `You usually spend about ${ahead.ratio}× your normal in ${ahead.monthName}. Setting aside ~${Math.round(ahead.suggestedSetAside).toLocaleString()} ${when} keeps ${ahead.label || 'the season'} from denting your budget.`;
                }
                recs.push({
                    id:   'seasonal_lookahead',
                    type: 'tip',
                    icon: '🗓️',
                    title: `${ahead.monthName} spike coming — set aside early`,
                    body,
                    cta:  { label: 'Plan a set-aside goal', href: `/recommendation?${params.toString()}` },
                });
            }
        }

        // ── 8. Surplus sweep — earmark last month's leftover to a goal ───────
        // If the last completed month ran a surplus (income > expense) and the
        // user has an unachieved goal to feed, nudge them to sweep part of it in
        // before it blends into this month's spend. Suppressed once an Allocation
        // exists for that month — the CTA lands on the Savings Goal tool, whose
        // one-tap "sweep here" button writes exactly that Allocation. No money was
        // auto-moved: this is cash-flow surplus, a suggestion.
        const activeGoals = goals.filter(g => g.achieve !== 1);
        if (activeGoals.length > 0) {
            const lastMonthYM = now.clone().subtract(1, 'month').format('YYYY-MM');
            const [lastSnap, alreadySwept] = await Promise.all([
                Snapshot.findOne({ user: userId, yearMonth: lastMonthYM }).select('income expense').lean(),
                Allocation.exists({ user: userId, source: 'surplus', sourceKey: lastMonthYM }),
            ]);
            const surplus = lastSnap ? Math.round((lastSnap.income || 0) - (lastSnap.expense || 0)) : 0;
            if (lastSnap && lastSnap.income > 0 && surplus > 0 && !alreadySwept) {
                // Amount stays in the CTA params only — the FE formats it in the
                // user's currency; the server never embeds a currency figure.
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
                    cta:  { label: 'Sweep surplus to a goal', href: `/recommendation?${params.toString()}` },
                });
            }

            // ── 8. Windfall (THR / bonus) not yet allocated ──────────────────
            // A recent income far above the user's usual gets a nudge to plan a
            // split into goals. Suppressed once any Allocation exists for that
            // transaction — the Windfall Planner tool writes it via /allocate.
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
