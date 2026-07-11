'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getPendingEmailTransactions,
  dismissPendingEmailTransaction,
  addTransaction,
  getCategories,
} from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';
import { formatDate, toTitleCase } from '@/lib/format';
import { useToast } from '@/components/ToastContext';

const SOURCE_LABEL = { bca: 'BCA', jago: 'Jago', gmail: 'Gmail' };

/**
 * Review queue for transactions detected in forwarded bank emails.
 * Confirm goes through the normal addTransaction API (the only ledger
 * writer), then dismisses the pending item. Renders nothing when the
 * queue is empty or the feature is unavailable.
 */
export default function PendingEmailTransactions({ onConfirmed }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [drafts, setDrafts] = useState({}); // id → category input
  const [busyId, setBusyId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const formatAmount = useFormatAmount();
  const toast = useToast();

  useEffect(() => {
    getPendingEmailTransactions()
      .then(res => setItems(res.data?.pending || []))
      .catch(() => {});
    getCategories()
      .then(res => setCategories(res.data?.categories || []))
      .catch(() => {});
  }, []);

  const removeItem = (id) =>
    setItems(prev => prev.filter(i => i.id !== id));

  const handleDismiss = async (item) => {
    setBusyId(item.id);
    try {
      await dismissPendingEmailTransaction(item.id);
      removeItem(item.id);
    } catch (err) {
      toast(err.message || 'Failed to dismiss', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirm = async (item) => {
    const category = (drafts[item.id] || '').trim();
    if (!category) {
      toast('Pick a category first', 'warning');
      return;
    }
    setBusyId(item.id);
    try {
      const d = new Date(item.time);
      const pad = (n) => String(n).padStart(2, '0');
      await addTransaction({
        description: item.description,
        category:    category.toLowerCase(),
        amount:      item.amount,
        type:        item.type,
        time:        `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`,
        transaction_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        currency:    (item.currency || 'IDR').toUpperCase(),
      });
      // Pending doc is review state only — best-effort cleanup after the
      // transaction is safely created
      await dismissPendingEmailTransaction(item.id).catch(() => {});
      removeItem(item.id);
      toast('Transaction added from email');
      onConfirmed?.();
    } catch (err) {
      toast(err.message || 'Failed to confirm transaction', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!items.length) return null;

  return (
    <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center text-base">📩</span>
          <span className="text-sm font-semibold text-gray-900">From your bank emails</span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-teal-100 text-teal-700">
            {items.length} to review
          </span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {items.map(item => (
            <li key={item.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 shrink-0">
                  {SOURCE_LABEL[item.source] || item.source}
                </span>

                {item.parsed ? (
                  <>
                    <div className="flex-1 min-w-[10rem]">
                      <p className="text-sm font-medium text-gray-900 truncate">{toTitleCase(item.description)}</p>
                      <p className="text-xs text-gray-500">{formatDate(item.time)}</p>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${item.type === 'income' ? 'text-teal-600' : 'text-gray-900'}`}>
                      {item.type === 'income' ? '+' : '−'}{formatAmount(item.amount)}
                    </span>
                    <input
                      list="pending-email-categories"
                      value={drafts[item.id] || ''}
                      onChange={e => setDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="Category"
                      className="w-32 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      onClick={() => handleConfirm(item)}
                      disabled={busyId === item.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                      Confirm
                    </button>
                  </>
                ) : item.source === 'gmail' ? (
                  <>
                    <div className="flex-1 min-w-[10rem]">
                      <p className="text-sm font-medium text-gray-900 truncate">Confirm Gmail auto-forwarding</p>
                      <p className="text-xs text-gray-500 truncate">Click confirm, then dismiss this item</p>
                    </div>
                    <a href={item.snippet} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                      Confirm forwarding
                    </a>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-[10rem]">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.subject || 'Bank email'}</p>
                      <p className="text-xs text-gray-500 truncate">Couldn't read the details — add it manually</p>
                    </div>
                    <Link href="/add"
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-600 text-teal-600 hover:bg-teal-50 transition-colors">
                      Add manually
                    </Link>
                  </>
                )}

                <button
                  onClick={() => handleDismiss(item)}
                  disabled={busyId === item.id}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <datalist id="pending-email-categories">
        {categories.map(c => (
          <option key={c.name || c} value={toTitleCase(c.name || c)} />
        ))}
      </datalist>
    </div>
  );
}
