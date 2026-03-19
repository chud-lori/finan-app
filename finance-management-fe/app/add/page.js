'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import DateTimePicker from '@/components/DateTimePicker';
import { addTransaction, getCategories } from '@/lib/api';
import { toTitleCase } from '@/lib/format';

// ─── Category picker ─────────────────────────────────────────────────────────
function CategoryCombobox({ value, onChange, categories, disabled }) {
  const [query, setQuery] = useState('');

  // Sync display when value is reset externally (type switch)
  useEffect(() => {
    if (!value) setQuery('');
  }, [value]);

  const filtered   = categories.filter(c => c.toLowerCase().includes(query.toLowerCase()));
  const trimmed    = query.trim().toLowerCase();
  const exactMatch = categories.some(c => c.toLowerCase() === trimmed);
  const showCreate = trimmed && !exactMatch;

  const select = (cat) => {
    onChange(cat.toLowerCase());
    setQuery('');
  };

  return (
    <div>
      {/* Search filter */}
      <input
        type="text"
        disabled={disabled}
        placeholder={disabled ? 'Select a type first' : 'Filter categories…'}
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed mb-2`}
      />

      {/* Always-visible list */}
      {!disabled && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Selected badge */}
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
                {toTitleCase(c)}
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

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AddPage() {
  const router = useRouter();
  const [categories, setCategories] = useState([]);
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

  // Fetch all categories whenever a type is selected
  useEffect(() => {
    if (!form.type) return;
    getCategories()
      .then(res => setCategories(res.data?.categories || []))
      .catch(() => {});
  }, [form.type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Format the Date object to "YYYY-MM-DDTHH:mm:ss" (local time, no Z)
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-80">
          <div className="max-w-lg">
            <h1 className="text-xl font-bold text-gray-900 mb-6">Add Transaction</h1>

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

              <form onSubmit={handleSubmit} className="space-y-4">
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

                <Field label="Amount (IDR)">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">Rp</span>
                    <input
                      type="text"
                      required
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: formatAmountDisplay(e.target.value) })}
                      placeholder="1,000,000"
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                </Field>

                {/* Type toggle */}
                <Field label="Type">
                  <div className="flex gap-2">
                    {['income', 'expense'].map((t) => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setForm({ ...form, type: t, category: '' })}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                          form.type === t
                            ? t === 'income'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-rose-500 bg-rose-50 text-rose-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {t === 'income' ? '↑ Income' : '↓ Expense'}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="type" value={form.type} required />
                </Field>

                {/* Category combobox — shown for both income and expense */}
                {form.type && (
                  <Field label="Category">
                    <CategoryCombobox
                      value={form.category}
                      onChange={(val) => setForm(f => ({ ...f, category: val }))}
                      categories={categories}
                      disabled={false}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Type to search or create a new category
                    </p>
                  </Field>
                )}

                <Field label="Date & Time">
                  <DateTimePicker
                    value={form.time}
                    onChange={(date) => setForm(f => ({ ...f, time: date }))}
                    timezone={tz}
                  />
                </Field>

                <button
                  type="submit"
                  disabled={loading || success || !form.type || !form.category.trim()}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : 'Add Transaction'}
                </button>
              </form>
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
