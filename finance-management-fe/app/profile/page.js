'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import {
  getProfile,
  updateIdentity,
  updatePreferences,
  exportTransactions,
  importCsv,
  deleteAccount,
  changePassword,
  logoutAllDevices,
} from '@/lib/api';
import { toTitleCase } from '@/lib/format';
import { useFormatAmount, useCurrency } from '@/components/CurrencyContext';
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

// ─── Relative time helper ─────────────────────────────────────────────────────
function timeAgo(date) {
  if (!date) return null;
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} minute${Math.floor(secs / 60) !== 1 ? 's' : ''} ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hour${Math.floor(secs / 3600) !== 1 ? 's' : ''} ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)} day${Math.floor(secs / 86400) !== 1 ? 's' : ''} ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

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

// ─── Delete modal ─────────────────────────────────────────────────────────────
function DeleteModal({ username, onCancel, onConfirmed }) {
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleDelete = async () => {
    if (input !== username) { setError('Username does not match'); return; }
    setLoading(true);
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
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 w-full max-w-sm">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.293 4.293a1 1 0 011.414 0L21 14.586A2 2 0 0119.586 17H4.414A2 2 0 013 14.586L10.293 4.293z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-gray-900 text-center">Delete account</h3>
        <p className="text-xs text-gray-500 text-center mt-1">
          This action is permanent and cannot be undone.
        </p>

        {/* What gets deleted */}
        <div className="mt-3 mb-3 rounded-xl bg-red-50 border border-red-200 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-red-700 mb-1">The following will be permanently deleted:</p>
          {[
            'Your account and login credentials',
            'All transactions (income & expense)',
            'All custom categories',
            'All preferences and settings',
          ].map(item => (
            <div key={item} className="flex items-start gap-1.5">
              <svg className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-xs text-red-700">{item}</span>
            </div>
          ))}
        </div>

        {/* Export suggestion */}
        <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.293 4.293a1 1 0 011.414 0L21 14.586A2 2 0 0119.586 17H4.414A2 2 0 013 14.586L10.293 4.293z" />
          </svg>
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Export your data first.</span>{' '}
            Use the <span className="font-medium">Export Data</span> section above to download a CSV backup of all your transactions before deleting.
          </p>
        </div>

        <p className="text-xs text-gray-700 mb-1.5">
          Type <span className="font-semibold">{username}</span> to confirm:
        </p>
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          placeholder={username}
          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3" />
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={loading || input !== username}
            className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {loading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
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

// ─── Reusable section card ────────────────────────────────────────────────────
function Card({ title, subtitle, danger = false, children }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm ${danger ? 'border-red-200' : 'border-gray-200'}`}>
      <div className={`px-4 py-3 border-b rounded-t-2xl ${danger ? 'border-red-100' : 'border-gray-100'}`}>
        <h2 className={`text-xs font-semibold uppercase tracking-wide ${danger ? 'text-red-500' : 'text-gray-500'}`}>{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Toggle group (2 options) ─────────────────────────────────────────────────
function Toggle({ options, value, onChange }) {
  return (
    <div className="grid p-1 bg-gray-100 rounded-xl" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(o => (
        <button key={o.val} type="button" onClick={() => onChange(o.val)}
          className={`py-1.5 rounded-lg text-sm font-semibold transition-all ${
            value === o.val ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const formatAmount = useFormatAmount();
  const { refreshCurrency } = useCurrency();
  const router = useRouter();

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

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Change password
  const [pwForm,    setPwForm]    = useState({ current: '', next: '', confirm: '' });
  const [pwSaving,  setPwSaving]  = useState(false);
  const [pwMsg,     setPwMsg]     = useState(null); // { ok, text }
  const [showPwForm, setShowPwForm] = useState(false);

  // Logout all devices
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    getProfile()
      .then(res => {
        setProfile(res.data);
        if (res.data.preferences) setPrefs(res.data.preferences);
        if (res.data.user) setIdentityFields({ name: res.data.user.name || '', username: res.data.user.username || '' });
      })
      .catch(e => setProfileError(e.message || 'Failed to load profile'))
      .finally(() => setLoadingProfile(false));
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

  // ── Change password ───────────────────────────────────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ ok: false, text: 'New passwords do not match' }); return;
    }
    if (pwForm.next.length < 8) {
      setPwMsg({ ok: false, text: 'New password must be at least 8 characters' }); return;
    }
    setPwSaving(true); setPwMsg(null);
    try {
      await changePassword({ currentPassword: pwForm.current, newPassword: pwForm.next });
      setPwMsg({ ok: true, text: 'Password changed. Please log in again.' });
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        router.replace('/login');
      }, 1500);
    } catch (e) {
      setPwMsg({ ok: false, text: e.message || 'Failed to change password' });
    } finally {
      setPwSaving(false);
    }
  };

  // ── Logout all devices ────────────────────────────────────────────────────
  const handleLogoutAll = async () => {
    if (!confirm('This will sign you out of all devices. Continue?')) return;
    setLogoutAllLoading(true);
    try {
      await logoutAllDevices();
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      router.replace('/login');
    } catch (e) {
      alert(e.message || 'Failed to logout all devices');
      setLogoutAllLoading(false);
    }
  };

  // ── Delete account ────────────────────────────────────────────────────────
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

  const handleDeleteConfirmed = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    router.replace('/login');
  };

  // ─── Data shortcuts ───────────────────────────────────────────────────────
  const user     = profile?.user     || {};
  const identity = profile?.identity || {};
  const initial  = (user.username || user.name || 'U')[0].toUpperCase();
  const exportDisabled = exportLoading
    || (exportPeriod === 'monthly' && !exportMonth)
    || (exportPeriod === 'yearly'  && !exportYear)
    || (exportPeriod === 'range'   && (!exportRangeStart || !exportRangeEnd));

  return (
    <AuthGuard>
      {importLoading && <UploadProgress filename={importFiles.length === 1 ? importFiles[0].name : `${importFiles.length} files`} />}
      {importResult  && <ImportSuccessModal result={importResult} onClose={() => setImportResult(null)} />}
      {showDeleteModal && (
        <DeleteModal
          username={user.username || ''}
          onCancel={() => setShowDeleteModal(false)}
          onConfirmed={handleDeleteConfirmed}
        />
      )}

      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-4xl mx-auto px-4 py-6">

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
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Username</label>
                    <input
                      value={identityFields.username}
                      onChange={e => setIdentityFields(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
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
                  {user.email && <p className="text-xs text-gray-500 truncate">{user.email}</p>}
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
              <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-100">
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
              <Card title="Financial Identity" subtitle="Avg across months with activity">
                {loadingProfile ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                  </div>
                ) : identity.monthsTracked === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Add some transactions to see your financial identity.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Avg Monthly Income',  value: formatAmount(identity.avgMonthlyIncome  || 0), accent: 'emerald' },
                        { label: 'Avg Monthly Expense',  value: formatAmount(identity.avgMonthlyExpense || 0), accent: 'rose'    },
                        { label: 'Avg Savings Rate',     value: `${identity.avgSavingsRate ?? 0}%`,         accent: identity.avgSavingsRate > 20 ? 'emerald' : identity.avgSavingsRate > 0 ? 'teal' : 'rose' },
                        { label: 'Months Tracked',       value: `${identity.monthsTracked || 0} mo`,        accent: 'gray'    },
                      ].map(({ label, value, accent }) => {
                        const colors = {
                          emerald: 'bg-emerald-50 text-emerald-700',
                          rose:    'bg-rose-50 text-rose-700',
                          teal:    'bg-teal-50 text-teal-700',
                          gray:    'bg-gray-50 text-gray-700',
                        };
                        return (
                          <div key={label} className={`rounded-xl p-3 ${colors[accent]}`}>
                            <p className="text-xs font-medium opacity-70 leading-tight mb-1">{label}</p>
                            <p className="text-base font-black">{value}</p>
                          </div>
                        );
                      })}
                    </div>
                    {identity.topCategory && (
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                        <div>
                          <p className="text-xs text-gray-400">Top category</p>
                          <p className="text-sm font-bold text-gray-900 capitalize mt-0.5">{toTitleCase(identity.topCategory)}</p>
                        </div>
                        <span className="text-xl font-black text-teal-600">{identity.topCategoryPct}%</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Security */}
              <Card title="Security">
                <div className="space-y-3">
                  {profile?.account?.hasPassword !== false && (
                    <div>
                      <button
                        onClick={() => { setShowPwForm(v => !v); setPwMsg(null); }}
                        className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-800 hover:text-teal-600 transition-colors"
                      >
                        <span>Change password</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${showPwForm ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showPwForm && (
                        <form onSubmit={handleChangePassword} className="mt-2 space-y-2">
                          {[
                            { key: 'current',  placeholder: 'Current password' },
                            { key: 'next',     placeholder: 'New password (8+ chars)' },
                            { key: 'confirm',  placeholder: 'Confirm new password' },
                          ].map(({ key, placeholder }) => (
                            <input
                              key={key}
                              type="password"
                              placeholder={placeholder}
                              value={pwForm[key]}
                              onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                              required
                              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                            />
                          ))}
                          {pwMsg && (
                            <p className={`text-xs ${pwMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{pwMsg.text}</p>
                          )}
                          <button type="submit" disabled={pwSaving}
                            className="w-full py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                            {pwSaving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                            Update password
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                  <div className={`${profile?.account?.hasPassword !== false ? 'border-t border-gray-100 pt-3' : ''}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Logout all devices</p>
                        {profile?.account?.lastLoginAt && (
                          <p className="text-xs text-gray-400 mt-0.5">Last login: {timeAgo(profile.account.lastLoginAt)}</p>
                        )}
                      </div>
                      <button
                        onClick={handleLogoutAll}
                        disabled={logoutAllLoading}
                        className="shrink-0 px-3 py-1.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        {logoutAllLoading
                          ? <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                          : 'Sign out all'
                        }
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-4">

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
                        className="w-full pl-12 pr-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
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
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
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

              {/* Danger Zone */}
              <Card danger title="Danger Zone">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Delete account</p>
                    <p className="text-xs text-gray-500 mt-0.5">Permanently wipes all your data.</p>
                  </div>
                  <button onClick={() => setShowDeleteModal(true)}
                    className="shrink-0 px-4 py-1.5 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50">
                    Delete
                  </button>
                </div>
              </Card>

            </div>
          </div>

        </main>
      </div>
    </AuthGuard>
  );
}
