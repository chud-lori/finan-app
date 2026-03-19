'use client';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getRecommendation } from '@/lib/api';
import { formatIDR } from '@/lib/format';

function ProgressBar({ value, max, color = 'teal' }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const colors = {
    teal:  'bg-teal-500',
    emerald: 'bg-emerald-500',
    rose:    'bg-rose-500',
    amber:   'bg-amber-400',
  };
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all ${colors[color] ?? colors.teal}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatRow({ label, value, sub, valueClass = 'text-gray-900' }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div>
        <span className="text-sm text-gray-600">{label}</span>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

const VELOCITY_CONFIG = {
  on_track: { label: 'On track', color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-400' },
  fast:     { label: 'Spending fast',      color: 'text-amber-600',  bg: 'bg-amber-50',  dot: 'bg-amber-400'  },
  very_fast:{ label: 'Spending very fast', color: 'text-rose-600',   bg: 'bg-rose-50',   dot: 'bg-rose-400'   },
};

export default function RecommendationPage() {
  const [monthly, setMonthly] = useState('');
  const [spend,   setSpend]   = useState('');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const parseNum = (v) => Number(v.replace(/[^0-9]/g, ''));
  const fmtInput = (v) => {
    const d = v.replace(/[^0-9]/g, '');
    return d ? Number(d).toLocaleString('id-ID') : '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await getRecommendation(parseNum(monthly), parseNum(spend));
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canAfford = result?.canAfford === 1;
  const velocity  = result ? VELOCITY_CONFIG[result.velocityStatus] ?? VELOCITY_CONFIG.on_track : null;
  const budget    = parseNum(monthly);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Budget Recommendation</h1>
          <p className="text-sm text-gray-500 mb-6">
            We'll analyse your actual spending this month to see if you can afford it
          </p>

          <div className="max-w-lg space-y-5">
            {/* Input card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Monthly budget (IDR)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">Rp</span>
                    <input
                      type="text"
                      required
                      value={monthly}
                      onChange={(e) => setMonthly(fmtInput(e.target.value))}
                      placeholder="10,000,000"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount you want to spend (IDR)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">Rp</span>
                    <input
                      type="text"
                      required
                      value={spend}
                      onChange={(e) => setSpend(fmtInput(e.target.value))}
                      placeholder="500,000"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Analyse
                </button>
              </form>
            </div>

            {/* Result */}
            {result && (
              <div className="space-y-4">
                {/* Verdict */}
                <div className={`rounded-2xl border-2 p-5 text-center ${canAfford ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
                  <div className="text-3xl mb-2">{canAfford ? '✅' : '❌'}</div>
                  <h3 className={`font-bold text-lg ${canAfford ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {canAfford ? 'Go ahead — you can afford it' : 'Hold off — budget is tight'}
                  </h3>
                  <p className={`text-sm mt-1 ${canAfford ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {canAfford
                      ? `You have ${formatIDR(result.budgetRemaining)} projected left after this`
                      : `You'd be ${formatIDR(Math.abs(result.budgetRemaining - result.desiredSpend))} over budget`}
                  </p>
                </div>

                {/* This month snapshot */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h4 className="text-sm font-semibold text-gray-700 mb-4">This month's snapshot</h4>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>Spent so far</span>
                      <span>{formatIDR(result.actualSpend)} / {formatIDR(budget)}</span>
                    </div>
                    <ProgressBar
                      value={result.actualSpend}
                      max={budget}
                      color={result.actualSpend / budget > 0.8 ? 'rose' : result.actualSpend / budget > 0.6 ? 'amber' : 'teal'}
                    />
                  </div>

                  <StatRow
                    label="Actual spend this month"
                    value={formatIDR(result.actualSpend)}
                    sub={`${result.daysElapsed} day${result.daysElapsed !== 1 ? 's' : ''} elapsed`}
                  />
                  <StatRow
                    label="Daily burn rate"
                    value={`${formatIDR(result.dailyBurnRate)} / day`}
                  />
                  <StatRow
                    label="Projected month total"
                    value={formatIDR(result.projectedTotal)}
                    sub={`${result.daysRemaining} days remaining`}
                    valueClass={result.projectedTotal > budget ? 'text-rose-600' : 'text-gray-900'}
                  />
                  <StatRow
                    label="Projected budget left"
                    value={formatIDR(result.budgetRemaining)}
                    valueClass={result.budgetRemaining < 0 ? 'text-rose-600' : 'text-emerald-600'}
                  />
                </div>

                {/* Savings rate impact */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h4 className="text-sm font-semibold text-gray-700 mb-4">Savings rate impact</h4>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 text-center">
                      <p className="text-xs text-gray-400 mb-1">Without purchase</p>
                      <p className={`text-2xl font-bold ${result.savingsRateWithout >= 20 ? 'text-emerald-600' : result.savingsRateWithout >= 0 ? 'text-amber-500' : 'text-rose-600'}`}>
                        {result.savingsRateWithout}%
                      </p>
                    </div>
                    <div className="text-gray-300 text-xl">→</div>
                    <div className="flex-1 text-center">
                      <p className="text-xs text-gray-400 mb-1">With purchase</p>
                      <p className={`text-2xl font-bold ${result.savingsRateWith >= 20 ? 'text-emerald-600' : result.savingsRateWith >= 0 ? 'text-amber-500' : 'text-rose-600'}`}>
                        {result.savingsRateWith}%
                      </p>
                    </div>
                  </div>
                  {result.savingsRateWithout - result.savingsRateWith > 0 && (
                    <p className="text-xs text-center text-gray-400 mt-3">
                      This purchase drops your savings rate by {result.savingsRateWithout - result.savingsRateWith} percentage points
                    </p>
                  )}
                </div>

                {/* Velocity */}
                <div className={`rounded-2xl border border-gray-200 p-4 flex items-center gap-3 ${velocity.bg}`}>
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${velocity.dot}`} />
                  <div>
                    <p className={`text-sm font-semibold ${velocity.color}`}>
                      Spending velocity: {velocity.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatIDR(result.dailyBurnRate)}/day actual vs {formatIDR(Math.round(budget / 30))}/day expected
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
