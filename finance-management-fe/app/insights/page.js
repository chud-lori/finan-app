'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import AuthGuard from '@/components/AuthGuard';
import { getAnomalies, getExplainability, getTimeToZero } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';
import { SkeletonLine, SkeletonBox } from '@/components/Skeleton';
import Tooltip from '@/components/Tooltip';

// ── Helpers ───────────────────────────────────────────────────────────────────

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// ── Smart Insights Feed ───────────────────────────────────────────────────────

function buildInsights(explain, ttz, anomaly) {
  const insights = [];
  const daysElapsed = new Date().getDate();

  // Time-to-zero first (most critical)
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

  // Anomalies
  if (anomaly?.count > 0) {
    insights.push({ level: 'warn', icon: '🚨', text: `${anomaly.count} unusual transaction${anomaly.count > 1 ? 's' : ''} flagged this month — higher than your normal pattern` });
  }

  // Category-level insights
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
  danger: { dot: 'bg-rose-500',    badge: 'bg-rose-100 text-rose-700',    label: 'Alert'   },
  warn:   { dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700',   label: 'Watch'   },
  info:   { dot: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-700',     label: 'Info'    },
  good:   { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', label: 'Good'  },
};

const LEVEL_ORDER = { danger: 0, warn: 1, good: 2, info: 3 };

function InsightFeed({ explain, ttz, anomaly, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6 animate-pulse">
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="h-3 w-40 bg-gray-100 rounded" />
        </div>
        {[1,2,3,4].map(i => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50">
            <div className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="h-3 bg-gray-100 rounded flex-1" />
            <div className="w-12 h-5 bg-gray-100 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  const insights = buildInsights(explain, ttz, anomaly);
  if (!insights.length) return null;

  const top = [...insights]
    .sort((a, b) => (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3))
    .slice(0, 5);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">What your data is saying</p>
        <Tooltip text="Auto-generated highlights from your spending data — ranked by urgency. Alert = action needed, Watch = keep an eye on it, Good = positive progress." position="bottom" align="left" />
      </div>
      <div className="divide-y divide-gray-50">
        {top.map((ins, i) => {
          const s = LEVEL[ins.level] ?? LEVEL.info;
          return (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              <p className="text-sm text-gray-700 flex-1 leading-snug">{ins.text}</p>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${s.badge}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Time-to-Zero card ────────────────────────────────────────────────────────

const TTZ_CONFIG = {
  safe:         { label: 'Safe',            bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400', text: 'text-emerald-700' },
  warning:      { label: 'Warning',         bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400',   text: 'text-amber-700'   },
  critical:     { label: 'Critical',        bg: 'bg-rose-50',    border: 'border-rose-200',    dot: 'bg-rose-400',    text: 'text-rose-700'    },
  already_zero: { label: 'Balance at zero', bg: 'bg-rose-50',    border: 'border-rose-200',    dot: 'bg-rose-500',    text: 'text-rose-700'    },
  no_spend:     { label: 'No recent spend', bg: 'bg-gray-50',    border: 'border-gray-200',    dot: 'bg-gray-300',    text: 'text-gray-600'    },
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
          <p className={`text-5xl font-black mb-1 tabular-nums ${cfg.text}`}>
            {data.daysToZero}
          </p>
          <p className={`text-sm font-medium mb-0.5 ${cfg.text} opacity-80`}>days until balance hits zero</p>
          <p className="text-xs text-gray-500 mb-5">at your current spending rate</p>
          {data.projectedZeroDate && (
            <p className="text-xs text-gray-500">
              Projected date:{' '}
              <span className="font-semibold text-gray-700">
                {new Date(data.projectedZeroDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500 mt-2">No spending in the last 30 days — nothing to project.</p>
      )}

      <div className="mt-5 pt-4 border-t border-black/5 grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <p className="text-xs text-gray-400">Current balance</p>
            <Tooltip text="Your total income minus total expenses across all time — the net balance in your account." align="left" />
          </div>
          <p className="text-sm font-bold text-gray-800">{formatAmount(data.balance)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <p className="text-xs text-gray-400">Daily burn</p>
            <Tooltip text="Your average daily spending over the last 30 days. Used to calculate how long your balance will last." align="right" />
          </div>
          <p className="text-sm font-bold text-gray-800">{formatAmount(data.dailyBurnRate)}/day</p>
        </div>
      </div>
    </div>
    </div>
  );
}

// ── Explainability card ──────────────────────────────────────────────────────

function ExplainCard({ data }) {
  const formatAmount = useFormatAmount();
  const maxPct = Math.max(...data.topCategories.map(c => c.pct), 1);

  return (
    <div className="p-5">
      <p className="text-sm text-gray-500 mb-5 italic leading-relaxed">"{data.summary}"</p>

      <div className="space-y-4">
        {data.topCategories.map((c, i) => (
          <div key={c.category}>
            <div className="flex items-start justify-between mb-1.5 gap-3">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                <span className="text-xs font-bold text-gray-300 flex-shrink-0">#{i + 1}</span>
                <span className="text-sm font-semibold text-gray-800 truncate">{cap(c.category)}</span>
                {c.count > 0 && (
                  <span className="text-xs text-gray-400 flex-shrink-0">{c.count}×</span>
                )}
                {c.delta !== null && (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    c.delta > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {c.delta > 0 ? '+' : ''}{c.delta}%
                    <Tooltip text={`Change vs last month. ${c.delta > 0 ? 'You spent more' : 'You spent less'} on ${cap(c.category)} compared to the previous month.`} align="left" fixed />
                  </span>
                )}
              </div>
              <div className="text-right flex-shrink-0 tabular-nums leading-tight">
                <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{formatAmount(c.total)}</p>
                <p className="text-xs text-gray-400">({c.pct}%)</p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-teal-400 transition-all duration-500"
                style={{ width: `${(c.pct / maxPct) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">Total this month</p>
        <p className="text-sm font-bold text-gray-700">{formatAmount(data.totalOutcome)}</p>
      </div>
    </div>
  );
}

// ── Anomaly card ─────────────────────────────────────────────────────────────

function AnomalyBadge({ flag }) {
  if (flag.type === 'first_time') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
        New category
        <Tooltip text="This is the first time you've spent in this category — it may be intentional, but worth reviewing." align="left" fixed />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
      {flag.ratio}× above avg
      <Tooltip text={`This transaction is ${flag.ratio}× higher than your usual spending amount in this category. Your average is used as the baseline.`} align="left" fixed />
    </span>
  );
}

function AnomalyList({ data }) {
  const formatAmount = useFormatAmount();
  if (data.count === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-sm font-semibold text-gray-700">No anomalies this month</p>
        <p className="text-xs text-gray-400 mt-1">All transactions look normal compared to your history</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {data.anomalies.map((a) => (
        <div key={String(a.id)} className="p-4 sm:p-5 hover:bg-gray-50 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 leading-snug min-w-0 flex-1 break-words pr-2">{a.description}</p>
            <p className="text-sm font-bold text-gray-900 shrink-0 tabular-nums whitespace-nowrap">{formatAmount(a.amount)}</p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{a.category}</p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {a.flags.map((f, i) => <AnomalyBadge key={i} flag={f} />)}
          </div>
          <div className="mt-1.5 space-y-0.5">
            {a.flags.map((f, i) => (
              <p key={i} className="text-xs text-gray-500 leading-relaxed">{f.message}</p>
            ))}
          </div>
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

function Section({ title, subtitle, tooltip, children, loading, error }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {tooltip && <Tooltip text={tooltip} align="left" fixed />}
        </div>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {loading ? (
        <SectionSkeleton />
      ) : error ? (
        <div className="p-4 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>
      ) : children}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [ttz,     setTtz]     = useState(null);
  const [explain, setExplain] = useState(null);
  const [anomaly, setAnomaly] = useState(null);
  const [loading, setLoading] = useState({ ttz: true, explain: true, anomaly: true });
  const [errors,  setErrors]  = useState({});

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
  }, []);

  const feedLoading = loading.ttz || loading.explain || loading.anomaly;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <BottomNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-0.5">Insights</h1>
          <p className="text-sm text-gray-500 mb-6">Your finances, translated into plain language</p>

          {/* Smart Insights Feed */}
          <InsightFeed
            explain={explain}
            ttz={ttz}
            anomaly={anomaly}
            loading={feedLoading}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Time to Zero */}
            <Section
              title="⏳ Runway"
              subtitle="How long until your balance runs out at current burn rate"
              tooltip="Calculated by dividing your current net balance by your average daily spending over the last 30 days. Assumes consistent spending going forward."
              loading={loading.ttz}
              error={errors.ttz}
            >
              {ttz && <TimeToZeroCard data={ttz} />}
            </Section>

            {/* Why You're Spending */}
            <Section
              title="🧠 Where It's Going"
              subtitle="Top categories driving your spending this month"
              tooltip="Your top expense categories this month, sorted by total amount. The % change shows how each category compares to last month."
              loading={loading.explain}
              error={errors.explain}
            >
              {explain && (explain.topCategories?.length > 0
                ? <ExplainCard data={explain} />
                : <div className="p-8 text-center text-sm text-gray-500">No spending data for this month yet.</div>
              )}
            </Section>

            {/* Anomaly Detection */}
            <div className="lg:col-span-2">
              <Section
                title="🚨 Unusual Transactions"
                subtitle="Flagged this month — significantly higher than your normal or brand new categories"
                tooltip="A transaction is flagged if its amount is significantly higher than your usual spending in that category, or if it's a category you've never spent in before."
                loading={loading.anomaly}
                error={errors.anomaly}
              >
                {anomaly && <AnomalyList data={anomaly} />}
              </Section>
            </div>

          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
