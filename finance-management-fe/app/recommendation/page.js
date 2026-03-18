'use client';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getRecommendation } from '@/lib/api';
import { formatIDR } from '@/lib/format';

export default function RecommendationPage() {
  const [monthly, setMonthly] = useState('');
  const [spend, setSpend] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const canAfford = result?.resultRecommendation === 1;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Budget Recommendation</h1>
          <p className="text-sm text-gray-500 mb-6">Check if you can afford a purchase based on your weekly spending</p>

          <div className="max-w-md">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
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
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
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
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : null}
                  Check recommendation
                </button>
              </form>
            </div>

            {result && (
              <div className={`rounded-2xl border-2 p-6 ${canAfford ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
                <div className="text-3xl mb-3 text-center">{canAfford ? '✅' : '❌'}</div>
                <h3 className={`text-center font-bold text-lg mb-4 ${canAfford ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {canAfford ? "Go ahead — you can afford it!" : "Hold off — budget is tight"}
                </h3>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-gray-600">Spent this week</span>
                    <span className="font-semibold text-gray-900">{formatIDR(result.outcome)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-gray-600">Weekly budget threshold</span>
                    <span className="font-semibold text-gray-900">{formatIDR(result.threshold)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Budget remaining</span>
                    <span className={`font-bold ${result.leftOverBudget >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatIDR(result.leftOverBudget)}
                    </span>
                  </div>
                </div>

                {!canAfford && (
                  <p className="mt-4 text-xs text-rose-600 text-center">
                    Your remaining budget ({formatIDR(result.leftOverBudget)}) is less than the amount you want to spend.
                  </p>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
