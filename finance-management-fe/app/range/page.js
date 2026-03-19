'use client';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getRangeTransactions, deleteTransaction } from '@/lib/api';
import { formatIDR, formatDate } from '@/lib/format';

function TypeBadge({ type }) {
  if (type === 'income') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        ↑ Income
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
      ↓ Expense
    </span>
  );
}

export default function RangePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await getRangeTransactions(start, end);
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    setDeleting(id);
    try {
      await deleteTransaction(id);
      setResult(r => ({
        ...r,
        transactions: r.transactions.filter(t => (t.id || t._id) !== id),
        income: r.income - (r.transactions.find(t => (t.id || t._id) === id && t.type === 'income')?.amount || 0),
        expense: r.expense - (r.transactions.find(t => (t.id || t._id) === id && t.type === 'expense')?.amount || 0),
      }));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-6">Date Range</h1>

          {/* Filter form */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Start date</label>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">End date</label>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60 whitespace-nowrap flex items-center gap-2"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                Search
              </button>
            </form>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
          )}

          {result && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <p className="text-sm text-gray-500 mb-1">Total Income</p>
                  <p className="text-xl font-bold text-emerald-600">{formatIDR(result.income)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <p className="text-sm text-gray-500 mb-1">Total Expense</p>
                  <p className="text-xl font-bold text-rose-600">{formatIDR(result.expense)}</p>
                </div>
              </div>

              {/* Transactions table */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Transactions</h2>
                  <span className="text-sm text-gray-400">{result.transactions.length} records</span>
                </div>
                {result.transactions.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-3xl mb-2">📭</div>
                    <p className="text-sm">No transactions in this range</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                          <th className="px-5 py-3 text-left font-medium">#</th>
                          <th className="px-5 py-3 text-left font-medium">Description</th>
                          <th className="px-5 py-3 text-right font-medium">Amount</th>
                          <th className="px-5 py-3 text-left font-medium">Type</th>
                          <th className="px-5 py-3 text-left font-medium hidden md:table-cell">Time</th>
                          <th className="px-5 py-3 text-center font-medium w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {result.transactions.map((t, i) => (
                          <tr key={t.id || t._id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                            <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">{t.description}</td>
                            <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatIDR(t.amount)}</td>
                            <td className="px-5 py-3"><TypeBadge type={t.type} /></td>
                            <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">{formatDate(t.time, t.transaction_timezone)}</td>
                            <td className="px-5 py-3 text-center">
                              <button
                                onClick={() => handleDelete(t.id || t._id)}
                                disabled={deleting === (t.id || t._id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
