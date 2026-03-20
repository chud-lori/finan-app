'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getTransactions, deleteTransaction, getActiveMonths, updatePreferences } from '@/lib/api';
import { formatIDR, formatDate, toTitleCase } from '@/lib/format';
import { SkeletonStatCards, SkeletonTableRows, SkeletonLine } from '@/components/Skeleton';
import Tooltip from '@/components/Tooltip';

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LIMIT = 20;

function toYM(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function ymLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_LABELS[parseInt(m, 10)]} ${y}`;
}

// Build a gapless month list: from earliest active month (or current) back to current.
// No gaps — every month between earliest-with-data and today is included.
function buildMonthOptions(activeMonths = []) {
  const now = new Date();
  const currentYM = toYM(now);

  if (activeMonths.length === 0) {
    return [{ value: currentYM, label: ymLabel(currentYM), hasData: false }];
  }

  const earliest = activeMonths[0]; // already sorted asc from backend
  const [ey, em] = earliest.split('-').map(Number);

  const options = [];
  let y = now.getFullYear(), m = now.getMonth() + 1;

  while (true) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    options.push({ value: ym, label: ymLabel(ym), hasData: activeMonths.includes(ym) });
    if (y === ey && m === em) break;
    m--;
    if (m === 0) { m = 12; y--; }
    // safety: don't go before year 2000
    if (y < 2000) break;
  }

  return options;
}

// ─── Custom month picker dropdown ─────────────────────────────────────────────
function MonthPicker({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll selected item into view when opening
  useEffect(() => {
    if (!open || !listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const selected = options.find(o => o.value === value) || options[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 ${
          open ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
        }`}
      >
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{selected?.label ?? '—'}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-44 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {options.map((o) => {
              const isSelected = o.value === value;
              return (
                <button
                  key={o.value}
                  data-selected={isSelected}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-sm transition-colors ${
                    isSelected
                      ? 'bg-teal-50 text-teal-700 font-semibold'
                      : o.hasData
                        ? 'text-gray-800 hover:bg-gray-50'
                        : 'text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <span>{o.label}</span>
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-teal-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {!isSelected && o.hasData && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sort button ─────────────────────────────────────────────────────────────
function SortButton({ field, label, current, order, onClick }) {
  const active = current === field;
  return (
    <button
      onClick={() => onClick(field)}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
        active
          ? 'bg-teal-50 border-teal-200 text-teal-700'
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
                  ? 'bg-teal-600 border-teal-600 text-white'
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
  const [search, setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy]   = useState('time');
  const [order, setOrder]     = useState('desc');
  const [page, setPage]       = useState(1);

  const [activeMonths, setActiveMonths] = useState([]);

  // Bootstrap from URL params (e.g. navigated here from Analytics)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('category');
    const mo  = params.get('month');
    if (cat) setCategoryFilter(decodeURIComponent(cat));
    if (mo && /^\d{4}-\d{2}$/.test(mo)) setMonth(mo);
  }, []);

  // Fetch active months once on mount
  useEffect(() => {
    getActiveMonths()
      .then(res => setActiveMonths(res.data?.months ?? []))
      .catch(() => {}); // non-critical, falls back to current month only
  }, []);

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

  const monthOptions = buildMonthOptions(activeMonths);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getTransactions({ month, search: debouncedSearch, sortBy, order, page, limit: LIMIT, category: categoryFilter || undefined });
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, debouncedSearch, sortBy, order, page, categoryFilter]);

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
  const budget  = data.monthlyBudget  ?? 0;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

          {/* Stats */}
          {loading && !data.transactions.length ? <SkeletonStatCards /> : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard label="Balance" value={formatIDR(data.balance?.amount ?? 0)} icon="💰"
                tip="Your all-time net balance — total income ever received minus total expenses ever recorded. Not limited to this month." />
              <StatCard label="Income this month" value={formatIDR(income)} icon="📈"
                tip="Total income transactions recorded in the selected month." />
              <BudgetCard expense={expense} budget={budget} onSaved={load} />
            </div>
          )}

          {/* Table card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 shrink-0">Transactions</h2>
              <div className="flex items-center gap-2">
                <MonthPicker
                  value={month}
                  options={monthOptions}
                  onChange={handleMonthChange}
                />
                <Link
                  href="/add"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">Add</span>
                </Link>
              </div>
            </div>

            {/* Active category filter badge */}
            {categoryFilter && (
              <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 bg-teal-50">
                <span className="text-xs text-teal-600 font-medium">Filtered by category:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">
                  {toTitleCase(categoryFilter)}
                  <button
                    onClick={() => { setCategoryFilter(''); setPage(1); }}
                    className="ml-0.5 text-teal-400 hover:text-teal-600"
                    title="Clear filter"
                  >✕</button>
                </span>
              </div>
            )}

            {/* Search + sort toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search description…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
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
                          <button
                            onClick={() => { setCategoryFilter(t.category); setPage(1); }}
                            className={`px-2 py-0.5 rounded-md text-xs transition-colors hover:bg-teal-100 hover:text-teal-700 ${
                              categoryFilter === t.category
                                ? 'bg-teal-100 text-teal-700 font-medium'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                            title="Filter by this category"
                          >
                            {toTitleCase(t.category)}
                          </button>
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

function StatCard({ label, value, icon, tip }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-500">{label}</span>
          {tip && <Tooltip text={tip} />}
        </div>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function BudgetCard({ expense, budget, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput]     = useState('');
  const [saving, setSaving]   = useState(false);

  const pct    = budget > 0 ? Math.min(Math.round((expense / budget) * 100), 999) : null;
  const barPct = budget > 0 ? Math.min((expense / budget) * 100, 100) : 0;
  const barColor  = pct === null ? 'bg-gray-200' : pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500';
  const pctColor  = pct === null ? '' : pct >= 100 ? 'text-rose-600' : pct >= 80 ? 'text-amber-600' : 'text-emerald-600';

  const startEdit = () => { setInput(budget > 0 ? String(budget) : ''); setEditing(true); };

  const handleSave = async () => {
    const val = parseFloat(String(input).replace(/[^0-9.]/g, ''));
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    try {
      await updatePreferences({ monthlyBudget: Math.round(val) });
      await onSaved();
      setEditing(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-500">Budget</span>
          <Tooltip text="Monthly spending budget. Edit it anytime — the bar tracks how much of it you've used this month." />
        </div>
        <button onClick={startEdit} title="Edit budget" className="text-gray-400 hover:text-teal-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Monthly budget (IDR)"
            min={0}
          />
          <button onClick={handleSave} disabled={saving} className="px-2.5 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50 shrink-0">
            {saving ? '…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="px-2.5 py-1.5 rounded-lg text-gray-500 text-xs hover:bg-gray-100 shrink-0">✕</button>
        </div>
      ) : budget === 0 ? (
        <>
          <div className="text-xl font-bold text-gray-900 mb-1">{formatIDR(expense)} <span className="text-sm font-normal text-gray-400">spent</span></div>
          <button onClick={startEdit} className="text-xs text-teal-600 hover:underline font-medium">+ Set monthly budget</button>
        </>
      ) : (
        <>
          <div className="text-xl font-bold text-gray-900 mb-2">
            {formatIDR(expense)}
            <span className="text-sm font-medium text-gray-400 ml-1.5">/ {formatIDR(budget)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-1.5 rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${barPct}%` }} />
            </div>
            <span className={`text-xs font-semibold tabular-nums shrink-0 ${pctColor}`}>{pct}%</span>
          </div>
        </>
      )}
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
