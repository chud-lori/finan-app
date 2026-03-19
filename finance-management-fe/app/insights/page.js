'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getAnomalies, getExplainability, getTimeToZero } from '@/lib/api';
import { formatIDR } from '@/lib/format';
import { SkeletonLine, SkeletonBox } from '@/components/Skeleton';

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
  danger: { bar: 'bg-rose-500',    bg: 'bg-rose-50',    border: 'border-rose-100',    text: 'text-rose-800'    },
  warn:   { bar: 'bg-amber-400',   bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-800'   },
  info:   { bar: 'bg-teal-500',    bg: 'bg-teal-50',    border: 'border-teal-100',    text: 'text-teal-800'    },
  good:   { bar: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-800' },
};

function InsightFeed({ explain, ttz, anomaly, loading }) {
  if (loading) {
    return (
      <div className="mb-8 space-y-2 animate-pulse">
        {['w-4/5', 'w-2/3', 'w-full', 'w-3/4'].map((w, i) => (
          <div key={i} className="flex gap-3 items-center p-4 rounded-xl border border-gray-100 bg-white">
            <div className="w-1 h-8 rounded-full bg-gray-200 flex-shrink-0" />
            <div className={`h-4 ${w} bg-gray-100 rounded`} />
          </div>
        ))}
      </div>
    );
  }

  const insights = buildInsights(explain, ttz, anomaly);
  if (!insights.length) return null;

  return (
    <div className="mb-8">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">What your data is saying</p>
      <div className="space-y-2">
        {insights.map((ins, i) => {
          const s = LEVEL[ins.level] ?? LEVEL.info;
          return (
            <div key={i} className={`flex gap-3 items-start p-4 rounded-xl border ${s.bg} ${s.border}`}>
              <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${s.bar}`} />
              <span className="text-base leading-none flex-shrink-0 mt-0.5">{ins.icon}</span>
              <p className={`text-sm font-medium leading-snug ${s.text}`}>{ins.text}</p>
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
  const cfg = TTZ_CONFIG[data.status] ?? TTZ_CONFIG.safe;
  return (
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
          <p className="text-xs text-gray-400 mb-0.5">Current balance</p>
          <p className="text-sm font-bold text-gray-800">{formatIDR(data.balance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Daily burn</p>
          <p className="text-sm font-bold text-gray-800">{formatIDR(data.dailyBurnRate)}/day</p>
        </div>
      </div>
    </div>
  );
}

// ── Explainability card ──────────────────────────────────────────────────────

function ExplainCard({ data }) {
  const maxPct = Math.max(...data.topCategories.map(c => c.pct), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 h-full">
      <p className="text-sm text-gray-500 mb-5 italic leading-relaxed">"{data.summary}"</p>

      <div className="space-y-4">
        {data.topCategories.map((c, i) => (
          <div key={c.category}>
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-xs font-bold text-gray-300 flex-shrink-0">#{i + 1}</span>
                <span className="text-sm font-semibold text-gray-800 truncate">{cap(c.category)}</span>
                {c.count > 0 && (
                  <span className="text-xs text-gray-400 flex-shrink-0">{c.count}×</span>
                )}
                {c.delta !== null && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    c.delta > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {c.delta > 0 ? '+' : ''}{c.delta}%
                  </span>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-sm font-bold text-gray-900">{formatIDR(c.total)}</span>
                <span className="text-xs text-gray-400 ml-1">({c.pct}%)</span>
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
        <p className="text-sm font-bold text-gray-700">{formatIDR(data.totalOutcome)}</p>
      </div>
    </div>
  );
}

// ── Anomaly card ─────────────────────────────────────────────────────────────

function AnomalyBadge({ flag }) {
  if (flag.type === 'first_time') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
        New category
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
      {flag.ratio}× above avg
    </span>
  );
}

function AnomalyList({ data }) {
  if (data.count === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-sm font-semibold text-gray-700">No anomalies this month</p>
        <p className="text-xs text-gray-400 mt-1">All transactions look normal compared to your history</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-50">
      {data.anomalies.map((a) => (
        <div key={String(a.id)} className="p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{a.description}</p>
              <p className="text-xs text-gray-400 mt-0.5 capitalize">{a.category}</p>
            </div>
            <p className="text-sm font-bold text-gray-900 flex-shrink-0">{formatIDR(a.amount)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {a.flags.map((f, i) => <AnomalyBadge key={i} flag={f} />)}
          </div>
          {a.flags.map((f, i) => (
            <p key={i} className="text-xs text-gray-500 mt-1.5 leading-relaxed">{f.message}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4 animate-pulse">
      <SkeletonLine className="h-4 w-32" />
      <SkeletonLine className="h-3 w-full" />
      <SkeletonLine className="h-3 w-3/4" />
      <SkeletonBox className="h-24 w-full rounded-xl" />
    </div>
  );
}

function Section({ title, subtitle, children, loading, error }) {
  return (
    <section>
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {loading ? (
        <SectionSkeleton />
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      ) : children}
    </section>
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
              loading={loading.ttz}
              error={errors.ttz}
            >
              {ttz && <TimeToZeroCard data={ttz} />}
            </Section>

            {/* Why You're Spending */}
            <Section
              title="🧠 Where It's Going"
              subtitle="Top categories driving your spending this month"
              loading={loading.explain}
              error={errors.explain}
            >
              {explain && (explain.topCategories?.length > 0
                ? <ExplainCard data={explain} />
                : <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">No spending data for this month yet.</div>
              )}
            </Section>

            {/* Anomaly Detection */}
            <div className="lg:col-span-2">
              <Section
                title="🚨 Unusual Transactions"
                subtitle="Flagged this month — significantly higher than your normal or brand new categories"
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
