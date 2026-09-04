'use client';
import { useState } from 'react';
import { DISMISS_REASON_OPTIONS, describeDismissal, describeReason, hiddenUntil } from '@/lib/insightDismissals';

export function InsightDismissButton({ open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Cancel hiding this insight' : 'Hide this insight'}
      className="w-12 shrink-0 flex items-center justify-center group"
    >
      <span
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          open
            ? 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'
            : 'text-gray-300 group-hover:text-gray-500 group-hover:bg-gray-100 dark:text-slate-600 dark:group-hover:text-slate-300 dark:group-hover:bg-slate-800'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    </button>
  );
}

export function InsightDismissGutter() {
  return <div className="w-12 shrink-0" aria-hidden="true" />;
}

export function InsightDismissPanel({ onChoose, onCancel }) {
  const [saving, setSaving] = useState(null);
  const [failed, setFailed] = useState(null);

  const choose = async (reason) => {
    setSaving(reason);
    setFailed(null);
    try {
      await onChoose(reason);
    } catch (e) {
      setFailed(e.message || 'Could not hide this insight — try again.');
    } finally {
      setSaving(null);
    }
  };

  const busy = saving !== null;

  return (
    <div className="px-5 pb-4 -mt-1">
      <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">Why are you hiding this?</p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {DISMISS_REASON_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            disabled={busy}
            onClick={() => choose(opt.value)}
            className="min-h-11 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-left text-base sm:text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            {saving === opt.value ? 'Hiding…' : opt.label}
            <span className="block text-xs font-normal text-gray-400 dark:text-slate-500">{opt.hint}</span>
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-11 px-3 py-2 rounded-lg border border-transparent text-left text-base sm:text-sm font-medium text-gray-400 hover:text-gray-600 hover:border-gray-200 dark:hover:text-slate-300 dark:hover:border-slate-700 disabled:opacity-40 transition-colors"
        >
          Keep it
        </button>
      </div>
      {failed && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{failed}</p>}
    </div>
  );
}

export function DismissedInsightsPanel({ dismissals, onRestore }) {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [failed, setFailed] = useState(null);

  if (!dismissals?.length) return null;

  const restore = async (id) => {
    setRestoring(id);
    setFailed(null);
    try {
      await onRestore(id);
    } catch (e) {
      setFailed(e.message || 'Could not show that insight again — try again.');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="min-h-8 flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
      >
        {dismissals.length} hidden insight{dismissals.length > 1 ? 's' : ''}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {dismissals.map(d => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="text-sm text-gray-700 dark:text-slate-300 leading-snug">{describeDismissal(d)}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {describeReason(d)} · back on {hiddenUntil(d)}
                </p>
              </div>
              <button
                type="button"
                disabled={restoring === d.id}
                onClick={() => restore(d.id)}
                className="min-h-11 px-3 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                {restoring === d.id ? 'Restoring…' : 'Show again'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{failed}</p>}
    </div>
  );
}

export function NoInsightsLeft() {
  return (
    <div className="px-5 py-6 text-center">
      <p className="text-sm text-gray-500 dark:text-slate-400">You&apos;ve hidden everything we had to say this month.</p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Show one again below, or check back after a few more transactions.</p>
    </div>
  );
}
