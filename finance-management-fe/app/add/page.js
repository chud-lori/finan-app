'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import AuthGuard from '@/components/AuthGuard';
import DateTimePicker from '@/components/DateTimePicker';
import { addTransaction, getCategories, getCategorySuggestions, getTransactions } from '@/lib/api';
import { toTitleCase, formatDate } from '@/lib/format';
import { useFormatAmount } from '@/components/CurrencyContext';

// ─── Category picker — click-to-open dropdown ─────────────────────────────────
function CategoryCombobox({ value, onChange, categories }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const containerRef      = useRef(null);
  const inputRef          = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered   = categories.filter(c => c.toLowerCase().includes(query.toLowerCase()));
  const trimmed    = query.trim().toLowerCase();
  const exactMatch = categories.some(c => c.toLowerCase() === trimmed);
  const showCreate = trimmed && !exactMatch;

  const select = (cat) => {
    onChange(cat.toLowerCase());
    setOpen(false);
    setQuery('');
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  };

  const openDropdown = () => {
    setOpen(true);
    // autofocus the search input after paint
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition ${
          value ? 'border-teal-400 bg-teal-50' : 'border-gray-300 bg-white'
        }`}
      >
        <span className={value ? 'text-gray-900 font-medium capitalize' : 'text-gray-400'}>
          {value ? toTitleCase(value) : 'Select or create a category…'}
        </span>
        <span className="flex items-center gap-1.5 shrink-0 ml-2">
          {value && (
            <span
              onClick={clear}
              className="text-gray-300 hover:text-gray-500 text-xs px-1 rounded transition-colors"
              title="Clear"
            >
              ✕
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-20 top-full mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search or type to create…"
              value={query}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            />
          </div>

          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.map(c => (
              <li
                key={c}
                onClick={() => select(c)}
                className={`px-3.5 py-2 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                  value === c.toLowerCase()
                    ? 'bg-teal-50 text-teal-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="capitalize">{toTitleCase(c)}</span>
                {value === c.toLowerCase() && (
                  <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </li>
            ))}

            {filtered.length === 0 && !showCreate && (
              <li className="px-3.5 py-4 text-sm text-gray-400 text-center">
                No categories yet — type to create one
              </li>
            )}

            {showCreate && (
              <li
                onClick={() => select(trimmed)}
                className="px-3.5 py-2.5 text-sm cursor-pointer text-teal-600 hover:bg-teal-50 flex items-center gap-2 border-t border-gray-100"
              >
                <span className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center text-teal-500 font-bold text-xs shrink-0">+</span>
                Create &ldquo;{toTitleCase(trimmed)}&rdquo;
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Side panel ───────────────────────────────────────────────────────────────
function SidePanel() {
  const formatAmount = useFormatAmount();
  const [recent, setRecent]   = useState([]);
  const [todayIncome, setTodayIncome]   = useState(0);
  const [todayExpense, setTodayExpense] = useState(0);
  const [loadingPanel, setLoadingPanel] = useState(true);

  useEffect(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    getTransactions({ month, sortBy: 'time', order: 'desc', limit: 10 })
      .then(res => {
        const txns = res.data?.transactions || [];
        const todayStr = now.toDateString();
        let inc = 0, exp = 0;
        txns.forEach(t => {
          if (new Date(t.time).toDateString() === todayStr) {
            if (t.type === 'income')  inc += t.amount;
            if (t.type === 'expense') exp += t.amount;
          }
        });
        setTodayIncome(inc);
        setTodayExpense(exp);
        setRecent(txns.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoadingPanel(false));
  }, []);

  return (
    <div className="space-y-4">
      {/* Today summary */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Today&apos;s Summary</h3>
        {loadingPanel ? (
          <div className="space-y-2">
            <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Income
              </span>
              <span className="text-sm font-semibold text-emerald-600">{formatAmount(todayIncome)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                Expense
              </span>
              <span className="text-sm font-semibold text-rose-600">{formatAmount(todayExpense)}</span>
            </div>
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Net</span>
              <span className={`text-sm font-bold ${todayIncome - todayExpense >= 0 ? 'text-gray-800' : 'text-rose-600'}`}>
                {formatAmount(todayIncome - todayExpense)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Transactions</h3>
        {loadingPanel ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No transactions this month</p>
        ) : (
          <ul className="space-y-3">
            {recent.map(t => (
              <li key={t.id || t._id} className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                  t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {t.type === 'income' ? '↑' : '↓'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{t.description}</p>
                  <p className="text-xs text-gray-400">{toTitleCase(t.category)}</p>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${
                  t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {formatAmount(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AddPage() {
  const router = useRouter();
  const [categories, setCategories]   = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: '',
    category: '',
    time: new Date(),
    currency: 'IDR',
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Load all categories once on mount
  useEffect(() => {
    getCategories()
      .then(res => setCategories(res.data?.categories || []))
      .catch(() => {});
  }, []);

  // Refresh suggestions when type changes
  useEffect(() => {
    if (!form.type) return;
    getCategorySuggestions(form.type)
      .then(res => setSuggestions(res.data?.suggestions || []))
      .catch(() => {});
  }, [form.type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const d = form.time;
      const pad = (n) => String(n).padStart(2, '0');
      const timeValue = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
      const payload = {
        description: form.description,
        category:    form.category.trim().toLowerCase(),
        amount:      Number(form.amount.replace(/[^0-9]/g, '')),
        type:        form.type,
        time:        timeValue,
        transaction_timezone: tz,
        currency:    form.currency,
      };
      await addTransaction(payload);
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (err) {
      setError(err.message || 'Failed to add transaction');
    } finally {
      setLoading(false);
    }
  };

  const formatAmountDisplay = (val) => {
    const digits = val.replace(/[^0-9]/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('id-ID');
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <BottomNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-6">Add Transaction</h1>

          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* ── Left: form ── */}
            <div className="flex-1 min-w-0">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                {success && (
                  <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
                    <span>✓</span> Transaction added! Redirecting…
                  </div>
                )}
                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">

                  {/* Type toggle — pill style, prominent */}
                  <Field label="Type">
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 rounded-xl">
                      {['income', 'expense'].map((t) => (
                        <button
                          type="button"
                          key={t}
                          onClick={() => setForm({ ...form, type: t, category: '' })}
                          className={`py-3 rounded-lg text-sm font-bold transition-all ${
                            form.type === t
                              ? t === 'income'
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'bg-rose-500 text-white shadow-sm'
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          {t === 'income' ? '↑ Income' : '↓ Expense'}
                        </button>
                      ))}
                    </div>
                    <input type="hidden" name="type" value={form.type} required />
                  </Field>

                  {/* Amount — large, prominent */}
                  <Field label="Amount (IDR)">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">Rp</span>
                      <input
                        type="text"
                        required
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: formatAmountDisplay(e.target.value) })}
                        placeholder="0"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-300 text-2xl font-bold text-gray-900 placeholder:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition bg-white"
                      />
                    </div>
                  </Field>

                  <Field label="Description">
                    <input
                      type="text"
                      required
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="e.g. Grocery shopping"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Category">
                    <CategoryCombobox
                      value={form.category}
                      onChange={(val) => setForm(f => ({ ...f, category: val }))}
                      categories={[...new Set([form.category, ...categories, ...suggestions].filter(Boolean))]}
                    />
                    {suggestions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-1.5">✨ Suggested</p>
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions.map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setForm(f => ({ ...f, category: s }))}
                              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                form.category === s
                                  ? 'bg-teal-600 text-white border-teal-600'
                                  : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                              }`}
                            >
                              {toTitleCase(s)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </Field>

                  <Field label="Date & Time">
                    <DateTimePicker
                      value={form.time}
                      onChange={(date) => setForm(f => ({ ...f, time: date }))}
                      timezone={tz}
                    />
                  </Field>

                  {/* Submit — dominant */}
                  <button
                    type="submit"
                    disabled={loading || success || !form.type || !form.category.trim()}
                    className="w-full py-3.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal-200"
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Transaction
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* ── Right: side panel ── */}
            <div className="w-full lg:w-72 shrink-0">
              <SidePanel />
            </div>

          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition bg-white';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
