'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getAnomalies, getExplainability, getTimeToZero } from '@/lib/api';
import { formatIDR } from '@/lib/format';

// ── Time-to-Zero card ────────────────────────────────────────────────────────

const TTZ_CONFIG = {
  safe:         { label: 'Safe',          bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400', text: 'text-emerald-700' },
  warning:      { label: 'Warning',       bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400',   text: 'text-amber-700'   },
  critical:     { label: 'Critical',      bg: 'bg-rose-50',    border: 'border-rose-200',     dot: 'bg-rose-400',    text: 'text-rose-700'    },
  already_zero: { label: 'Already zero',  bg: 'bg-rose-50',    border: 'border-rose-200',     dot: 'bg-rose-500',    text: 'text-rose-700'    },
  no_spend:     { label: 'No recent spend', bg: 'bg-gray-50',  border: 'border-gray-200',     dot: 'bg-gray-300',    text: 'text-gray-600'    },
};

function TimeToZeroCard({ data }) {
  const cfg = TTZ_CONFIG[data.status] ?? TTZ_CONFIG.safe;
  return (
    <div className={`rounded-2xl border p-5 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <h4 className={`text-sm font-semibold ${cfg.text}`}>Status: {cfg.label}</h4>
      </div>

      {data.daysToZero !== null ? (
        <>
          <p className={`text-4xl font-bold mb-1 ${cfg.text}`}>
            {data.daysToZero} <span className="text-xl font-semibold">days</span>
          </p>
          <p className="text-xs text-gray-500 mb-4">
            until your balance hits zero at current spending rate
          </p>
          {data.projectedZeroDate && (
            <p className="text-xs text-gray-500">
              Projected zero date:{' '}
              <span className="font-medium text-gray-700">
                {new Date(data.projectedZeroDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500">No spending in the last 30 days — nothing to project.</p>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Current balance</p>
          <p className="text-sm font-semibold text-gray-800">{formatIDR(data.balance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Daily burn rate</p>
          <p className="text-sm font-semibold text-gray-800">{formatIDR(data.dailyBurnRate)}/day</p>
        </div>
      </div>
    </div>
  );
}

// ── Explainability card ──────────────────────────────────────────────────────

function ExplainCard({ data }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-sm text-gray-700 mb-4 font-medium italic">"{data.summary}"</p>

      <div className="space-y-3">
        {data.topCategories.map((c, i) => (
          <div key={c.category}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                <span className="text-sm font-medium text-gray-800">{c.category}</span>
                {c.delta !== null && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    c.delta > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {c.delta > 0 ? '+' : ''}{c.delta}% vs last month
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-gray-900">{formatIDR(c.total)}</span>
                <span className="text-xs text-gray-400 ml-1.5">({c.pct}%)</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-indigo-400" style={{ width: `${c.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Total spending this month: <span className="font-semibold text-gray-600">{formatIDR(data.totalOutcome)}</span>
      </p>
    </div>
  );
}

// ── Anomaly card ─────────────────────────────────────────────────────────────

function AnomalyBadge({ flag }) {
  if (flag.type === 'first_time') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
        New category
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
      {flag.ratio}x above avg
    </span>
  );
}

function AnomalyList({ data }) {
  if (data.count === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-center">
        <p className="text-2xl mb-2">✅</p>
        <p className="text-sm font-medium text-gray-700">No anomalies detected this month</p>
        <p className="text-xs text-gray-400 mt-1">All transactions look normal compared to your history</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
      {data.anomalies.map((a) => (
        <div key={String(a.id)} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{a.description}</p>
              <p className="text-xs text-gray-400 mt-0.5">{a.category}</p>
            </div>
            <p className="text-sm font-semibold text-gray-900 flex-shrink-0">{formatIDR(a.amount)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {a.flags.map((f, i) => <AnomalyBadge key={i} flag={f} />)}
          </div>
          {a.flags.map((f, i) => (
            <p key={i} className="text-xs text-gray-500 mt-1">{f.message}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children, loading, error }) {
  return (
    <section>
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 flex justify-center">
          <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
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

    load('ttz',     getTimeToZero,    setTtz);
    load('explain', getExplainability, setExplain);
    load('anomaly', getAnomalies,     setAnomaly);
  }, []);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Financial Insights</h1>
          <p className="text-sm text-gray-500 mb-8">Anomaly detection, spending explainability, and runway analysis</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Time to Zero */}
            <Section
              title="⏳ Time-to-Zero"
              subtitle="How long until your balance runs out at current burn rate"
              loading={loading.ttz}
              error={errors.ttz}
            >
              {ttz && <TimeToZeroCard data={ttz} />}
            </Section>

            {/* Why You're Broke */}
            <Section
              title="🧠 Why You're Spending"
              subtitle="Root-cause breakdown of where your money is going this month"
              loading={loading.explain}
              error={errors.explain}
            >
              {explain && (explain.topCategories?.length > 0
                ? <ExplainCard data={explain} />
                : <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center text-sm text-gray-500">No spending data for this month yet.</div>
              )}
            </Section>

            {/* Anomaly Detection */}
            <div className="lg:col-span-2">
              <Section
                title="🚨 Anomaly Detection"
                subtitle="Unusual transactions flagged this month — higher than normal or first time in a category"
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
