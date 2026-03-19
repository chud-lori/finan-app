'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import {
  getProfile,
  updatePreferences,
  exportTransactions,
  importCsv,
  deleteAccount,
} from '@/lib/api';
import { formatIDR, toTitleCase } from '@/lib/format';

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
  { col: 'Timestamp / Date / Time', required: true, note: 'M/D/YYYY H:mm:ss, YYYY-MM-DD HH:mm:ss, or ISO 8601' },
  { col: 'Timezone',            required: false, note: 'IANA timezone (e.g. Asia/Tokyo). Defaults to browser timezone if omitted.' },
];

const IMPORT_STEPS = ['Reading file', 'Uploading', 'Processing rows', 'Saving to database'];

// ─── Spending style badge color ───────────────────────────────────────────────
function styleColor(label = '') {
  if (label.includes('Dependent')) return 'bg-rose-100 text-rose-700';
  if (label.includes('Frequent'))  return 'bg-amber-100 text-amber-700';
  if (label.includes('Minimalist')) return 'bg-emerald-100 text-emerald-700';
  if (label.includes('New Saver'))  return 'bg-sky-100 text-sky-700';
  if (label.includes('Balanced'))   return 'bg-teal-100 text-teal-700';
  return 'bg-gray-100 text-gray-700';
}

