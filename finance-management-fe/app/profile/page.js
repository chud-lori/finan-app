'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import {
  getProfile,
  updateIdentity,
  updatePreferences,
  exportTransactions,
  importCsv,
  getGamificationSummary,
  getNetWorth,
  listAllCategories,
  renameCategoryApi,
  deleteCategoryApi,
  repairCategoryTypes,
} from '@/lib/api';
import { toTitleCase, timeAgo } from '@/lib/format';
import { describeLastBackup, getLastExportAt, markExportedNow } from '@/lib/backupReminder';
import { useFormatAmount, useCurrency } from '@/components/CurrencyContext';
import { Card, Toggle } from '@/components/SectionCard';
import MobileLogoutButton from '@/components/MobileLogoutButton';
import MonthCalendarPicker from '@/components/MonthCalendarPicker';

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEZONES = [
  'UTC',
  'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura',
  'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai',
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland',
];

const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD', 'MYR', 'JPY', 'GBP', 'AUD', 'KRW', 'CNY'];

const CSV_COLUMNS = [
  { col: 'Title / Description', required: true,  note: 'Transaction description' },
  { col: 'Amount',              required: true,  note: 'Number or "Rp1,000,000" format' },
  { col: 'Type',                required: true,  note: '"income" or "expense"' },
  { col: 'Category',            required: true,  note: 'Auto-created if not found' },
  { col: 'Timestamp',           required: true,  note: 'M/D/YYYY H:mm:ss or YYYY-MM-DD or ISO 8601' },
  { col: 'Timezone',            required: false, note: 'IANA zone e.g. Asia/Tokyo. Defaults to browser.' },
];

const IMPORT_STEPS = ['Reading file', 'Uploading', 'Processing rows', 'Saving'];

