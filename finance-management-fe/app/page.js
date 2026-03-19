'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getTransactions, deleteTransaction } from '@/lib/api';
import { formatIDR, formatDate, toTitleCase } from '@/lib/format';
import { SkeletonStatCards, SkeletonTableRows, SkeletonLine } from '@/components/Skeleton';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LIMIT = 20;

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

// ─── Sort button ─────────────────────────────────────────────────────────────
function SortButton({ field, label, current, order, onClick }) {
  const active = current === field;
  return (
    <button
      onClick={() => onClick(field)}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
        active
          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
      }`}
    >
      {label}
      <span className={`transition-transform ${active ? 'opacity-100' : 'opacity-30'}`}>
        {active && order === 'asc' ? '↑' : '↓'}
      </span>
    </button>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, limit, onPage }) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);

  // Build page numbers: always show first, last, current ±1, with ellipsis
  const pages = new Set([1, totalPages, page, page - 1, page + 1].filter(p => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  const withGaps = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) withGaps.push('…');
    withGaps.push(sorted[i]);
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-400">
        Showing {start}–{end} of {total} transactions
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ‹ Prev
        </button>
        {withGaps.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1.5 text-gray-400 text-xs">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-8 h-8 rounded-lg border text-xs font-medium transition-colors ${
                p === page
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data, setData]       = useState({ transactions: [], balance: { amount: 0 }, total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [deleting, setDeleting] = useState(null);

  const [month, setMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [search, setSearch]   = useState('');
  const [sortBy, setSortBy]   = useState('time');
  const [order, setOrder]     = useState('desc');
  const [page, setPage]       = useState(1);

  // Debounce search input
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef(null);
  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const monthOptions = buildMonthOptions();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getTransactions({ month, search: debouncedSearch, sortBy, order, page, limit: LIMIT });
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, debouncedSearch, sortBy, order, page]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setOrder(o => o === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setOrder('desc');
    }
    setPage(1);
  };

  const handleMonthChange = (val) => { setMonth(val); setPage(1); };

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

  const txns    = data.transactions || [];
  const income  = data.monthlyIncome  ?? 0;
  const expense = data.monthlyExpense ?? 0;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

          {/* Stats */}
          {loading && !data.transactions.length ? <SkeletonStatCards /> : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard label="Balance"            value={formatIDR(data.balance?.amount ?? 0)} color="indigo"  icon="💰" />
              <StatCard label="Income this month"  value={formatIDR(income)}                    color="emerald" icon="📈" />
              <StatCard label="Expense this month" value={formatIDR(expense)}                   color="rose"    icon="📉" />
            </div>
          )}

          {/* Table card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 shrink-0">Transactions</h2>
              <select
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {monthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Search + sort toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search description…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                {search && (
                  <button
                    onClick={() => handleSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-400 mr-0.5">Sort:</span>
                <SortButton field="time"        label="Date"        current={sortBy} order={order} onClick={handleSort} />
                <SortButton field="amount"      label="Amount"      current={sortBy} order={order} onClick={handleSort} />
                <SortButton field="description" label="Description" current={sortBy} order={order} onClick={handleSort} />
              </div>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
            )}

            {loading ? (
              <SkeletonTableRows rows={LIMIT} />
            ) : txns.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">{search ? '🔍' : '📭'}</div>
                <p className="text-sm">{search ? `No results for "${search}"` : 'No transactions for this month'}</p>
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
                        <td className="px-5 py-3 text-gray-400">{(page - 1) * LIMIT + i + 1}</td>
                        <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">{t.description}</td>
                        <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-xs">{toTitleCase(t.category)}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatIDR(t.amount)}</td>
                        <td className="px-5 py-3"><TypeBadge type={t.type} /></td>
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
                              <span className="w-4 h-4 bg-gray-200 rounded animate-pulse inline-block" />
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

            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              limit={LIMIT}
              onPage={setPage}
            />
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

function StatCard({ label, value, color, icon }) {
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