// ─── Delete-account modal (from settings page) ────────────────────────────────
function DeleteAccountModal({ username, onCancel, onConfirmed }) {
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleDelete = async () => {
    if (input !== username) { setError('Username does not match'); return; }
    setLoading(true);
    setError('');
    try {
      await deleteAccount();
      onConfirmed();
    } catch (e) {
      setError(e.message || 'Failed to delete account');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-sm">
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.293 4.293a1 1 0 011.414 0L21 14.586A2 2 0 0119.586 17H4.414A2 2 0 013 14.586L10.293 4.293z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Delete account</h3>
          <p className="text-sm text-gray-500 mt-1">
            This will permanently delete your account and all transactions. This action cannot be undone.
          </p>
        </div>
        <p className="text-sm text-gray-700 mb-2">
          Type your username <span className="font-semibold text-gray-900">{username}</span> to confirm:
        </p>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={username}
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
        />
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={loading || input !== username}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Delete account
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Import: upload progress overlay ─────────────────────────────────────────
function UploadProgress({ filename }) {
  const [step,     setStep]     = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timings = [400, 900, 1800, 2600];
    const timers  = timings.map((t, i) => setTimeout(() => setStep(i), t));
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center gap-6">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="4" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="#0d9488" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-teal-600">{progress}%</span>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">{IMPORT_STEPS[step]}</p>
          <p className="text-xs text-gray-400 mt-1 truncate max-w-xs">{filename}</p>
        </div>
        <div className="flex gap-2">
          {IMPORT_STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${
              i < step ? 'bg-teal-600 w-6' : i === step ? 'bg-teal-400 w-4 animate-pulse' : 'bg-gray-200 w-3'
            }`} />
          ))}
        </div>
        <ul className="w-full space-y-2">
          {IMPORT_STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              {i < step ? (
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0">✓</span>
              ) : i === step ? (
                <span className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-teal-500 animate-ping" />
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-gray-100 flex-shrink-0" />
              )}
              <span className={i <= step ? 'text-gray-800 font-medium' : 'text-gray-400'}>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Import: success modal ────────────────────────────────────────────────────
function ImportSuccessModal({ result, onClose }) {
  const router = useRouter();
  const allOk  = result.failed === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className={`px-6 py-5 ${allOk ? 'bg-emerald-50' : 'bg-amber-50'}`}>
          <div className="text-3xl mb-2">{allOk ? '✅' : '⚠️'}</div>
          <h2 className="text-lg font-bold text-gray-900">
            {allOk ? 'Import complete!' : 'Import finished with some errors'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {result.success} of {result.total} rows imported successfully
          </p>
        </div>
        <div className="px-6 py-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Total rows',  val: result.total,   cls: 'bg-gray-50 border-gray-200',     txt: 'text-gray-900' },
            { label: 'Imported',    val: result.success, cls: 'bg-emerald-50 border-emerald-200', txt: 'text-emerald-700' },
            { label: 'Failed',      val: result.failed,  cls: result.failed > 0 ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-200', txt: result.failed > 0 ? 'text-rose-700' : 'text-gray-400' },
          ].map(({ label, val, cls, txt }) => (
            <div key={label} className={`rounded-xl border p-3 text-center ${cls}`}>
              <p className={`text-xl font-bold ${txt}`}>{val}</p>
              <p className={`text-xs mt-0.5 ${txt}`}>{label}</p>
            </div>
          ))}
        </div>
        {result.errors?.length > 0 && (
          <div className="px-6 pb-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 max-h-36 overflow-y-auto">
              <p className="text-xs font-semibold text-amber-800 mb-1.5">Skipped rows</p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-700 flex gap-2">
                    <span className="shrink-0 text-amber-400">•</span>{e}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={() => router.push('/')}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors">
            Go to dashboard
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Import another
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, subtitle, danger = false, children }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${danger ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className={`text-sm font-semibold uppercase tracking-wide ${danger ? 'text-red-500' : 'text-gray-500'}`}>{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = 'teal' }) {
  const colors = {
    teal:    'bg-teal-50 text-teal-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose:    'bg-rose-50 text-rose-700',
    gray:    'bg-gray-50 text-gray-700',
  };
  return (
    <div className={`rounded-xl p-4 ${colors[accent] || colors.gray}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-xl font-black">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();

  // Profile data
  const [profile,     setProfile]     = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError,   setProfileError]   = useState('');

  // Preferences form
  const [prefs,       setPrefs]       = useState({ currency: 'IDR', timezone: 'Asia/Jakarta', weekStartsOn: 'monday', numberFormat: 'dot' });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved,  setPrefsSaved]  = useState(false);
  const [prefsError,  setPrefsError]  = useState('');

  // Export
  const [exportPeriod,    setExportPeriod]    = useState('all');
  const [exportMonth,     setExportMonth]     = useState('');
  const [exportYear,      setExportYear]      = useState(String(new Date().getFullYear()));
  const [exportLoading,   setExportLoading]   = useState(false);
  const [exportError,     setExportError]     = useState('');

  // Import CSV
  const [importFile,    setImportFile]    = useState(null);
  const [importDrag,    setImportDrag]    = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult,  setImportResult]  = useState(null);
  const [importError,   setImportError]   = useState('');
  const importInputRef = useRef(null);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // ── Load profile ─────────────────────────────────────────────────────────
  useEffect(() => {
    getProfile()
      .then(res => {
        const data = res.data;
        setProfile(data);
        if (data.preferences) setPrefs(data.preferences);
      })
      .catch(e => setProfileError(e.message || 'Failed to load profile'))
      .finally(() => setLoadingProfile(false));
  }, []);

  // ── Save preferences ──────────────────────────────────────────────────────
  const savePrefs = async () => {
    setPrefsSaving(true);
    setPrefsError('');
    setPrefsSaved(false);
    try {
      await updatePreferences(prefs);
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    } catch (e) {
      setPrefsError(e.message || 'Failed to save preferences');
    } finally {
      setPrefsSaving(false);
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExportLoading(true);
    setExportError('');
    try {
      const params = { period: exportPeriod };
      if (exportPeriod === 'monthly' && exportMonth) params.month = exportMonth;
      if (exportPeriod === 'yearly')                  params.year  = exportYear;

      const res = await exportTransactions(params);
      if (!res.ok) { setExportError(`Export failed (${res.status})`); return; }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = exportPeriod === 'monthly' ? `transactions-${exportMonth}.csv`
                 : exportPeriod === 'yearly'  ? `transactions-${exportYear}.csv`
                 : 'transactions-all.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e.message || 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const exportDisabled = exportLoading
    || (exportPeriod === 'monthly' && !exportMonth)
    || (exportPeriod === 'yearly'  && !exportYear);

  // ── Import CSV ────────────────────────────────────────────────────────────
  const handleImportFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv') {
      setImportError('Only CSV files are allowed'); return;
    }
    setImportFile(f);
    setImportResult(null);
    setImportError('');
  };

  const clearImportFile = () => {
    setImportFile(null);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) { setImportError('Please select a CSV file'); return; }
    setImportLoading(true);
    setImportError('');
    try {
      const res = await importCsv(importFile);
      clearImportFile();
      setImportResult(res.data);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const handleDeleteConfirmed = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    router.replace('/login');
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const user     = profile?.user     || {};
  const identity = profile?.identity || {};
  const initial  = user.username ? user.username[0].toUpperCase() : (user.name ? user.name[0].toUpperCase() : 'U');

  return (
    <AuthGuard>
      {importLoading && <UploadProgress filename={importFile?.name ?? 'file.csv'} />}
      {importResult  && <ImportSuccessModal result={importResult} onClose={() => setImportResult(null)} />}
      {showDeleteModal && (
        <DeleteAccountModal
          username={user.username || localStorage?.getItem?.('username') || ''}
          onCancel={() => setShowDeleteModal(false)}
          onConfirmed={handleDeleteConfirmed}
        />
      )}

      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-5">

          {/* ── Header ── */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-black text-xl shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{user.name || user.username || 'My Profile'}</h1>
              {user.email && <p className="text-sm text-gray-500 truncate">{user.email}</p>}
              {identity.spendingStyle && (
                <span className={`inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${styleColor(identity.spendingStyle)}`}>
                  {identity.spendingStyle}
                </span>
              )}
            </div>
          </div>

          {profileError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">{profileError}</div>
          )}

          {/* ── Financial Identity ── */}
          <Section title="Financial Identity" subtitle="Based on the last 12 months of data">
            {loadingProfile ? (
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : identity.monthsTracked === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No transaction data yet. Add some transactions to see your financial identity.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <StatCard
                    label="Avg Monthly Income"
                    value={formatIDR(identity.avgMonthlyIncome || 0)}
                    accent="emerald"
                  />
                  <StatCard
                    label="Avg Monthly Expense"
                    value={formatIDR(identity.avgMonthlyExpense || 0)}
                    accent="rose"
                  />
                  <StatCard
                    label="Avg Savings Rate"
                    value={`${identity.avgSavingsRate ?? 0}%`}
                    sub={identity.avgSavingsRate > 0 ? 'of income saved' : 'spending more than earning'}
                    accent={identity.avgSavingsRate > 20 ? 'emerald' : identity.avgSavingsRate > 0 ? 'teal' : 'rose'}
                  />
                  <StatCard
                    label="Months Tracked"
                    value={identity.monthsTracked || 0}
                    sub="months of history"
                    accent="gray"
                  />
                </div>
                {identity.topCategory && (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Top spending category</p>
                      <p className="text-sm font-bold text-gray-900 capitalize">{toTitleCase(identity.topCategory)}</p>
                    </div>
                    <span className="text-2xl font-black text-teal-600">{identity.topCategoryPct}%</span>
                  </div>
                )}
              </>
            )}
          </Section>

          {/* ── Default Preferences ── */}
          <Section title="Default Preferences" subtitle="Applied to new transactions and display formatting">
            <div className="space-y-4">
              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                <select
                  value={prefs.currency}
                  onChange={e => setPrefs(p => ({ ...p, currency: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
                <select
                  value={prefs.timezone}
                  onChange={e => setPrefs(p => ({ ...p, timezone: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>

              {/* Week starts on */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Week starts on</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 rounded-xl">
                  {['monday', 'sunday'].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPrefs(p => ({ ...p, weekStartsOn: d }))}
                      className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                        prefs.weekStartsOn === d ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Number format</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 rounded-xl">
                  {[
                    { val: 'dot',   label: '1.000.000,00' },
                    { val: 'comma', label: '1,000,000.00' },
                  ].map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPrefs(p => ({ ...p, numberFormat: val }))}
                      className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                        prefs.numberFormat === val ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {prefsError && (
                <p className="text-sm text-red-600">{prefsError}</p>
              )}

              <button
                onClick={savePrefs}
                disabled={prefsSaving}
                className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {prefsSaving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {prefsSaved ? '✓ Saved!' : 'Save preferences'}
              </button>
            </div>
          </Section>

          {/* ── Export Data ── */}
          <Section title="Export Data" subtitle="Download your transactions as a CSV file">
            <div className="space-y-4">
              {/* Period selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Period</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 rounded-xl">
                  {[
                    { val: 'all',     label: 'All time' },
                    { val: 'yearly',  label: 'Yearly' },
                    { val: 'monthly', label: 'Monthly' },
                  ].map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setExportPeriod(val)}
                      className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                        exportPeriod === val ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year picker */}
              {exportPeriod === 'yearly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Year</label>
                  <input
                    type="number"
                    min="2000"
                    max={new Date().getFullYear()}
                    value={exportYear}
                    onChange={e => setExportYear(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>
              )}

              {/* Month picker */}
              {exportPeriod === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Month</label>
                  <input
                    type="month"
                    value={exportMonth}
                    onChange={e => setExportMonth(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>
              )}

              {exportError && <p className="text-sm text-red-600">{exportError}</p>}

              <button
                onClick={handleExport}
                disabled={exportDisabled}
                className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {exportLoading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Exporting…</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg> Download CSV</>
                )}
              </button>
            </div>
          </Section>

          {/* ── Import CSV ── */}
          <Section title="Import CSV" subtitle="Bulk-import transactions from a spreadsheet export">
            <div className="space-y-4">
              {/* Column guide */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-600">Expected CSV columns</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 uppercase tracking-wide">
                        <th className="px-4 py-2 text-left font-medium">Column</th>
                        <th className="px-4 py-2 text-left font-medium">Required</th>
                        <th className="px-4 py-2 text-left font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {CSV_COLUMNS.map(({ col, required, note }) => (
                        <tr key={col}>
                          <td className="px-4 py-2">
                            <code className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{col}</code>
                          </td>
                          <td className="px-4 py-2">
                            {required
                              ? <span className="text-rose-600 font-medium">Yes</span>
                              : <span className="text-gray-400">No</span>}
                          </td>
                          <td className="px-4 py-2 text-gray-500">{note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Drop zone */}
              <form onSubmit={handleImportSubmit}>
                <div
                  onClick={() => importInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setImportDrag(true); }}
                  onDragLeave={() => setImportDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setImportDrag(false); handleImportFile(e.dataTransfer.files[0]); }}
                  className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 px-6 cursor-pointer transition-all ${
                    importDrag
                      ? 'border-teal-400 bg-teal-50'
                      : importFile
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-300 hover:border-teal-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => handleImportFile(e.target.files[0])}
                  />
                  <div className="text-3xl">{importFile ? '✅' : '📄'}</div>
                  {importFile ? (
                    <>
                      <p className="font-medium text-emerald-700 text-sm">{importFile.name}</p>
                      <p className="text-xs text-gray-400">{(importFile.size / 1024).toFixed(1)} KB · Click to change</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-gray-700 text-sm">
                        Drop your CSV here, or <span className="text-teal-600 underline">browse</span>
                      </p>
                      <p className="text-xs text-gray-400">Only .csv files, max 5 MB</p>
                    </>
                  )}
                </div>

                {importError && (
                  <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{importError}</div>
                )}

                <button
                  type="submit"
                  disabled={!importFile || importLoading}
                  className="mt-3 w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import
                </button>
              </form>
            </div>
          </Section>

          {/* ── Danger Zone ── */}
          <Section title="Danger Zone" danger>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Delete account</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Permanently delete your account and wipe all transactions and balance data.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex-shrink-0 px-4 py-2 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </Section>

        </main>
      </div>
    </AuthGuard>
  );
}
