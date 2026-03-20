'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getAnomalies, getExplainability, getTimeToZero, getMLInsights, refreshMLInsights } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';
import { SkeletonLine, SkeletonBox } from '@/components/Skeleton';
import Tooltip from '@/components/Tooltip';

// ── Helpers ───────────────────────────────────────────────────────────────────

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function timeAgo(date) {
  if (!date) return null;
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60)  return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function RefreshButton({ generatedAt, onRefresh, loading, stale }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {stale && (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
          Stale
        </span>
      )}
      {!stale && generatedAt?.ts && (
        <span className="text-xs text-gray-400 dark:text-slate-500 hidden sm:block">
          {`Updated ${timeAgo(generatedAt.ts)}`}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

// ── Smart Insights Feed ───────────────────────────────────────────────────────

function buildInsights(explain, ttz, anomaly, ml) {
  const insights = [];
  const daysElapsed = new Date().getDate();

  if (ttz) {
    if (ttz.status === 'critical') {
      insights.push({ level: 'danger', icon: '🔥', text: `You're on track to overspend — balance runs out in ${ttz.daysToZero} days at current burn rate` });
    } else if (ttz.status === 'already_zero') {
      insights.push({ level: 'danger', icon: '🔥', text: `Your balance is already at zero — stop all discretionary spending immediately` });
    } else if (ttz.status === 'warning') {
      insights.push({ level: 'warn', icon: '⚡', text: `Balance runway is ${ttz.daysToZero} days — consider cutting back on discretionary spending` });
    } else if (ttz.status === 'safe' && ttz.daysToZero > 90) {
      insights.push({ level: 'good', icon: '✅', text: `Your balance can last ${ttz.daysToZero} days at current pace — you're in solid shape` });
    }
  }

  // ML forecast insight
  if (ml?.forecast?.available) {
    const f = ml.forecast;
    if (f.over_budget) {
      insights.push({ level: 'danger', icon: '📊', text: `You're on pace to overspend your budget by ${f.variance > 0 ? '+' : ''}${f.variance?.toLocaleString()} this month` });
    } else if (f.pct_of_budget >= 85) {
      insights.push({ level: 'warn', icon: '📊', text: `You'll use ${f.pct_of_budget}% of your monthly budget at this rate` });
    } else if (f.trend === 'accelerating') {
      insights.push({ level: 'warn', icon: '📈', text: `Your spending is accelerating — you're likely to end higher than expected` });
    } else if (f.trend === 'decelerating') {
      insights.push({ level: 'good', icon: '📉', text: `Your spending is slowing down — you're trending under your usual pace` });
    }
  }

  // ML anomaly insights
  if (ml?.anomaly_count > 0) {
    insights.push({ level: 'warn', icon: '🚨', text: `${ml.anomaly_count} unusual transaction${ml.anomaly_count > 1 ? 's' : ''} detected this month — statistically outside your normal pattern` });
  } else if (anomaly?.count > 0) {
    insights.push({ level: 'warn', icon: '🚨', text: `${anomaly.count} unusual transaction${anomaly.count > 1 ? 's' : ''} flagged this month — higher than your normal pattern` });
  }

  if (explain?.topCategories?.length) {
    explain.topCategories.forEach(c => {
      if (c.pct >= 35) {
        insights.push({ level: 'warn', icon: '⚠️', text: `You spent ${c.pct}% on ${cap(c.category)} — very high dependency on a single category` });
      }
      if (c.delta !== null && c.delta >= 30) {
        insights.push({ level: 'danger', icon: '📈', text: `${cap(c.category)} spending spiked ${c.delta}% vs last month` });
      } else if (c.delta !== null && c.delta >= 15) {
        insights.push({ level: 'warn', icon: '📈', text: `${cap(c.category)} up ${c.delta}% vs last month — worth watching` });
      }
      if (c.delta !== null && c.delta <= -20) {
        insights.push({ level: 'good', icon: '📉', text: `${cap(c.category)} down ${Math.abs(c.delta)}% vs last month — great progress` });
      }
      if (c.count >= 10) {
        const avg = (c.count / daysElapsed).toFixed(1);
        insights.push({ level: 'info', icon: '🔁', text: `You made ${c.count} ${cap(c.category)} transactions this month — avg ${avg}/day` });
      }
      if (c.pct >= 20 && c.pct < 35 && (c.delta === null || Math.abs(c.delta) < 15)) {
        insights.push({ level: 'info', icon: '📊', text: `${cap(c.category)} is your top expense at ${c.pct}% of total spending` });
      }
    });
  }

  return insights;
}

const LEVEL = {
  danger: { dot: 'bg-rose-500',    badge: 'bg-rose-100 text-rose-700',     label: 'Alert' },
  warn:   { dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700',    label: 'Watch' },
  info:   { dot: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-700',      label: 'Info'  },
  good:   { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', label: 'Good' },
};
const LEVEL_ORDER = { danger: 0, warn: 1, good: 2, info: 3 };

function InsightFeed({ explain, ttz, anomaly, ml, loading }) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6 animate-pulse">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800">
          <div className="h-3 w-40 bg-gray-100 dark:bg-slate-800 rounded" />
        </div>
        {[1,2,3].map(i => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 dark:border-slate-800">
            <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
            <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded flex-1" />
            <div className="w-12 h-5 bg-gray-100 dark:bg-slate-800 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  const insights = buildInsights(explain, ttz, anomaly, ml);
  if (!insights.length) return null;

  const top = [...insights]
    .sort((a, b) => (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3))
    .slice(0, 5);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">What your data is saying</p>
        <Tooltip text="Auto-generated highlights ranked by urgency. Alert = action needed, Watch = keep an eye on it, Good = positive progress." position="bottom" align="left" />
      </div>
      <div className="divide-y divide-gray-50 dark:divide-slate-800">
        {top.map((ins, i) => {
          const s = LEVEL[ins.level] ?? LEVEL.info;
          return (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              <p className="text-sm text-gray-700 dark:text-slate-300 flex-1 leading-snug">{ins.text}</p>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${s.badge}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Month Forecast card (ML — Linear Regression) ──────────────────────────────

const TREND_CONFIG = {
  accelerating: { label: 'Spending up',   color: 'text-rose-600',    bg: 'bg-rose-50 dark:bg-rose-950/30',    icon: '↑' },
  decelerating: { label: 'Spending down', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', icon: '↓' },
  steady:       { label: 'Steady pace',   color: 'text-gray-500',    bg: 'bg-gray-50 dark:bg-slate-800',      icon: '→' },
};
const CONF_COLOR = { high: 'text-emerald-600', medium: 'text-amber-500', low: 'text-gray-400' };

function ForecastCard({ data }) {
  const formatAmount = useFormatAmount();

  if (!data.available) {
    return (
      <div className="p-8 text-center">
        <p className="text-3xl mb-3">🔭</p>
        <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Forecast not ready yet</p>
        <p className="text-xs text-gray-400 mt-1">{data.reason}</p>
      </div>
    );
  }

  const hasBudget  = data.budget != null;
  const barSpent   = hasBudget ? Math.min((data.spent_so_far / data.budget) * 100, 100) : 0;
  const barForecast = hasBudget ? Math.min((data.forecast / data.budget) * 100, 100) : 0;
  const trend = TREND_CONFIG[data.trend] ?? TREND_CONFIG.steady;

  return (
    <div className="p-5">
      {/* Main forecast number */}
      <div className="flex items-end justify-between mb-5 gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">Projected month-end spend</p>
          <p className={`text-3xl font-black tabular-nums ${data.over_budget ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-slate-100'}`}>
            {formatAmount(data.forecast)}
          </p>
          {hasBudget && (
            <p className={`text-xs font-semibold mt-1 ${data.over_budget ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {data.over_budget
                ? `${formatAmount(data.variance)} over budget`
                : `${formatAmount(Math.abs(data.variance))} under budget`}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${trend.bg} ${trend.color}`}>
            {trend.icon} {trend.label}
          </span>
          <p className={`text-xs mt-1.5 ${CONF_COLOR[data.confidence]}`}>
            {data.confidence} confidence
          </p>
        </div>
      </div>

      {/* Budget progress bar */}
      {hasBudget && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>{formatAmount(data.spent_so_far)} spent</span>
            <span>Budget: {formatAmount(data.budget)}</span>
          </div>
          <div className="relative w-full h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
            {/* Forecast bar (lighter, behind) */}
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${data.over_budget ? 'bg-rose-200 dark:bg-rose-900/50' : 'bg-teal-100 dark:bg-teal-900/40'}`}
              style={{ width: `${barForecast}%` }}
            />
            {/* Spent bar (solid, in front) */}
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${data.over_budget ? 'bg-rose-500' : 'bg-teal-500'}`}
              style={{ width: `${barSpent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-sm inline-block ${data.over_budget ? 'bg-rose-500' : 'bg-teal-500'}`} /> spent so far
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-sm inline-block ${data.over_budget ? 'bg-rose-200' : 'bg-teal-100'}`} /> projected
            </span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-slate-800">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Daily average</p>
          <p className="text-sm font-bold text-gray-800 dark:text-slate-200">{formatAmount(data.daily_average)}/day</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Days remaining</p>
          <p className="text-sm font-bold text-gray-800 dark:text-slate-200">{data.days_left} days</p>
        </div>
      </div>
    </div>
  );
}

// ── Time-to-Zero card ─────────────────────────────────────────────────────────

const TTZ_CONFIG = {
  safe:         { label: 'Safe',            bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-400', text: 'text-emerald-700 dark:text-emerald-400' },
  warning:      { label: 'Warning',         bg: 'bg-amber-50 dark:bg-amber-950/30',     border: 'border-amber-200 dark:border-amber-800',     dot: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400'   },
  critical:     { label: 'Critical',        bg: 'bg-rose-50 dark:bg-rose-950/30',       border: 'border-rose-200 dark:border-rose-800',       dot: 'bg-rose-400',    text: 'text-rose-700 dark:text-rose-400'     },
  already_zero: { label: 'Balance at zero', bg: 'bg-rose-50 dark:bg-rose-950/30',       border: 'border-rose-200 dark:border-rose-800',       dot: 'bg-rose-500',    text: 'text-rose-700 dark:text-rose-400'     },
  no_spend:     { label: 'No recent spend', bg: 'bg-gray-50 dark:bg-slate-800',         border: 'border-gray-200 dark:border-slate-700',      dot: 'bg-gray-300',    text: 'text-gray-600 dark:text-slate-400'    },
};

function TimeToZeroCard({ data }) {
  const formatAmount = useFormatAmount();
  const cfg = TTZ_CONFIG[data.status] ?? TTZ_CONFIG.safe;
  return (
    <div className="p-4">
      <div className={`rounded-2xl border p-5 ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
          <h4 className={`text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</h4>
        </div>
        {data.daysToZero !== null ? (
          <>
            <p className={`text-5xl font-black mb-1 tabular-nums ${cfg.text}`}>{data.daysToZero}</p>
            <p className={`text-sm font-medium mb-0.5 ${cfg.text} opacity-80`}>days until balance hits zero</p>
            <p className="text-xs text-gray-500 mb-5">at your current spending rate</p>
            {data.projectedZeroDate && (
              <p className="text-xs text-gray-500">
                Projected date:{' '}
                <span className="font-semibold text-gray-700 dark:text-slate-300">
                  {new Date(data.projectedZeroDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 mt-2">No spending in the last 30 days — nothing to project.</p>
        )}
        <div className="mt-5 pt-4 border-t border-black/5 dark:border-white/5 grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <p className="text-xs text-gray-400">Current balance</p>
              <Tooltip text="Net balance: total income minus total expenses across all time." align="left" />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-slate-200">{formatAmount(data.balance)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <p className="text-xs text-gray-400">Daily burn</p>
              <Tooltip text="Average daily spending over the last 30 days." align="right" />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-slate-200">{formatAmount(data.dailyBurnRate)}/day</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Explainability card ───────────────────────────────────────────────────────

function ExplainCard({ data }) {
  const formatAmount = useFormatAmount();
  const maxPct = Math.max(...data.topCategories.map(c => c.pct), 1);
  return (
    <div className="p-5">
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-5 italic leading-relaxed">"{data.summary}"</p>
      <div className="space-y-4">
        {data.topCategories.map((c, i) => (
          <div key={c.category}>
            <div className="flex items-start justify-between mb-1.5 gap-3">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                <span className="text-xs font-bold text-gray-300 flex-shrink-0">#{i + 1}</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{cap(c.category)}</span>
                {c.count > 0 && <span className="text-xs text-gray-400 flex-shrink-0">{c.count}×</span>}
                {c.delta !== null && (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    c.delta > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {c.delta > 0 ? '+' : ''}{c.delta}%
                    <Tooltip text={`${c.delta > 0 ? 'More' : 'Less'} than last month on ${cap(c.category)}.`} align="left" fixed />
                  </span>
                )}
              </div>
              <div className="text-right flex-shrink-0 tabular-nums leading-tight">
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100 whitespace-nowrap">{formatAmount(c.total)}</p>
                <p className="text-xs text-gray-400">({c.pct}%)</p>
              </div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full bg-teal-400 transition-all duration-500" style={{ width: `${(c.pct / maxPct) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <p className="text-xs text-gray-400">Total this month</p>
        <p className="text-sm font-bold text-gray-700 dark:text-slate-300">{formatAmount(data.totalOutcome)}</p>
      </div>
    </div>
  );
}

// ── Spending Alerts (ML — Isolation Forest) ───────────────────────────────────

const SEV_CONFIG = {
  high:   { badge: 'bg-rose-100 text-rose-700',   bar: 'bg-rose-400'   },
  medium: { badge: 'bg-amber-100 text-amber-700',  bar: 'bg-amber-400'  },
  low:    { badge: 'bg-gray-100 text-gray-600',    bar: 'bg-gray-300'   },
};

function MLAnomalyList({ data }) {
  const formatAmount = useFormatAmount();

  if (!data?.anomalies?.length) {
    return (
      <div className="p-8 text-center">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">No unusual spending detected</p>
        <p className="text-xs text-gray-400 mt-1">All transactions fit your normal spending pattern this month</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-slate-800">
      {data.anomalies.map((a) => {
        const sev = SEV_CONFIG[a.severity] ?? SEV_CONFIG.low;
        return (
          <div key={a.id} className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-snug min-w-0 flex-1 break-words pr-2">
                {a.description}
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100 shrink-0 tabular-nums whitespace-nowrap">
                {formatAmount(a.amount)}
              </p>
            </div>
            <p className="text-xs text-gray-400 capitalize mb-2">{a.category} · {a.date}</p>

            {/* Severity score bar */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-1 rounded-full ${sev.bar}`} style={{ width: `${Math.round(a.score * 100)}%` }} />
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sev.badge}`}>
                {a.severity === 'high' ? 'High' : a.severity === 'medium' ? 'Medium' : 'Low'} anomaly
              </span>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400">{a.label}</p>
          </div>
        );
      })}
    </div>
  );
}

// Fallback: existing rule-based anomaly list (shown if ML is unavailable)
function RuleBasedAnomalyList({ data }) {
  const formatAmount = useFormatAmount();
  if (data.count === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">No anomalies this month</p>
        <p className="text-xs text-gray-400 mt-1">All transactions look normal compared to your history</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-gray-100 dark:divide-slate-800">
      {data.anomalies.map((a) => (
        <div key={String(a.id)} className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-snug flex-1 break-words pr-2">{a.description}</p>
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100 shrink-0 tabular-nums whitespace-nowrap">{formatAmount(a.amount)}</p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{a.category}</p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {a.flags.map((f, i) => (
              <span key={i} className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.type === 'first_time' ? 'bg-teal-100 text-teal-700' : 'bg-rose-100 text-rose-700'}`}>
                {f.type === 'first_time' ? 'New category' : `${f.ratio}× above avg`}
              </span>
            ))}
          </div>
          {a.flags.map((f, i) => <p key={i} className="text-xs text-gray-500 mt-1">{f.message}</p>)}
        </div>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="p-5 space-y-3 animate-pulse">
      <SkeletonLine className="h-3 w-full" />
      <SkeletonLine className="h-3 w-3/4" />
      <SkeletonBox className="h-24 w-full rounded-xl" />
    </div>
  );
}

function Section({ title, subtitle, tooltip, tag, headerRight, children, loading, error }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">{title}</h2>
            {tag && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 shrink-0">
                {tag}
              </span>
            )}
            {tooltip && <Tooltip text={tooltip} align="left" fixed />}
          </div>
          {headerRight}
        </div>
        {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {loading ? <SectionSkeleton /> : error ? (
        <div className="p-4 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>
      ) : children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [ttz,        setTtz]        = useState(null);
  const [explain,    setExplain]    = useState(null);
  const [anomaly,    setAnomaly]    = useState(null);
  const [ml,           setMl]           = useState(null);
  const [mlMeta,       setMlMeta]       = useState(null); // { ts, fromCache }
  const [mlStale,      setMlStale]      = useState(false);
  const [mlUnavailable, setMlUnavailable] = useState(false);
  const [loading,      setLoading]      = useState({ ttz: true, explain: true, anomaly: true, ml: true });
  const [refreshing,   setRefreshing]   = useState(false);
  const [errors,       setErrors]       = useState({});

  const applyMlResult = (data) => {
    setMl(data);
    setMlMeta({ ts: data.generatedAt, fromCache: data.fromCache });
    setMlStale(!!data.stale);
    setMlUnavailable(!!data.unavailable);
  };

  useEffect(() => {
    const load = async (key, fn, setter) => {
      try {
        const res = await fn();
        setter(res.data);
      } catch (e) {
        setErrors(prev => ({ ...prev, [key]: e.message }));
      } finally {
        setLoading(prev => ({ ...prev, [key]: false }));
      }
    };

    load('ttz',     getTimeToZero,     setTtz);
    load('explain', getExplainability, setExplain);
    load('anomaly', getAnomalies,      setAnomaly);

    // ML insights — apply metadata separately
    (async () => {
      try {
        const res = await getMLInsights();
        applyMlResult(res.data);
      } catch (e) {
        setErrors(prev => ({ ...prev, ml: e.message }));
      } finally {
        setLoading(prev => ({ ...prev, ml: false }));
      }
    })();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await refreshMLInsights();
      applyMlResult(res.data);
    } catch (e) {
      setErrors(prev => ({ ...prev, ml: e.message }));
    } finally {
      setRefreshing(false);
    }
  };

  const feedLoading = loading.ttz || loading.explain || loading.anomaly || loading.ml;
  // mlAvailable: we have data and it's not the empty "no data at all" shell
  const mlAvailable = ml && !mlUnavailable;

  const mlHeaderRight = (
    <RefreshButton
      generatedAt={mlMeta}
      onRefresh={handleRefresh}
      loading={refreshing}
      stale={mlStale}
    />
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-0.5">Insights</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">Your finances, translated into plain language</p>

          <InsightFeed
            explain={explain} ttz={ttz} anomaly={anomaly} ml={ml}
            loading={feedLoading}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Month Forecast — ML */}
            <div className="lg:col-span-2">
              <Section
                title="📈 Month Forecast"
                subtitle="Predicted spend by end of month based on your current trajectory"
                tag="Smart"
                tooltip="Uses linear regression on your daily spending pattern to project your month-end total. The two-layer progress bar shows what you've spent (solid) vs. where you're headed (light)."
                headerRight={mlHeaderRight}
                loading={loading.ml}
                error={undefined}
              >
                {mlAvailable && ml.forecast && <ForecastCard data={ml.forecast} />}
                {!mlAvailable && !loading.ml && (
                  <div className="p-8 text-center space-y-1">
                    <p className="text-sm text-gray-500 dark:text-slate-400">No forecast yet</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Add a few transactions and hit Refresh to generate your first forecast.</p>
                  </div>
                )}
              </Section>
            </div>

            {/* Runway */}
            <Section
              title="⏳ Runway"
              subtitle="How long until your balance runs out at current burn rate"
              tooltip="Current net balance ÷ average daily spending over the last 30 days."
              loading={loading.ttz}
              error={errors.ttz}
            >
              {ttz && <TimeToZeroCard data={ttz} />}
            </Section>

            {/* Where It's Going */}
            <Section
              title="🧠 Where It's Going"
              subtitle="Top categories driving your spending this month"
              tooltip="Your top expense categories sorted by total. % change shows vs last month."
              loading={loading.explain}
              error={errors.explain}
            >
              {explain && (explain.topCategories?.length > 0
                ? <ExplainCard data={explain} />
                : <div className="p-8 text-center text-sm text-gray-500">No spending data this month yet.</div>
              )}
            </Section>

            {/* Spending Alerts — ML or rule-based fallback */}
            <div className="lg:col-span-2">
              <Section
                title="🚨 Spending Alerts"
                subtitle={mlAvailable ? "Transactions that stand out from your normal pattern — ranked by how unusual they are" : "Transactions higher than your usual or brand-new categories"}
                tag={mlAvailable ? 'Smart' : undefined}
                headerRight={mlAvailable ? mlHeaderRight : undefined}
                tooltip={mlAvailable
                  ? "Powered by Isolation Forest — a statistical ML model trained on your own transaction history. It finds transactions that don't fit your typical spending distribution, not just simple thresholds."
                  : "A transaction is flagged if its amount is 2× higher than your category average, or if it's a category you've never used before."}
                loading={mlAvailable ? loading.ml : loading.anomaly}
                error={mlAvailable ? undefined : errors.anomaly}
              >
                {mlAvailable
                  ? <MLAnomalyList data={ml} />
                  : anomaly && <RuleBasedAnomalyList data={anomaly} />
                }
              </Section>
            </div>

          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