function memberSince(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ─── Spending style badge color ───────────────────────────────────────────────
function styleColor(label = '') {
  if (label.includes('Dependent'))  return 'bg-rose-100 text-rose-700';
  if (label.includes('Frequent'))   return 'bg-amber-100 text-amber-700';
  if (label.includes('Minimalist')) return 'bg-emerald-100 text-emerald-700';
  if (label.includes('New Saver'))  return 'bg-sky-100 text-sky-700';
  return 'bg-teal-100 text-teal-700';
}

// ─── Upload progress overlay ──────────────────────────────────────────────────
function UploadProgress({ filename }) {
  const [step, setStep]     = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers = [400, 900, 1800, 2600].map((t, i) => setTimeout(() => setStep(i), t));
    let p = 0;
    const tick = setInterval(() => {
      p += Math.random() * 4 + 1;
      if (p >= 90) { p = 90; clearInterval(tick); }
      setProgress(Math.round(p));
    }, 120);
    return () => { timers.forEach(clearTimeout); clearInterval(tick); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4">
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="4" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="#0d9488" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-teal-600">{progress}%</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{IMPORT_STEPS[step]}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{filename}</p>
        </div>
        <div className="flex gap-1.5">
          {IMPORT_STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${
              i < step ? 'bg-teal-600 w-5' : i === step ? 'bg-teal-400 w-4 animate-pulse' : 'bg-gray-200 w-3'
            }`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Import success modal ─────────────────────────────────────────────────────
function ImportSuccessModal({ result, onClose }) {
  const router  = useRouter();
  // Support both multi-file { files, totalSuccess, totalFailed } and legacy single { success, failed, total }
  const isMulti  = Array.isArray(result.files);
  const totalSuccess = isMulti ? result.totalSuccess : result.success;
  const totalFailed  = isMulti ? result.totalFailed  : result.failed;
  const totalRows    = isMulti ? result.files.reduce((s, f) => s + f.total, 0) : result.total;
  const allOk        = totalFailed === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className={`px-5 py-4 ${allOk ? 'bg-emerald-50' : 'bg-amber-50'}`}>
          <div className="text-2xl mb-1">{allOk ? '✅' : '⚠️'}</div>
          <h2 className="text-base font-bold text-gray-900">
            {allOk ? 'Import complete!' : 'Finished with some errors'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{totalSuccess} of {totalRows} rows imported</p>
        </div>
        <div className="px-5 py-3 grid grid-cols-3 gap-2">
          {[
            { label: 'Total',    val: totalRows,    cls: 'bg-gray-50 border-gray-200 text-gray-900' },
            { label: 'Imported', val: totalSuccess, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
            { label: 'Failed',   val: totalFailed,  cls: totalFailed > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-gray-50 border-gray-200 text-gray-400' },
          ].map(({ label, val, cls }) => (
            <div key={label} className={`rounded-xl border p-2.5 text-center ${cls}`}>
              <p className="text-lg font-bold">{val}</p>
              <p className="text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        {/* Per-file breakdown for multi-file imports */}
        {isMulti && result.files.length > 1 && (
          <div className="px-5 pb-2 space-y-1.5">
            {result.files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs rounded-lg bg-gray-50 px-3 py-1.5">
                <span className="text-gray-600 truncate max-w-[160px]">{f.filename}</span>
                <span className={f.failed > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                  {f.success}/{f.total}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Error details */}
        {(isMulti ? result.files.flatMap(f => f.errors) : result.errors)?.length > 0 && (
          <div className="px-5 pb-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 max-h-28 overflow-y-auto">
              <p className="text-xs font-semibold text-amber-800 mb-1">Skipped rows</p>
              <ul className="space-y-0.5">
                {(isMulti ? result.files.flatMap(f => f.errors) : result.errors).map((e, i) => (
                  <li key={i} className="text-xs text-amber-700 flex gap-1.5">
                    <span className="text-amber-400 shrink-0">•</span>{e}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="px-5 pb-4 flex gap-2">
          <button onClick={() => router.push('/dashboard')}
            className="flex-1 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700">
            Dashboard
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Import more
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manage categories ────────────────────────────────────────────────────────
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const GROUP_BADGE = {
  essential:     'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400',
  discretionary: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
  savings:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
  social:        'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
  income:        'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  other:         'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',
};

function ManageCategoriesModal({ onClose }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyId, setBusyId]         = useState(null);
  const [errorMsg, setErrorMsg]     = useState(null);
  const renameInputRef = useRef(null);
  const searchRef      = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const username = (() => { try { return localStorage.getItem('username') || 'u'; } catch { return 'u'; } })();
      const repairKey = `cat_type_repaired_${username}`;
      if (!localStorage.getItem(repairKey)) {
        await repairCategoryTypes().catch(() => {});
        try { localStorage.setItem(repairKey, '1'); } catch {}
      }
      const res = await listAllCategories();
      setCategories(res.data.categories);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // focus search after load
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  // close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) renameInputRef.current.focus();
  }, [renamingId]);

  const startRename = (cat) => {
    setConfirmDelete(null);
    setErrorMsg(null);
    setRenamingId(cat._id);
    setRenameValue(cat.name);
  };

  const commitRename = async (cat) => {
    const newName = renameValue.trim();
    if (!newName || newName === cat.name) { setRenamingId(null); return; }
    setBusyId(cat._id);
    setErrorMsg(null);
    try {
      await renameCategoryApi(cat._id, newName);
      setRenamingId(null);
      await load();
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (cat) => {
    setBusyId(cat._id);
    setErrorMsg(null);
    try {
      await deleteCategoryApi(cat._id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setErrorMsg(e.message);
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  const byType = (t) => categories.filter(c => c.type === t);
  const counts = { all: categories.length, expense: byType('expense').length, income: byType('income').length };

  const filtered = categories
    .filter(c => filter === 'all' || c.type === filter)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg flex flex-col"
        style={{ maxHeight: 'min(90vh, 640px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">Manage Categories</h3>
            <p className="text-xs text-gray-400 mt-0.5">Rename or delete your categories</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search + filter */}
        <div className="px-5 py-3 space-y-2 border-b border-gray-100 shrink-0">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search categories…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {['all', 'expense', 'income'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                  filter === f
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cap(f)} <span className={`${filter === f ? 'text-teal-200' : 'text-gray-400'}`}>({counts[f]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-5">
          {errorMsg && (
            <p className="text-xs text-rose-600 py-2">{errorMsg}</p>
          )}
          {loading ? (
            <div className="space-y-2 py-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              {search ? `No categories matching "${search}"` : 'No categories yet.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(cat => {
                const catId = String(cat._id);
                const isBusy             = busyId === catId;
                const isRenaming         = renamingId === catId;
                const isConfirmingDelete = confirmDelete === catId;

                return (
                  <div key={catId} className="flex items-center gap-2 py-2.5 min-w-0">
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  commitRename(cat);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        maxLength={100}
                        className="flex-1 min-w-0 text-xs border border-teal-400 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    ) : (
                      <span className="flex-1 min-w-0 text-xs font-medium text-gray-800 capitalize truncate">{cat.name}</span>
                    )}

                    {!isRenaming && !isConfirmingDelete && (
                      <>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${cat.type === 'income' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                          {cat.type}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${GROUP_BADGE[cat.group] ?? GROUP_BADGE.other}`}>
                          {cat.group ?? 'other'}
                        </span>
                      </>
                    )}

                    {isBusy ? (
                      <span className="w-3.5 h-3.5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : isRenaming ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => commitRename(cat)} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 transition-colors">Save</button>
                        <button onClick={() => setRenamingId(null)} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">Cancel</button>
                      </div>
                    ) : isConfirmingDelete ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-gray-500">Delete?</span>
                        <button onClick={() => handleDelete(cat)} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 transition-colors">Yes</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">No</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startRename(cat)} title="Rename" className="p-1 rounded-md text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => { setRenamingId(null); setErrorMsg(null); setConfirmDelete(catId); }} title="Delete" className="p-1 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[10px] text-gray-400">
            Categories with transactions cannot be deleted. Renaming updates all existing transactions.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Financial Health strip ───────────────────────────────────────────────────
// Compact read-only echo of the full HealthScoreCard on /insights — same score,
// same bands, no pillar breakdown. Insights stays the place to dig in.
const HEALTH_BANDS = {
  excellent:       { label: 'Excellent',    ring: '#059669', chip: 'bg-emerald-100 text-emerald-700' },
  healthy:         { label: 'Healthy',      ring: '#0d9488', chip: 'bg-teal-100 text-teal-700'       },
  building:        { label: 'Building',     ring: '#d97706', chip: 'bg-amber-100 text-amber-700'     },
  needs_attention: { label: 'Getting started', ring: '#e11d48', chip: 'bg-rose-100 text-rose-700'    },
};

function HealthStrip({ health }) {
  const band   = HEALTH_BANDS[health.band] || HEALTH_BANDS.building;
  const R      = 24;
  const C      = 2 * Math.PI * R;
  const offset = C * (1 - Math.min(100, Math.max(0, health.score)) / 100);

  return (
    <Link
      href="/insights#health"
      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 hover:border-teal-200 hover:bg-teal-50/40 transition-colors"
    >
      <div className="relative shrink-0" style={{ width: 58, height: 58 }}>
        <svg width="58" height="58" viewBox="0 0 58 58">
          <circle cx="29" cy="29" r={R} fill="none" strokeWidth="6" className="stroke-gray-200" />
          <circle cx="29" cy="29" r={R} fill="none" strokeWidth="6" stroke={band.ring} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 29 29)"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-black text-gray-900 tabular-nums">{health.score}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-gray-900">Financial Health</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${band.chip}`}>{band.label}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">Savings, buffer, budget &amp; goals — see the breakdown →</p>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const formatAmount = useFormatAmount();
  const { refreshCurrency } = useCurrency();

  const [profile,        setProfile]        = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError,   setProfileError]   = useState('');

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityFields,  setIdentityFields]  = useState({ name: '', username: '' });
  const [identitySaving,  setIdentitySaving]  = useState(false);
  const [identityError,   setIdentityError]   = useState('');

  const [prefs,       setPrefs]       = useState({ currency: 'IDR', timezone: 'Asia/Jakarta', weekStartsOn: 'monday', numberFormat: 'dot', monthlyBudget: 0 });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved,  setPrefsSaved]  = useState(false);
  const [prefsError,  setPrefsError]  = useState('');

  const [exportPeriod,     setExportPeriod]     = useState('all');
  const [exportMonth,      setExportMonth]      = useState('');
  const [exportYear,       setExportYear]       = useState(String(new Date().getFullYear()));
  const [exportRangeStart, setExportRangeStart] = useState('');
  const [exportRangeEnd,   setExportRangeEnd]   = useState('');
  const [exportLoading,    setExportLoading]    = useState(false);
  const [exportError,      setExportError]      = useState('');

  const [importFiles,   setImportFiles]   = useState([]);
  const [importDrag,    setImportDrag]    = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult,  setImportResult]  = useState(null);
  const [importError,   setImportError]   = useState('');
  const [showCsvGuide,  setShowCsvGuide]  = useState(false);
  const [csvPreview,    setCsvPreview]    = useState(null); // { headers, rows }
  const importInputRef = useRef(null);

  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Financial-identity extras. Each is optional garnish on the card — a failed
  // call just drops its tile rather than failing the whole page.
  const [health,   setHealth]   = useState(null);
  const [streak,   setStreak]   = useState(null);
  const [netWorth, setNetWorth] = useState(null);

  // Last-backup nudge (localStorage — the backend keeps no export audit trail)
  const [lastExportAt, setLastExportAt] = useState(undefined); // undefined = not yet read

  // ── Load profile + the identity extras, in parallel ───────────────────────
  useEffect(() => {
    setLastExportAt(getLastExportAt());

    getProfile()
      .then(res => {
        setProfile(res.data);
        if (res.data.preferences) setPrefs(res.data.preferences);
        if (res.data.user) setIdentityFields({ name: res.data.user.name || '', username: res.data.user.username || '' });
      })
      .catch(e => setProfileError(e.message || 'Failed to load profile'))
      .finally(() => setLoadingProfile(false));

    getGamificationSummary()
      .then(res => {
        setHealth(res.data?.health || null);
        setStreak(res.data?.streak || null);
      })
      .catch(() => {});

    getNetWorth()
      .then(res => setNetWorth(res.data || null))
      .catch(() => {});
  }, []);

  // ── Save preferences ──────────────────────────────────────────────────────
  const savePrefs = async () => {
    setPrefsSaving(true); setPrefsError(''); setPrefsSaved(false);
    try {
      await updatePreferences(prefs);
      refreshCurrency();
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    } catch (e) {
      setPrefsError(e.message || 'Failed to save');
    } finally {
      setPrefsSaving(false);
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExportLoading(true); setExportError('');
    try {
      const params = { period: exportPeriod };
      if (exportPeriod === 'monthly' && exportMonth) params.month = exportMonth;
      if (exportPeriod === 'yearly')                  params.year  = exportYear;
      if (exportPeriod === 'range') { params.start = exportRangeStart; params.end = exportRangeEnd; }
      const res = await exportTransactions(params);
      if (!res.ok) { setExportError(`Export failed (${res.status})`); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      const rangeFrom = exportRangeStart < exportRangeEnd ? exportRangeStart : exportRangeEnd;
      const rangeTo   = exportRangeStart < exportRangeEnd ? exportRangeEnd   : exportRangeStart;
      a.download = exportPeriod === 'monthly' ? `transactions-${exportMonth}.csv`
                 : exportPeriod === 'yearly'  ? `transactions-${exportYear}.csv`
                 : exportPeriod === 'range'   ? `transactions-${rangeFrom}-to-${rangeTo}.csv`
                 : 'transactions-all.csv';
      a.click();
      URL.revokeObjectURL(url);
      // Only a download that actually fired counts as a backup.
      setLastExportAt(markExportedNow());
    } catch (e) {
      setExportError(e.message || 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  // ── Parse CSV preview (client-side, first 3 data rows) ────────────────────
  const parseCsvPreview = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4);
    if (lines.length === 0) return null;
    const parseRow = (line) => {
      const cols = []; let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQ = !inQ; }
        else if (line[i] === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else { cur += line[i]; }
      }
      cols.push(cur.trim());
      return cols;
    };
    const [headerLine, ...dataLines] = lines;
    return { headers: parseRow(headerLine), rows: dataLines.map(parseRow) };
  };

  // ── Import CSV ────────────────────────────────────────────────────────────
  const handleImportFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const valid = Array.from(fileList).filter(f => f.name.endsWith('.csv') || f.type === 'text/csv');
    const invalid = fileList.length - valid.length;
    if (invalid > 0) setImportError(`${invalid} file(s) skipped — only .csv allowed`);
    else setImportError('');
    if (valid.length === 0) return;
    setImportFiles(valid); setImportResult(null);
    // Preview first file only
    const reader = new FileReader();
    reader.onload = (e) => setCsvPreview(parseCsvPreview(e.target.result));
    reader.readAsText(valid[0]);
  };

  const clearImportFiles = () => {
    setImportFiles([]);
    setCsvPreview(null);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFiles.length) { setImportError('Please select at least one CSV file'); return; }
    setImportLoading(true); setImportError('');
    try {
      const res = await importCsv(importFiles);
      clearImportFiles();
      setImportResult(res.data);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  // ── Save name / username ──────────────────────────────────────────────────
  const handleSaveIdentity = async () => {
    setIdentityError('');
    setIdentitySaving(true);
    try {
      const res = await updateIdentity(identityFields);
      setProfile(prev => ({ ...prev, user: { ...prev.user, ...res.data } }));
      setEditingIdentity(false);
    } catch (e) {
      setIdentityError(e.message || 'Failed to update profile');
    } finally {
      setIdentitySaving(false);
    }
  };

  // ─── Data shortcuts ───────────────────────────────────────────────────────
  const user     = profile?.user     || {};
  const identity = profile?.identity || {};
  const initial  = (user.username || user.name || 'U')[0].toUpperCase();
  const exportDisabled = exportLoading
    || (exportPeriod === 'monthly' && !exportMonth)
    || (exportPeriod === 'yearly'  && !exportYear)
    || (exportPeriod === 'range'   && (!exportRangeStart || !exportRangeEnd));

  // Backup nudge — hold the line back until localStorage has been read so the
  // "never exported" copy can't flash at a user who exports every week.
  const backup = lastExportAt === undefined ? null : describeLastBackup(lastExportAt);

  // Net worth is only meaningful once the user has actually saved holdings.
  // A `seeded` payload is the backend's draft suggestion, not a real figure.
  const hasNetWorth = !!netWorth && !netWorth.seeded
    && (netWorth.assets?.length > 0 || netWorth.liabilities?.length > 0);

  // The card has something to say if any one source came back with data.
  const hasIdentityData = identity.monthsTracked > 0 || health?.score != null || hasNetWorth;

  const identityTiles = [
    { label: 'Avg Monthly Income',  value: formatAmount(identity.avgMonthlyIncome  || 0), accent: 'emerald', show: identity.monthsTracked > 0 },
    { label: 'Avg Monthly Expense', value: formatAmount(identity.avgMonthlyExpense || 0), accent: 'rose',    show: identity.monthsTracked > 0 },
    { label: 'Avg Savings Rate',    value: `${identity.avgSavingsRate ?? 0}%`,            show: identity.monthsTracked > 0,
      accent: identity.avgSavingsRate > 20 ? 'emerald' : identity.avgSavingsRate > 0 ? 'teal' : 'rose' },
    { label: 'Net Worth',           value: formatAmount(netWorth?.netWorth || 0),         show: hasNetWorth,
      accent: (netWorth?.netWorth || 0) >= 0 ? 'teal' : 'rose' },
    { label: 'Months Tracked',      value: `${identity.monthsTracked || 0} mo`, accent: 'gray',  show: identity.monthsTracked > 0 },
    { label: 'Logging Streak',      value: `🔥 ${streak?.current ?? 0} day${streak?.current === 1 ? '' : 's'}`, accent: 'amber', show: streak?.current > 0 },
  ].filter(t => t.show);

  return (
    <AuthGuard>
      {importLoading && <UploadProgress filename={importFiles.length === 1 ? importFiles[0].name : `${importFiles.length} files`} />}
      {importResult  && <ImportSuccessModal result={importResult} onClose={() => setImportResult(null)} />}
      {showCategoryModal && (
        <ManageCategoriesModal onClose={() => setShowCategoryModal(false)} />
      )}

      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6">

          {/* ── Header ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-black text-xl shrink-0">
                {initial}
              </div>

              {editingIdentity ? (
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Name</label>
                    <input
                      autoFocus
                      value={identityFields.name}
                      onChange={e => setIdentityFields(f => ({ ...f, name: e.target.value }))}
                      className="w-full text-base sm:text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Username</label>
                    <input
                      value={identityFields.username}
                      onChange={e => setIdentityFields(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                      className="w-full text-base sm:text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                      placeholder="username (letters, numbers, _)"
                    />
                    <p className="text-xs text-gray-400 mt-0.5">3–30 chars, letters / numbers / underscores</p>
                  </div>
                  {identityError && <p className="text-xs text-red-600">{identityError}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={handleSaveIdentity} disabled={identitySaving}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50">
                      {identitySaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingIdentity(false); setIdentityError(''); setIdentityFields({ name: user.name || '', username: user.username || '' }); }}
                      className="px-3 py-1.5 rounded-lg text-gray-500 text-xs hover:bg-gray-100">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-gray-900 truncate">{toTitleCase(user.name || user.username || 'My Profile')}</p>
                    <button onClick={() => { setIdentityFields({ name: user.name || '', username: user.username || '' }); setEditingIdentity(true); }}
                      className="p-1 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors shrink-0"
                      title="Edit name & username">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                  {user.username && <p className="text-xs text-gray-400">@{user.username}</p>}
                  {user.email && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      {/* `verified` is absent on older API responses — no badge
                          beats a wrong badge, so only an explicit true shows it. */}
                      {user.verified === true && (
                        <span
                          title="Email verified"
                          className="inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
                        >
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" clipRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                          </svg>
                          Verified
                        </span>
                      )}
                    </div>
                  )}
                  {identity.spendingStyle && (
                    <span className={`inline-block mt-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${styleColor(identity.spendingStyle)}`}>
                      {identity.spendingStyle}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Account meta row */}
            {!editingIdentity && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t border-gray-100">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                  {profile?.account?.memberSince && (
                    <span className="text-xs text-gray-400">Member since {memberSince(profile.account.memberSince)}</span>
                  )}
                  {profile?.account?.lastLoginAt && (
                    <span className="text-xs text-gray-400">· Last login {timeAgo(profile.account.lastLoginAt)}</span>
                  )}
                  {profile?.account?.hasPassword === false && (
                    <span className="text-xs bg-sky-50 text-sky-600 font-medium px-2 py-0.5 rounded-full border border-sky-200">Google account</span>
                  )}
                </div>
                {/* Only route to password / sessions / delete-account. Mobile has
                    no Navbar user menu, so this is the sole way in from a phone. */}
                <Link
                  href="/settings"
                  className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Security &amp; account →
                </Link>
              </div>
            )}
          </div>

          {profileError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm mb-4">{profileError}</div>
          )}

          {/* ── 2-column grid on desktop ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-4">

              {/* Financial Identity */}
              <Card title="Financial Identity" subtitle="Your money at a glance — averages across months with activity">
                {loadingProfile ? (
                  <div className="space-y-3">
                    <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                    </div>
                  </div>
                ) : !hasIdentityData ? (
                  <p className="text-sm text-gray-400 text-center py-4">Add some transactions to see your financial identity.</p>
                ) : (
                  <div className="space-y-3">
                    {health?.score != null && <HealthStrip health={health} />}

                    {identityTiles.length > 0 && (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                        {identityTiles.map(({ label, value, accent }) => {
                          const colors = {
                            emerald: 'bg-emerald-50 text-emerald-700',
                            rose:    'bg-rose-50 text-rose-700',
                            teal:    'bg-teal-50 text-teal-700',
                            amber:   'bg-amber-50 text-amber-700',
                            gray:    'bg-gray-50 text-gray-700',
                          };
                          return (
                            <div key={label} className={`rounded-xl p-3 ${colors[accent]}`}>
                              <p className="text-xs font-medium opacity-70 leading-tight mb-1">{label}</p>
                              <p className="text-sm sm:text-base font-black tabular-nums">{value}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {identity.topCategory && (
                      <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-400">Top category</p>
                          <p className="text-sm font-bold text-gray-900 capitalize mt-0.5 truncate">{toTitleCase(identity.topCategory)}</p>
                        </div>
                        <span className="text-xl font-black text-teal-600 tabular-nums shrink-0">{identity.topCategoryPct}%</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Preferences */}
              <Card title="Preferences" subtitle="Currency, timezone & formatting">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                    <select value={prefs.currency} onChange={e => setPrefs(p => ({ ...p, currency: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Timezone</label>
                    <select value={prefs.timezone} onChange={e => setPrefs(p => ({ ...p, timezone: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Week starts on</label>
                      <Toggle
                        options={[{ val: 'monday', label: 'Mon' }, { val: 'sunday', label: 'Sun' }]}
                        value={prefs.weekStartsOn}
                        onChange={v => setPrefs(p => ({ ...p, weekStartsOn: v }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Number format</label>
                      <Toggle
                        options={[{ val: 'dot', label: '1.000' }, { val: 'comma', label: '1,000' }]}
                        value={prefs.numberFormat}
                        onChange={v => setPrefs(p => ({ ...p, numberFormat: v }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Monthly budget ({prefs.currency})
                      <span className="ml-1 text-gray-400 font-normal">— auto-fills Planner tools</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefs.currency}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={prefs.monthlyBudget > 0
                          ? new Intl.NumberFormat(prefs.numberFormat === 'comma' ? 'en-US' : 'id-ID', { style: 'decimal' }).format(prefs.monthlyBudget)
                          : ''}
                        onChange={e => {
                          const raw = Number(String(e.target.value).replace(/[^0-9]/g, ''));
                          setPrefs(p => ({ ...p, monthlyBudget: raw || 0 }));
                        }}
                        placeholder={new Intl.NumberFormat(prefs.numberFormat === 'comma' ? 'en-US' : 'id-ID', { style: 'decimal' }).format(5000000)}
                        className="w-full pl-12 pr-3 py-2 rounded-xl border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                      />
                    </div>
                  </div>
                  {prefsError && <p className="text-xs text-red-600">{prefsError}</p>}
                  <button onClick={savePrefs} disabled={prefsSaving}
                    className="w-full py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {prefsSaving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {prefsSaved ? '✓ Saved!' : 'Save preferences'}
                  </button>
                </div>
              </Card>

            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-4">

              {/* Export */}
              <Card title="Export Data">
                <div className="space-y-3">
                  <Toggle
                    options={[
                      { val: 'all',     label: 'All' },
                      { val: 'yearly',  label: 'Year' },
                      { val: 'monthly', label: 'Month' },
                      { val: 'range',   label: 'Range' },
                    ]}
                    value={exportPeriod}
                    onChange={setExportPeriod}
                  />
                  {exportPeriod === 'yearly' && (
                    <input type="number" min="2000" max={new Date().getFullYear()} value={exportYear}
                      onChange={e => setExportYear(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                  )}
                  {exportPeriod === 'monthly' && (
                    <MonthCalendarPicker
                      value={exportMonth}
                      onChange={setExportMonth}
                      placeholder="Pick a month…"
                    />
                  )}
                  {exportPeriod === 'range' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                        <MonthCalendarPicker
                          value={exportRangeStart}
                          onChange={setExportRangeStart}
                          placeholder="Start month…"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                        <MonthCalendarPicker
                          value={exportRangeEnd}
                          onChange={setExportRangeEnd}
                          placeholder="End month…"
                        />
                      </div>
                    </div>
                  )}
                  {exportError && <p className="text-xs text-red-600">{exportError}</p>}
                  <button onClick={handleExport} disabled={exportDisabled}
                    className="w-full py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {exportLoading
                      ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Exporting…</>
                      : 'Download CSV'
                    }
                  </button>
                  {backup && (
                    <p className={`flex items-start gap-1.5 text-xs ${backup.stale ? 'text-amber-600' : 'text-gray-400'}`}>
                      <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        {backup.text}
                        {backup.stale && <span className="font-medium"> — a fresh backup takes a second.</span>}
                      </span>
                    </p>
                  )}
                </div>
              </Card>

              {/* Import CSV */}
              <Card title="Import CSV">
                <div className="space-y-3">
                  <button onClick={() => setShowCsvGuide(v => !v)}
                    className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 transition-colors">
                    <span className="font-medium">Expected columns</span>
                    <svg className={`w-4 h-4 transition-transform ${showCsvGuide ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showCsvGuide && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-100">
                          {CSV_COLUMNS.map(({ col, required, note }) => (
                            <tr key={col}>
                              <td className="px-3 py-2">
                                <code className="bg-gray-100 text-gray-700 px-1 py-0.5 rounded">{col}</code>
                                {required
                                  ? <span className="ml-1.5 text-rose-500 font-medium">*</span>
                                  : <span className="ml-1.5 text-gray-300">opt</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-400">{note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <form onSubmit={handleImportSubmit}>
                    <div
                      onClick={() => importInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setImportDrag(true); }}
                      onDragLeave={() => setImportDrag(false)}
                      onDrop={(e) => { e.preventDefault(); setImportDrag(false); handleImportFiles(e.dataTransfer.files); }}
                      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-8 px-4 cursor-pointer transition-all ${
                        importDrag ? 'border-teal-400 bg-teal-50'
                        : importFiles.length ? 'border-emerald-400 bg-emerald-50'
                        : 'border-gray-300 hover:border-teal-300 hover:bg-gray-50'
                      }`}
                    >
                      <input ref={importInputRef} type="file" accept=".csv,text/csv" multiple className="hidden"
                        onChange={(e) => handleImportFiles(e.target.files)} />
                      <div className="text-2xl">{importFiles.length ? '✅' : '📄'}</div>
                      {importFiles.length ? (
                        <>
                          {importFiles.length === 1 ? (
                            <p className="text-sm font-medium text-emerald-700">{importFiles[0].name}</p>
                          ) : (
                            <div className="text-center">
                              <p className="text-sm font-medium text-emerald-700">{importFiles.length} files selected</p>
                              <p className="text-xs text-emerald-600 mt-0.5">{importFiles.map(f => f.name).join(', ')}</p>
                            </div>
                          )}
                          <p className="text-xs text-gray-400">tap to change</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-700">
                            Drop CSV(s) or <span className="text-teal-600 underline">browse</span>
                          </p>
                          <p className="text-xs text-gray-400">Multiple .csv files supported, max 5 MB each</p>
                        </>
                      )}
                    </div>
                    {importError && <p className="mt-2 text-xs text-red-600">{importError}</p>}

                    {/* CSV preview */}
                    {csvPreview && !importError && (
                      <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                          <p className="text-xs font-semibold text-gray-600">Preview — first {csvPreview.rows.length} row{csvPreview.rows.length !== 1 ? 's' : ''}</p>
                          <button type="button" onClick={clearImportFiles}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            Clear
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                {csvPreview.headers.map((h, i) => (
                                  <th key={i} className="px-3 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h || `Col ${i + 1}`}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {csvPreview.rows.map((row, ri) => (
                                <tr key={ri} className="hover:bg-gray-50">
                                  {csvPreview.headers.map((_, ci) => (
                                    <td key={ci} className="px-3 py-1.5 text-gray-700 max-w-[120px] truncate">{row[ci] ?? ''}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <button type="submit" disabled={!importFiles.length || importLoading}
                      className="mt-3 w-full py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      Import
                    </button>
                  </form>
                </div>
              </Card>

              {/* Manage Categories */}
              <Card title="Categories" subtitle="Rename or delete your spending and income categories">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-500">Organise your categories — rename or remove ones you don&apos;t need.</p>
                  <button
                    onClick={() => setShowCategoryModal(true)}
                    className="shrink-0 px-4 py-1.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
                  >
                    Manage
                  </button>
                </div>
              </Card>

              <MobileLogoutButton />

            </div>
          </div>

        </main>
      </div>
    </AuthGuard>
  );
}
