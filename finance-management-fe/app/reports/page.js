'use client';
import { useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getRangeTransactions, deleteTransaction } from '@/lib/api';
import { formatDate, toTitleCase } from '@/lib/format';
import { useFormatAmount } from '@/components/CurrencyContext';

// ─── Quick presets ────────────────────────────────────────────────────────────
function fmt(d) { return d.toISOString().slice(0, 10); }

const PRESETS = [
  {
    label: 'Last 7 days',
    range: () => { const e = new Date(), s = new Date(); s.setDate(e.getDate() - 6); return [fmt(s), fmt(e)]; },
  },
  {
    label: 'Last 30 days',
    range: () => { const e = new Date(), s = new Date(); s.setDate(e.getDate() - 29); return [fmt(s), fmt(e)]; },
  },
  {
    label: 'This month',
    range: () => { const n = new Date(); return [fmt(new Date(n.getFullYear(), n.getMonth(), 1)), fmt(n)]; },
  },
  {
    label: 'Last 3 months',
    range: () => { const e = new Date(), s = new Date(); s.setMonth(e.getMonth() - 3); s.setDate(1); return [fmt(s), fmt(e)]; },
  },
  {
    label: 'This year',
    range: () => { const n = new Date(); return [fmt(new Date(n.getFullYear(), 0, 1)), fmt(n)]; },
  },
];

// ─── Type badge ───────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  return type === 'income' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">↑ Income</span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">↓ Expense</span>
  );
}

// ─── Category breakdown ───────────────────────────────────────────────────────
function CategoryBreakdown({ transactions }) {
  const formatAmount = useFormatAmount();
  const expenses = transactions.filter(t => t.type === 'expense');
  const total = expenses.reduce((s, t) => s + t.amount, 0);
  if (!total) return null;

  const catMap = {};
  expenses.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const COLORS = ['bg-teal-500', 'bg-rose-400', 'bg-amber-400', 'bg-emerald-400', 'bg-blue-400', 'bg-purple-400'];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Expense breakdown</h3>
      <div className="space-y-2.5">
        {cats.map(([cat, amt], i) => {
          const pct = Math.round((amt / total) * 100);
          return (
            <div key={cat}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-700 font-medium capitalize">{toTitleCase(cat)}</span>
                <span className="text-gray-500">{formatAmount(amt)} <span className="text-gray-400">({pct}%)</span></span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className={`h-1.5 rounded-full ${COLORS[i % COLORS.length]}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const formatAmount = useFormatAmount();
  const today = fmt(new Date());
  const [start,    setStart]    = useState(today);
  const [end,      setEnd]      = useState(today);
  const [active,   setActive]   = useState(null); // active preset label
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [deleting, setDeleting] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'income' | 'expense'

  const fetchRange = useCallback(async (s, e) => {
    setLoading(true); setError('');
    try {
      const res = await getRangeTransactions(s, e);
      setResult(res.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  const handlePreset = (preset) => {
    const [s, e] = preset.range();
    setStart(s); setEnd(e); setActive(preset.label);
    fetchRange(s, e);
  };

  const handleSearch = (ev) => {
    ev.preventDefault();
    setActive(null);
    fetchRange(start, end);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    setDeleting(id);
    try {
      await deleteTransaction(id);
      setResult(r => {
        const deleted = r.transactions.find(t => (t.id || t._id) === id);
        return {
          ...r,
          transactions: r.transactions.filter(t => (t.id || t._id) !== id),
          income:  r.income  - (deleted?.type === 'income'  ? deleted.amount : 0),
          expense: r.expense - (deleted?.type === 'expense' ? deleted.amount : 0),
        };
      });
    } catch (err) { alert(err.message); }
    finally { setDeleting(null); }
  };

  const net = result ? result.income - result.expense : 0;
  const txns = result
    ? (typeFilter === 'all' ? result.transactions : result.transactions.filter(t => t.type === typeFilter))
    : [];

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Reports</h1>
          <p className="text-sm text-gray-500 mb-6">View and analyse transactions across any custom date range</p>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => handlePreset(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  active === p.label
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range form */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">From</label>
                <input type="date" value={start} onChange={e => { setStart(e.target.value); setActive(null); }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">To</label>
                <input type="date" value={end} onChange={e => { setEnd(e.target.value); setActive(null); }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60 whitespace-nowrap flex items-center justify-center gap-2">
                {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Search
              </button>
            </form>
          </div>

          {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>}

          {result && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs text-gray-500 mb-1">Income</p>
                  <p className="text-base sm:text-lg font-bold text-emerald-600 tabular-nums">{formatAmount(result.income)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs text-gray-500 mb-1">Expense</p>
                  <p className="text-base sm:text-lg font-bold text-rose-600 tabular-nums">{formatAmount(result.expense)}</p>
                </div>
                <div className={`col-span-2 sm:col-span-1 rounded-2xl border shadow-sm p-4 ${net >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <p className="text-xs text-gray-500 mb-1">Net</p>
                  <p className={`text-base sm:text-lg font-bold tabular-nums ${net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {net >= 0 ? '+' : ''}{formatAmount(net)}
                  </p>
                </div>
              </div>

              {/* Breakdown + table side by side on lg */}
              <div className="flex flex-col lg:flex-row gap-5 items-start">
                {/* Category breakdown */}
                {result.transactions.some(t => t.type === 'expense') && (
                  <div className="w-full lg:w-64 shrink-0">
                    <CategoryBreakdown transactions={result.transactions} />
                  </div>
                )}

                {/* Transactions */}
                <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="font-semibold text-gray-900">Transactions</h2>
                      <p className="text-xs text-gray-400 mt-0.5">{result.transactions.length} records</p>
                    </div>
                    {/* Type filter */}
                    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                      {['all', 'income', 'expense'].map(f => (
                        <button key={f} onClick={() => setTypeFilter(f)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize ${
                            typeFilter === f ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                          }`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {txns.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <div className="text-3xl mb-2">📭</div>
                      <p className="text-sm">No transactions in this range</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <th className="px-5 py-3 text-left font-medium w-8">#</th>
                            <th className="px-5 py-3 text-left font-medium">Description</th>
                            <th className="px-5 py-3 text-left font-medium hidden sm:table-cell">Category</th>
                            <th className="px-5 py-3 text-right font-medium">Amount</th>
                            <th className="px-5 py-3 text-left font-medium">Type</th>
                            <th className="px-5 py-3 text-left font-medium hidden md:table-cell">Date</th>
                            <th className="px-5 py-3 text-center font-medium w-12"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {txns.map((t, i) => (
                            <tr key={t.id || t._id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                              <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">{t.description}</td>
                              <td className="px-5 py-3 hidden sm:table-cell">
                                <span className="px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-600 capitalize">
                                  {toTitleCase(t.category)}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatAmount(t.amount)}</td>
                              <td className="px-5 py-3"><TypeBadge type={t.type} /></td>
                              <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                                {formatDate(t.time, t.transaction_timezone)}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <button onClick={() => handleDelete(t.id || t._id)}
                                  disabled={deleting === (t.id || t._id)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                                  {deleting === (t.id || t._id) ? (
                                    <span className="w-4 h-4 bg-gray-200 rounded animate-pulse inline-block" />
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  )}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
