'use client';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getTransactions, deleteTransaction } from '@/lib/api';
import { formatIDR, formatDate, toTitleCase } from '@/lib/format';

const MONTHS = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function buildMonthOptions() {
  const now = new Date();
  const options = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push({ value: val, label: `${MONTHS[d.getMonth() + 1]} ${d.getFullYear()}` });
  }
  return options;
}

export default function DashboardPage() {
  const [data, setData] = useState({ transactions: [], balance: { amount: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [deleting, setDeleting] = useState(null);

  const monthOptions = buildMonthOptions();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getTransactions({ month });
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    setDeleting(id);
    try {
      await deleteTransaction(id);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const txns = data.transactions || [];
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const outcome = txns.filter(t => t.type === 'outcome').reduce((s, t) => s + t.amount, 0);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              label="Balance"
              value={formatIDR(data.balance?.amount ?? 0)}
              color="indigo"
              icon="💰"
            />
            <StatCard
              label="Income this month"
              value={formatIDR(income)}
              color="emerald"
              icon="📈"
            />
            <StatCard
              label="Expense this month"
              value={formatIDR(outcome)}
              color="rose"
              icon="📉"
            />
          </div>

          {/* Table card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Transactions</h2>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {monthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : txns.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-sm">No transactions for this month</p>
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
                      <th className="px-5 py-3 text-left font-medium hidden md:table-cell">Time</th>
                      <th className="px-5 py-3 text-center font-medium w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {txns.map((t, i) => (
                      <tr key={t.id || t._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">{t.description}</td>
                        <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-xs">{toTitleCase(t.category)}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-800">
                          {formatIDR(t.amount)}
                        </td>
                        <td className="px-5 py-3">
                          <TypeBadge type={t.type} />
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                          {formatDate(t.time, t.transaction_timezone)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <button
                            onClick={() => handleDelete(t.id || t._id)}
                            disabled={deleting === (t.id || t._id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Delete"
                          >
                            {deleting === (t.id || t._id) ? (
                              <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
        </main>
      </div>
    </AuthGuard>
  );
}

function StatCard({ label, value, color, icon }) {
  const colors = {
    indigo: 'from-indigo-500 to-indigo-600',
    emerald: 'from-emerald-500 to-emerald-600',
    rose: 'from-rose-500 to-rose-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

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
