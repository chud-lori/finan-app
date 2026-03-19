'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import DateTimePicker from '@/components/DateTimePicker';
import { addTransaction, getCategories, getCategorySuggestions, getTransactions } from '@/lib/api';
import { toTitleCase, formatIDR, formatDate } from '@/lib/format';

// ─── Category picker ─────────────────────────────────────────────────────────
function CategoryCombobox({ value, onChange, categories, suggestions = [], disabled }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!value) setQuery('');
  }, [value]);

  const filtered   = categories.filter(c => c.toLowerCase().includes(query.toLowerCase()));
  const trimmed    = query.trim().toLowerCase();
  const exactMatch = categories.some(c => c.toLowerCase() === trimmed);
  const showCreate = trimmed && !exactMatch;

  const visibleSuggestions = !query && suggestions.length > 0
    ? suggestions.filter(s => s !== value)
    : [];

  const select = (cat) => {
    onChange(cat.toLowerCase());
    setQuery('');
  };

  return (
    <div>
      {!disabled && visibleSuggestions.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-400 mb-1.5">✨ Suggested for now</p>
          <div className="flex flex-wrap gap-1.5">
            {visibleSuggestions.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => select(s)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
              >
                {toTitleCase(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        type="text"
        disabled={disabled}
        placeholder={disabled ? 'Select a type first' : 'Filter categories…'}
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed mb-2`}
      />

      {!disabled && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {value && (
            <div className="px-3.5 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
              <span className="text-xs text-indigo-500 font-medium">Selected</span>
              <span className="text-sm font-semibold text-indigo-700">{toTitleCase(value)}</span>
            </div>
          )}

          <ul className="max-h-44 overflow-y-auto py-1">
            {filtered.map(c => (
              <li
                key={c}
                onClick={() => select(c)}
                className={`px-3.5 py-2 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                  value === c.toLowerCase()
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  {suggestions.includes(c) && !query && (
                    <span className="text-xs text-indigo-300" title="Suggested">✨</span>
                  )}
                  {toTitleCase(c)}
                </span>
                {value === c.toLowerCase() && <span className="text-indigo-400 text-xs">✓</span>}
              </li>
            ))}

            {filtered.length === 0 && !showCreate && (
              <li className="px-3.5 py-3 text-sm text-gray-400 text-center">No categories yet</li>
            )}

            {showCreate && (
              <li
                onClick={() => select(trimmed)}
                className="px-3.5 py-2 text-sm cursor-pointer text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 border-t border-gray-100"
              >
                <span className="text-indigo-400 font-bold">+</span>
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
              <span className="text-sm font-semibold text-emerald-600">{formatIDR(todayIncome)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                Expense
              </span>
              <span className="text-sm font-semibold text-rose-600">{formatIDR(todayExpense)}</span>
            </div>
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Net</span>
              <span className={`text-sm font-bold ${todayIncome - todayExpense >= 0 ? 'text-gray-800' : 'text-rose-600'}`}>
                {formatIDR(todayIncome - todayExpense)}
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
                  {formatIDR(t.amount)}
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

  useEffect(() => {
    if (!form.type) return;
    // Reset when type changes
    setCategories([]);
    setSuggestions([]);
    getCategories()
      .then(res => setCategories(res.data?.categories || []))
      .catch(() => {});
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
      setTimeout(() => router.push('/'), 1200);
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
                        className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-300 text-2xl font-bold text-gray-900 placeholder:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-white"
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

                  {form.type && (
                    <Field label="Category">
                      <CategoryCombobox
                        value={form.category}
                        onChange={(val) => setForm(f => ({ ...f, category: val }))}
                        categories={[...new Set([...categories, ...suggestions])]}
                        suggestions={suggestions}
                        disabled={false}
                      />
                    </Field>
                  )}

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
                    className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
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

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-white';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
