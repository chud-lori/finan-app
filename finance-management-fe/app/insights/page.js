'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getAnomalies, getExplainability, getRecurring, getTimeToZero, getMLInsights, refreshMLInsights, getGroupSummary, getGamificationSummary, classifyAllCategories, setCategoryGroup, getGroupBudgets, setGroupBudget, getRangeTransactions } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';
import { SkeletonLine, SkeletonBox } from '@/components/Skeleton';
import Tooltip from '@/components/Tooltip';
import MoneyRecap from '@/components/MoneyRecap';
import PaydayRunway from '@/components/PaydayRunway';
import TransactionDrilldownModal from '@/components/TransactionDrilldownModal';

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
        <span className="hidden sm:inline text-xs text-gray-400 dark:text-slate-500">
          {`Updated ${timeAgo(generatedAt.ts)}`}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        title={!stale && generatedAt?.ts ? `Updated ${timeAgo(generatedAt.ts)}` : undefined}
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

function buildInsights(explain, ttz, anomaly, ml, recurring, formatAmount) {
  const insights = [];
  const daysElapsed = new Date().getDate();

  // Recurring: a missing bill is the highest-signal nudge; otherwise surface the
  // subscription total so it's visible at a glance.
  if (recurring?.alerts?.length) {
    const miss = recurring.alerts.find(a => a.type === 'missing');
    if (miss) {
      insights.push({ level: 'warn', icon: '⏰', text: `${cap(miss.merchant)} usually charges around now but nothing has posted — check it didn't fail`, anchor: 'recurring', cta: 'See recurring' });
    }
  }
  if (recurring?.count > 0) {
    insights.push({ level: 'info', icon: '🔁', text: `You have ${recurring.count} recurring charge${recurring.count > 1 ? 's' : ''} totalling about ${formatAmount(recurring.monthlyTotal)} a month`, anchor: 'recurring', cta: 'See recurring' });
  }

  if (ttz) {
    if (ttz.status === 'critical') {
      insights.push({ level: 'danger', icon: '🔥', text: `You're on track to overspend — balance runs out in ${ttz.daysToZero} days at current burn rate`, anchor: 'runway', cta: 'See runway' });
    } else if (ttz.status === 'already_zero') {
      insights.push({ level: 'danger', icon: '🔥', text: `Your balance is already at zero — stop all discretionary spending immediately`, anchor: 'runway', cta: 'See runway' });
    } else if (ttz.status === 'warning') {
      insights.push({ level: 'warn', icon: '⚡', text: `Balance runway is ${ttz.daysToZero} days — consider cutting back on discretionary spending`, anchor: 'runway', cta: 'See runway' });
    } else if (ttz.status === 'safe' && ttz.daysToZero > 90) {
      insights.push({ level: 'good', icon: '✅', text: `Your balance can last ${ttz.daysToZero} days at current pace — you're in solid shape`, anchor: 'runway', cta: 'See details' });
    }
  }

  // ML forecast insight
  if (ml?.forecast?.available) {
    const f = ml.forecast;
    if (f.over_budget) {
      insights.push({ level: 'danger', icon: '📊', text: `You're on pace to overspend your budget by ${f.variance > 0 ? '+' : ''}${f.variance?.toLocaleString()} this month`, anchor: 'forecast', cta: 'See forecast' });
    } else if (f.pct_of_budget >= 85) {
      insights.push({ level: 'warn', icon: '📊', text: `You'll use ${f.pct_of_budget}% of your monthly budget at this rate`, anchor: 'forecast', cta: 'See forecast' });
    } else if (f.trend === 'accelerating') {
      insights.push({ level: 'warn', icon: '📈', text: `Your spending is accelerating — you're likely to end higher than expected`, anchor: 'forecast', cta: 'See forecast' });
    } else if (f.trend === 'decelerating') {
      insights.push({ level: 'good', icon: '📉', text: `Your spending is slowing down — you're trending under your usual pace`, anchor: 'forecast', cta: 'See forecast' });
    }
  }

  // ML anomaly insights — if ML is available (even with 0 results) don't fall
  // through to the rule-based count; the two use different detection logic and
  // showing a rule-based count while the section displays ML results is misleading.
  if (ml && !ml.unavailable) {
    if (ml.anomaly_count > 0) {
      insights.push({ level: 'warn', icon: '🚨', text: `${ml.anomaly_count} unusual transaction${ml.anomaly_count > 1 ? 's' : ''} detected this month — statistically outside your normal pattern`, anchor: 'spending-alerts', cta: 'See transactions' });
    }
  } else if (anomaly?.count > 0) {
    insights.push({ level: 'warn', icon: '🚨', text: `${anomaly.count} unusual transaction${anomaly.count > 1 ? 's' : ''} flagged this month — higher than your normal pattern`, anchor: 'spending-alerts', cta: 'See transactions' });
  }

  if (explain?.topCategories?.length) {
    explain.topCategories.forEach(c => {
      // `volatility` is derived server-side from 6 months of history:
      //   fixed    → committed cost (rent, insurance) the user can't flex month to month
      //   flexible → discretionary (food, shopping) — the actionable lever
      //   semi / unknown → treated like flexible, with the same thresholds
      // `delta` is already pace-corrected server-side (run-rate vs the previous
      // month pro-rated to the elapsed days), so it no longer reads "down" just
      // because the month is young.
      const fixed = c.volatility === 'fixed';
      const d = c.delta;

      // Concentration. A large share of a fixed cost is normal and not a lever,
      // so it's stated neutrally rather than warned about.
      if (!fixed && c.pct >= 35) {
        insights.push({ level: 'warn', icon: '⚠️', text: `You spent ${c.pct}% on ${cap(c.category)} — very high dependency on a single category`, anchor: 'where-its-going', cta: 'See breakdown' });
      } else if (fixed && c.pct >= 40) {
        insights.push({ level: 'info', icon: '🏠', text: `${cap(c.category)} is ${c.pct}% of your spending — your fixed monthly base`, anchor: 'where-its-going', cta: 'See breakdown' });
      }

      // Change vs last month. A fixed cost rarely moves, so any change is a
      // reportable event (moved, renewed) — informational, low threshold. A
      // flexible cost swings normally, so it needs a bigger move and is framed
      // as something the user can act on.
      if (d !== null) {
        if (fixed) {
          if (Math.abs(d) >= 10) {
            insights.push({ level: 'info', icon: '🏠', text: `${cap(c.category)} ${d > 0 ? 'up' : 'down'} ${Math.abs(d)}% vs last month — new baseline?`, anchor: 'where-its-going', cta: 'See breakdown' });
          }
        } else if (d >= 40) {
          insights.push({ level: 'danger', icon: '📈', text: `${cap(c.category)} is running ${d}% above your usual pace — a place you can trim`, anchor: 'where-its-going', cta: 'See breakdown' });
        } else if (d >= 25) {
          insights.push({ level: 'warn', icon: '📈', text: `${cap(c.category)} up ${d}% above pace — worth watching`, anchor: 'where-its-going', cta: 'See breakdown' });
        } else if (d <= -25) {
          insights.push({ level: 'good', icon: '📉', text: `${cap(c.category)} down ${Math.abs(d)}% vs your usual pace — great progress`, anchor: 'where-its-going', cta: 'See breakdown' });
        }
      }

      if (c.count >= 10) {
        const avg = (c.count / daysElapsed).toFixed(1);
        insights.push({ level: 'info', icon: '🔁', text: `You made ${c.count} ${cap(c.category)} transactions this month — avg ${avg}/day`, anchor: 'where-its-going', cta: 'See breakdown' });
      }
      if (!fixed && c.pct >= 20 && c.pct < 35 && (d === null || Math.abs(d) < 25)) {
        insights.push({ level: 'info', icon: '📊', text: `${cap(c.category)} is your top expense at ${c.pct}% of total spending`, anchor: 'where-its-going', cta: 'See breakdown' });
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

function InsightFeed({ explain, ttz, anomaly, ml, recurring, loading }) {
  const formatAmount = useFormatAmount();
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

  const insights = buildInsights(explain, ttz, anomaly, ml, recurring, formatAmount);
  if (!insights.length) return null;

  const top = [...insights]
    .sort((a, b) => (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3))
    .slice(0, 5);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">What your data is saying</p>
        <Tooltip text="Auto-generated highlights ranked by urgency. Alert = action needed, Watch = keep an eye on it, Good = positive progress." position="bottom" align="left" fixed />
      </div>
      <div className="divide-y divide-gray-50 dark:divide-slate-800">
        {top.map((ins, i) => {
          const s = LEVEL[ins.level] ?? LEVEL.info;
          const inner = (
            <>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              <p className="text-sm text-gray-700 dark:text-slate-300 flex-1 leading-snug">{ins.text}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                {ins.anchor && (
                  <span className="text-xs text-teal-600 dark:text-teal-400 font-medium whitespace-nowrap">
                    {ins.cta ?? 'See details'} →
                  </span>
                )}
              </div>
            </>
          );
          if (ins.anchor) {
            return (
              <a
                key={i}
                href={`#${ins.anchor}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                {inner}
              </a>
            );
          }
          return (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              {inner}
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
      {/* Main forecast number.
          Stacked under sm: a 3xl currency figure plus the trend pill and the
          confidence label cannot share one row on a 390px card — the card has
          overflow-hidden, so they were being clipped at the right edge. */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-5 gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 mb-1">Projected month-end spend</p>
          <p className={`text-2xl sm:text-3xl font-black tabular-nums ${data.over_budget ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-slate-100'}`}>
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
        <div className="flex items-center gap-2 sm:block sm:text-right shrink-0">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${trend.bg} ${trend.color}`}>
            {trend.icon} {trend.label}
          </span>
          <p className={`text-xs sm:mt-1.5 whitespace-nowrap ${CONF_COLOR[data.confidence]}`}>
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
              <Tooltip text="Net balance: total income minus total expenses across all time." align="left" fixed />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-slate-200">{formatAmount(data.balance)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <p className="text-xs text-gray-400">Daily burn</p>
              <Tooltip text="Average daily spending over the last 30 days." align="right" fixed />
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
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-5 italic leading-relaxed">&ldquo;{data.summary}&rdquo;</p>
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
            {/* State the comparison, so the alert can be judged rather than just trusted. */}
            {a.baseline_count > 0 && a.category_avg > 0 && (
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                Compared with {a.baseline_count} other {a.category} transaction{a.baseline_count > 1 ? 's' : ''} · typically {formatAmount(a.category_avg)}
              </p>
            )}
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

// ── Spending by Category Group ────────────────────────────────────────────────

const GROUP_META = {
  essential:     { label: 'Essential',     icon: '🏠', bar: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',    desc: 'Rent, food, utilities, transport, health' },
  discretionary: { label: 'Discretionary', icon: '🎯', bar: 'bg-violet-500',  badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400', desc: 'Dining out, shopping, travel, entertainment' },
  savings:       { label: 'Savings',       icon: '💰', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', desc: 'Investments, emergency fund, deposits' },
  social:        { label: 'Social',        icon: '🤝', bar: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',   desc: 'Gifts, donations, sharing, family' },
  income:        { label: 'Income',        icon: '📥', bar: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',    desc: 'Salary, freelance, dividends' },
  other:         { label: 'Other',         icon: '📦', bar: 'bg-gray-400',    badge: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',    desc: 'Unclassified categories' },
};

const GROUP_OPTIONS = [
  { value: 'essential',     label: 'Essential',     icon: '🏠' },
  { value: 'discretionary', label: 'Discretionary', icon: '🎯' },
  { value: 'savings',       label: 'Savings',       icon: '💰' },
  { value: 'social',        label: 'Social',        icon: '🤝' },
  { value: 'income',        label: 'Income',        icon: '📥' },
  { value: 'other',         label: 'Other',         icon: '📦' },
];

function GroupBreakdown({ data, onReclassify, reclassifying, onMoveCategory, movingCategory }) {
  const formatAmount = useFormatAmount();
  const [expanded, setExpanded] = useState(null);
  if (!data?.groups?.length) return (
    <div className="p-8 text-center space-y-2">
      <p className="text-2xl">📂</p>
      <p className="text-sm text-gray-500 dark:text-slate-400">No spending data this month</p>
    </div>
  );

  const maxPct = Math.max(...data.groups.map(g => g.pct), 1);

  return (
    <div className="p-5">
      {/* Bar chart */}
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5 mb-5">
        {data.groups.map(g => {
          const meta = GROUP_META[g.group] ?? GROUP_META.other;
          return (
            <div
              key={g.group}
              className={`${meta.bar} transition-all duration-700 cursor-pointer hover:opacity-80`}
              style={{ width: `${g.pct}%`, minWidth: 3 }}
              title={`${meta.label}: ${g.pct}%`}
              onClick={() => setExpanded(expanded === g.group ? null : g.group)}
            />
          );
        })}
      </div>

      {/* Group rows */}
      <div className="space-y-3">
        {data.groups.map(g => {
          const meta = GROUP_META[g.group] ?? GROUP_META.other;
          const isOpen = expanded === g.group;
          return (
            <div key={g.group}>
              <button
                className="w-full flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 rounded-xl px-2 py-1.5 -mx-2 transition-colors"
                onClick={() => setExpanded(isOpen ? null : g.group)}
              >
                <span className="text-base shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{meta.label}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${meta.badge}`}>{g.pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full ${meta.bar} transition-all duration-700`} style={{ width: `${(g.pct / maxPct) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-slate-100">{formatAmount(g.total)}</p>
                  <p className="text-xs text-gray-400">{g.categories.length} cat.</p>
                </div>
                <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded sub-categories */}
              {isOpen && (
                <div className="ml-8 mt-1 mb-2 space-y-1">
                  {g.categories.map(c => {
                    const isMoving = movingCategory === String(c._id);
                    return (
                      <div key={c.name} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/40">
                        <span className="flex-1 text-xs text-gray-600 dark:text-slate-400 capitalize truncate">{c.name}</span>
                        <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-slate-300 shrink-0">{formatAmount(c.total)}</span>
                        {/* Group picker */}
                        {isMoving ? (
                          <span className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin shrink-0" />
                        ) : (
                          <select
                            value={g.group}
                            onChange={(e) => onMoveCategory && onMoveCategory(String(c._id), e.target.value)}
                            disabled={!!movingCategory}
                            onClick={(e) => e.stopPropagation()}
                            title="Move to group"
                            className="text-base sm:text-[10px] sm:leading-none max-w-[6.5rem] sm:max-w-none border border-gray-200 dark:border-slate-700 rounded-md px-1 py-0.5 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 cursor-pointer hover:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-40 shrink-0"
                          >
                            {GROUP_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-gray-400 px-2 pt-1 italic">{meta.desc}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <p className="text-xs text-gray-400">Total expenses this month</p>
        <p className="text-sm font-bold text-gray-700 dark:text-slate-300">{formatAmount(data.total)}</p>
      </div>

      <button
        onClick={onReclassify}
        disabled={reclassifying}
        className="mt-3 w-full text-xs text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors disabled:opacity-40 text-center"
      >
        {reclassifying ? 'Classifying…' : '↻ Re-classify categories'}
      </button>
    </div>
  );
}

// ── Spending Mix (committed vs flexible) ──────────────────────────────────────

function SpendingMixBar({ data, onSegmentClick }) {
  const formatAmount = useFormatAmount();
  if (!data || !(data.total > 0)) return null;

  const committed = (data.fixed || 0) + (data.semi || 0);
  const flexible  = (data.flexible || 0) + (data.unknown || 0);
  const total     = data.total;
  const pct = (n) => Math.round((n / total) * 100);
  const cats = data.categories || {};

  const segments = [
    { key: 'committed', label: 'Committed', amount: committed, bar: 'bg-teal-500',  dot: 'bg-teal-500',  desc: 'Fixed costs — rent, bills, subscriptions',      categories: [...(cats.fixed || []), ...(cats.semi || [])] },
    { key: 'flexible',  label: 'Flexible',  amount: flexible,  bar: 'bg-amber-400', dot: 'bg-amber-400', desc: 'Discretionary — the spending you can steer', categories: [...(cats.flexible || []), ...(cats.unknown || [])] },
  ];
  const clickable = typeof onSegmentClick === 'function' && !!data.categories;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
        <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">⚖️ Spending Mix</h2>
        <Tooltip text="How much of this month's spending is committed (fixed costs you can't easily move) vs flexible (discretionary spending you can steer)." align="left" fixed />
      </div>
      <div className="p-5">
        {/* The bar itself is a tap target; a thin segment is unhittable on a
            phone, so each legend row below repeats the same drill-down. */}
        <div className="flex h-4 rounded-full overflow-hidden gap-0.5 mb-4">
          {segments.map(s => s.amount > 0 && (
            <button
              key={s.key}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSegmentClick(s)}
              className={`${s.bar} transition-all duration-700 ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              style={{ width: `${(s.amount / total) * 100}%`, minWidth: 3 }}
              title={`${s.label}: ${pct(s.amount)}%`}
              aria-label={`${s.label} ${pct(s.amount)} percent`}
            />
          ))}
        </div>
        <div className="space-y-2.5">
          {segments.map(s => (
            <button
              key={s.key}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSegmentClick(s)}
              className={`w-full text-left flex items-center gap-3 rounded-lg -mx-1 px-1 py-1 ${clickable ? 'hover:bg-gray-50 dark:hover:bg-slate-800/40' : ''}`}
            >
              <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${s.dot}`} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{s.label}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500 ml-2">{s.desc}</span>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100 whitespace-nowrap">{formatAmount(s.amount)}</p>
                <p className="text-xs text-gray-400">{pct(s.amount)}%</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Group Budgets (envelope-lite soft caps) ───────────────────────────────────
// Opt-in soft caps per spending group, layered on top of the single monthly
// budget. Reuses GROUP_META (colours/labels) and the Spending Mix bar look. When
// the user has set no caps it stays a single unobtrusive line so it never
// clutters the core tracker.

const CAP_GROUPS = ['essential', 'discretionary', 'savings', 'social'];

function GroupBudgetCaps({ data, onSave, savingGroup }) {
  const formatAmount = useFormatAmount();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts]   = useState({}); // group -> string being typed

  if (!data?.groups) return null;
  const byGroup = Object.fromEntries(data.groups.map(g => [g.group, g]));
  const hasCaps = data.hasCaps;

  const startEditing = () => {
    const seed = {};
    for (const g of CAP_GROUPS) seed[g] = byGroup[g]?.cap != null ? String(byGroup[g].cap) : '';
    setDrafts(seed);
    setEditing(true);
  };

  const commit = async (group) => {
    const raw = drafts[group];
    const amount = raw === '' || raw == null ? 0 : Number(raw);
    if (Number.isNaN(amount) || amount < 0) return;
    await onSave(group, amount);
  };

  // Collapsed opt-in state — no caps set and not editing.
  if (!hasCaps && !editing) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">🧧 Group Budgets</h2>
            <Tooltip text="Optional soft caps for each spending group (essential, discretionary, savings, social), layered on top of your single monthly budget. Nothing is blocked — a cap just shows a progress bar so you can steer before month-end." align="left" fixed />
          </div>
          <button
            onClick={startEditing}
            className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 shrink-0"
          >
            Set caps
          </button>
        </div>
        <p className="px-5 pb-4 -mt-1 text-xs text-gray-500 dark:text-slate-400">
          Keep each spending group in check with an optional monthly cap.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">🧧 Group Budgets</h2>
          <Tooltip text="Optional soft caps per spending group, on top of your single monthly budget. Leave a cap blank to remove it." align="left" fixed />
        </div>
        <button
          onClick={() => setEditing(e => !e)}
          className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 shrink-0"
        >
          {editing ? 'Done' : 'Edit caps'}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {CAP_GROUPS.map(group => {
          const meta = GROUP_META[group] ?? GROUP_META.other;
          const row  = byGroup[group] || { spent: 0, cap: null, pct: null, over: false };
          const busy = savingGroup === group;
          const pct  = row.cap && row.cap > 0 ? Math.min((row.spent / row.cap) * 100, 100) : 0;
          const over = row.over;

          return (
            <div key={group}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base shrink-0">{meta.icon}</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 flex-1">{meta.label}</span>
                {row.cap != null && !editing && (
                  <span className={`text-xs font-semibold tabular-nums ${over ? 'text-rose-500' : 'text-gray-500 dark:text-slate-400'}`}>
                    {formatAmount(row.spent)} / {formatAmount(row.cap)}
                    {over && ' · over'}
                  </span>
                )}
                {editing && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="No cap"
                      value={drafts[group] ?? ''}
                      onChange={(e) => setDrafts(d => ({ ...d, [group]: e.target.value }))}
                      onBlur={() => commit(group)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      disabled={busy}
                      className="w-32 text-base sm:text-xs text-right tabular-nums border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-40"
                    />
                    {busy && <span className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />}
                  </div>
                )}
              </div>

              {/* Progress bar — only when a cap exists */}
              {row.cap != null ? (
                <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-700 ${over ? 'bg-rose-500' : meta.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : (
                !editing && <p className="text-xs text-gray-400 dark:text-slate-500">No cap set · {formatAmount(row.spent)} spent</p>
              )}
            </div>
          );
        })}

        {editing && (
          <p className="text-[11px] text-gray-400 dark:text-slate-500 pt-1">
            Caps recur every month. Clear a field to remove its cap. Nothing is blocked — this is a guide, not a hard limit.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Financial Health Score ────────────────────────────────────────────────────
const HEALTH_BANDS = {
  excellent:       { label: 'Excellent',      ring: '#10b981', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' },
  healthy:         { label: 'Healthy',         ring: '#14b8a6', chip: 'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400' },
  building:        { label: 'Building',        ring: '#f59e0b', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' },
  needs_attention: { label: 'Needs attention', ring: '#f43f5e', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400' },
};
const HEALTH_FOCUS = {
  savings:   'Try to keep a bit more of your income',
  emergency: 'Build up your emergency fund',
  budget:    "You're spending above your budget pace",
  goals:     'Add a little toward your savings goals',
};
const PILLAR_HINT = {
  savings:   'no income logged yet',
  emergency: 'not enough history yet',
  budget:    'set a monthly budget to include this',
  goals:     'add a savings goal to include this',
};

function HealthScoreCard({ health }) {
  if (!health || health.score == null) return null;
  const band = HEALTH_BANDS[health.band] || HEALTH_BANDS.building;
  const available = health.components.filter(c => c.available);
  const weakest = available.slice().sort((a, b) => a.score - b.score)[0];
  const focus = weakest && weakest.score < 70 ? weakest : null;

  const R = 34, C = 2 * Math.PI * R;
  const offset = C * (1 - health.score / 100);

  return (
    <div id="health" className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 mb-6">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 84, height: 84 }}>
          <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r={R} fill="none" strokeWidth="8" className="stroke-gray-100 dark:stroke-slate-800" />
            <circle cx="42" cy="42" r={R} fill="none" strokeWidth="8" stroke={band.ring} strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 42 42)"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-black text-gray-900 dark:text-slate-100 tabular-nums">{health.score}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">Financial Health</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${band.chip}`}>{band.label}</span>
            <Tooltip text="A 0–100 score from four pillars: your savings rate, emergency-fund coverage, budget adherence, and goal progress. Pillars you haven't set up yet are left out, not counted against you." align="left" fixed />
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            {focus ? `Focus: ${HEALTH_FOCUS[focus.key] || `improve your ${focus.label.toLowerCase()}`}` : 'All your money pillars are looking strong'}
          </p>
        </div>
      </div>

      {/* Per-pillar bars */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-2 mt-4">
        {health.components.map(c => (
          <div key={c.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500 dark:text-slate-400">{c.label}</span>
              <span className="text-gray-400 dark:text-slate-500 tabular-nums">{c.available ? `${c.score}` : '—'}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
              {c.available
                ? <div className="h-1.5 rounded-full" style={{ width: `${c.score}%`, background: band.ring }} />
                : null}
            </div>
            {!c.available && <p className="text-[10px] text-gray-400 dark:text-slate-600 mt-0.5">{PILLAR_HINT[c.key]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recurring & Subscriptions ─────────────────────────────────────────────────

function RecurringCard({ data }) {
  const formatAmount = useFormatAmount();
  const frequent = data?.frequent || [];
  if (!data || !(data.count > 0 || frequent.length > 0)) return null;

  const dueLabel = (iso) => {
    const days = Math.round((new Date(iso) - new Date()) / 86400000);
    if (days < 0)  return 'overdue';
    if (days === 0) return 'due today';
    if (days === 1) return 'due tomorrow';
    if (days <= 31) return `due in ${days}d`;
    return `due ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  };

  return (
    <div id="recurring" className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">🔁 Recurring &amp; Subscriptions</h2>
          <Tooltip text="Bills and subscriptions only: a fixed-ish amount on a precise monthly-or-longer schedule, in a category that isn't everyday spending. Repeat food and coffee show up under Frequent spend instead, and never raise bill alerts. Monthly cost normalizes quarterly/yearly charges to a per-month figure." align="left" fixed />
        </div>
        {data.count > 0 && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums whitespace-nowrap">{formatAmount(data.monthlyTotal)}<span className="text-xs font-normal text-gray-400">/mo</span></p>
            <p className="text-xs text-gray-400">{data.count} recurring</p>
          </div>
        )}
      </div>

      {data.alerts?.length > 0 && (
        <div className="px-5 pt-3 space-y-1.5">
          {data.alerts.map((a, i) => (
            <div key={i} className={`text-xs rounded-lg px-3 py-2 ${a.type === 'missing'
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'}`}>
              {a.type === 'missing'
                ? `⏰ ${cap(a.merchant)} usually charges ~${formatAmount(a.expected)} by now — nothing posted yet`
                : `📈 ${cap(a.merchant)} went up ${a.pct}% — ${formatAmount(a.from)} → ${formatAmount(a.to)}`}
            </div>
          ))}
        </div>
      )}

      {data.count > 0 && (
        <ul className="p-5 pt-3 divide-y divide-gray-100 dark:divide-slate-800">
          {data.recurring.map((r, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{cap(r.merchant)}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {cap(r.category)} · {r.cadence} · {dueLabel(r.nextDue)}
                </p>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100 whitespace-nowrap">{formatAmount(r.typicalAmount)}</p>
                {r.cadence !== 'monthly' && (
                  <p className="text-xs text-gray-400 whitespace-nowrap">≈{formatAmount(r.monthlyEquivalent)}/mo</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Habits, not bills — repeats that land more often than monthly. No due
          dates and no missing-bill alerts: they are spending patterns, not commitments. */}
      {frequent.length > 0 && (
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Frequent spend</h3>
            <p className="text-xs text-gray-400 tabular-nums whitespace-nowrap">≈{formatAmount(data.frequentMonthlyTotal)}/mo</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">Habits that repeat more often than monthly — not treated as bills.</p>
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {frequent.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{cap(r.merchant)}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    {cap(r.category)} · {r.cadence} · {r.occurrences}×
                  </p>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100 whitespace-nowrap">{formatAmount(r.typicalAmount)}</p>
                  <p className="text-xs text-gray-400 whitespace-nowrap">≈{formatAmount(r.monthlyEquivalent)}/mo</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
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

function Section({ id, title, subtitle, tooltip, tag, headerRight, children, loading, error }) {
  return (
    <div id={id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-2 min-w-0 w-full sm:flex-1">
            <h2 className="text-base font-bold text-gray-900 dark:text-slate-100 whitespace-nowrap">{title}</h2>
            {tag && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 shrink-0">
                {tag}
              </span>
            )}
            {tooltip && <Tooltip text={tooltip} align="left" fixed />}
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
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
  const [health,     setHealth]     = useState(null);
  const [recurring,  setRecurring]  = useState(null);
  const [anomaly,    setAnomaly]    = useState(null);
  const [ml,           setMl]           = useState(null);
  const [mlMeta,       setMlMeta]       = useState(null); // { ts, fromCache }
  const [mlStale,      setMlStale]      = useState(false);
  const [mlUnavailable, setMlUnavailable] = useState(false);
  const [groups,       setGroups]       = useState(null);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [reclassifying, setReclassifying] = useState(false);
  const [movingCategory, setMovingCategory] = useState(null); // category name being moved
  const [groupBudgets, setGroupBudgets] = useState(null);
  const [savingGroupBudget, setSavingGroupBudget] = useState(null);
  const [loading,      setLoading]      = useState({ ttz: true, explain: true, recurring: true, anomaly: true, ml: true });
  const [refreshing,   setRefreshing]   = useState(false);
  const [errors,       setErrors]       = useState({});
  const [mixDrill,     setMixDrill]     = useState(null);   // { label, categories }
  const [mixTxns,      setMixTxns]      = useState([]);
  const [mixLoading,   setMixLoading]   = useState(false);

  // Spending Mix segment → the transactions behind it, this month.
  const openMixDrilldown = async (segment) => {
    setMixDrill(segment);
    setMixTxns([]);
    setMixLoading(true);
    const now   = new Date();
    const pad   = (n) => String(n).padStart(2, '0');
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const end   = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
    const wanted = new Set((segment.categories || []).map(c => String(c).toLowerCase()));
    try {
      const res = await getRangeTransactions(start, end);
      setMixTxns(
        (res.data?.transactions ?? [])
          .filter(t => t.type === 'expense' && wanted.has(String(t.category ?? '').toLowerCase()))
          .sort((a, b) => new Date(b.time) - new Date(a.time)),
      );
    } catch {
      setMixTxns([]);
    } finally {
      setMixLoading(false);
    }
  };

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

    load('ttz',       getTimeToZero,     setTtz);
    load('explain',   getExplainability, setExplain);
    load('recurring', getRecurring,      setRecurring);
    load('anomaly',   getAnomalies,      setAnomaly);
    // Financial Health lives on this page (a persistent summary), separate from
    // the gamification banner's transient celebrations.
    getGamificationSummary().then(res => setHealth(res.data?.health)).catch(() => {});

    // Kick off background classification then fetch group summary
    classifyAllCategories().catch(() => {});
    (async () => {
      try {
        const res = await getGroupSummary();
        setGroups(res.data);
      } catch {
        // non-fatal — section just won't show
      } finally {
        setGroupsLoading(false);
      }
    })();

    // Group budgets (soft caps) — non-fatal; card hides on failure
    getGroupBudgets().then(res => setGroupBudgets(res.data)).catch(() => {});

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

  const handleReclassify = async () => {
    setReclassifying(true);
    try {
      await classifyAllCategories();
      const res = await getGroupSummary();
      setGroups(res.data);
    } catch {
      // silent
    } finally {
      setReclassifying(false);
    }
  };

  const handleMoveCategory = async (categoryId, newGroup) => {
    setMovingCategory(categoryId);
    try {
      await setCategoryGroup(categoryId, newGroup);
      const res = await getGroupSummary();
      setGroups(res.data);
    } catch {
      // silent — group stays as-is on failure
    } finally {
      setMovingCategory(null);
    }
  };

  const handleSaveGroupBudget = async (group, amount) => {
    setSavingGroupBudget(group);
    try {
      await setGroupBudget(group, amount);
      const res = await getGroupBudgets();
      setGroupBudgets(res.data);
    } catch {
      // silent — cap stays as-is on failure
    } finally {
      setSavingGroupBudget(null);
    }
  };

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

          {health?.score != null && <HealthScoreCard health={health} />}

          <PaydayRunway />

          <MoneyRecap />

          <InsightFeed
            explain={explain} ttz={ttz} anomaly={anomaly} ml={ml} recurring={recurring}
            loading={feedLoading}
          />

          {explain?.volatilityBreakdown && <SpendingMixBar data={explain.volatilityBreakdown} onSegmentClick={openMixDrilldown} />}

          {groupBudgets && <GroupBudgetCaps data={groupBudgets} onSave={handleSaveGroupBudget} savingGroup={savingGroupBudget} />}

          {(recurring?.count > 0 || recurring?.frequent?.length > 0) && <RecurringCard data={recurring} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Month Forecast — ML */}
            <div id="forecast" className="lg:col-span-2">
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
              id="runway"
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
              id="where-its-going"
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

            {/* Spending by Category Group */}
            <div className="lg:col-span-2">
              <Section
                title="📂 Spending by Group"
                subtitle="How your expenses break down by life category — essential, discretionary, savings, and more"
                loading={groupsLoading}
              >
                <GroupBreakdown data={groups} onReclassify={handleReclassify} reclassifying={reclassifying} onMoveCategory={handleMoveCategory} movingCategory={movingCategory} />
              </Section>
            </div>

            {/* Spending Alerts — ML or rule-based fallback */}
            <div id="spending-alerts" className="lg:col-span-2">
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

      {mixDrill && (
        <TransactionDrilldownModal
          title={`${mixDrill.label} spending`}
          subtitle="This month"
          transactions={mixTxns}
          loading={mixLoading}
          emptyText="No transactions in this part of the mix."
          onClose={() => setMixDrill(null)}
        />
      )}
    </AuthGuard>
  );
}
