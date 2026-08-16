'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { Card } from '@/components/SectionCard';
import ConfirmModal from '@/components/ConfirmModal';
import MobileLogoutButton from '@/components/MobileLogoutButton';
import {
  getProfile,
  changePassword,
  logoutAllDevices,
  getSessions,
  revokeSession,
  deleteAccount,
} from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useCurrency } from '@/components/CurrencyContext';

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
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
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

        {/* Export suggestion — Export Data lives on Profile, so link there rather
            than pointing at a section that is no longer on this page. */}
        <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.293 4.293a1 1 0 011.414 0L21 14.586A2 2 0 0119.586 17H4.414A2 2 0 013 14.586L10.293 4.293z" />
          </svg>
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Export your data first.</span>{' '}
            <Link href="/profile" className="font-semibold underline hover:text-amber-900">
              Download a CSV backup
            </Link>{' '}
            of all your transactions from your profile before deleting.
          </p>
        </div>

        <p className="text-xs text-gray-700 mb-1.5">
          Type <span className="font-semibold">{username}</span> to confirm:
        </p>
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          placeholder={username}
          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3" />
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const { clearCurrency } = useCurrency();

  const [profile,      setProfile]      = useState(null);
  const [profileError, setProfileError] = useState('');

  // Change password
  const [pwForm,     setPwForm]     = useState({ current: '', next: '', confirm: '' });
  const [pwSaving,   setPwSaving]   = useState(false);
  const [pwMsg,      setPwMsg]      = useState(null); // { ok, text }
  const [showPwForm, setShowPwForm] = useState(false);

  // Logout all devices
  const [logoutAllLoading,     setLogoutAllLoading]     = useState(false);
  const [showLogoutAllConfirm, setShowLogoutAllConfirm] = useState(false);
  const [logoutAllError,       setLogoutAllError]       = useState(null);

  // Sessions
  const [sessions,        setSessions]        = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId,      setRevokingId]      = useState(null);
  const [sessionError,    setSessionError]    = useState(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    getSessions()
      .then(res => setSessions(res.data?.sessions || []))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));

    getProfile()
      .then(res => setProfile(res.data))
      .catch(e => setProfileError(e.message || 'Failed to load account details'));
  }, []);

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
        try { localStorage.removeItem('username'); } catch {}
        clearCurrency();
        router.replace('/login');
      }, 1500);
    } catch (err) {
      setPwMsg({ ok: false, text: err.message || 'Failed to change password' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    setShowLogoutAllConfirm(false);
    setLogoutAllLoading(true);
    setLogoutAllError(null);
    try {
      await logoutAllDevices();
      try { localStorage.removeItem('username'); } catch {}
      clearCurrency();
      router.replace('/login');
    } catch (e) {
      setLogoutAllError(e.message || 'Failed to sign out all devices');
      setLogoutAllLoading(false);
    }
  };

  const handleRevokeSession = async (id) => {
    setRevokingId(id);
    setSessionError(null);
    try {
      await revokeSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setSessionError(e.message || 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleDeleteConfirmed = () => {
    try { localStorage.removeItem('username'); } catch {}
    clearCurrency();
    router.replace('/login');
  };

  const user        = profile?.user || {};
  const hasPassword = profile?.account?.hasPassword !== false;

  return (
    <AuthGuard>
      {showDeleteModal && (
        <DeleteModal
          username={user.username || ''}
          onCancel={() => setShowDeleteModal(false)}
          onConfirmed={handleDeleteConfirmed}
        />
      )}
      {showLogoutAllConfirm && (
        <ConfirmModal
          title="Sign out all devices?"
          message="This will end all active sessions including this one. You'll need to sign in again on every device."
          confirmLabel="Sign out all"
          loading={logoutAllLoading}
          onCancel={() => setShowLogoutAllConfirm(false)}
          onConfirm={handleLogoutAll}
        />
      )}

      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-2xl mx-auto px-4 py-6 pb-24 md:pb-6">

          {/* ── Header ── */}
          <div className="mb-4">
            <Link href="/profile"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-teal-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to profile
            </Link>
            <h1 className="text-xl font-bold text-gray-900 mt-2">Security &amp; account</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Password, signed-in devices and account deletion.
            </p>
          </div>

          {profileError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm mb-4">{profileError}</div>
          )}

          <div className="space-y-4">

            {/* ── Security ── */}
            <Card title="Security">
              <div className="space-y-3">
                {hasPassword && (
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
                          { key: 'current', placeholder: 'Current password',           autoComplete: 'current-password' },
                          { key: 'next',    placeholder: 'New password (8+ chars)',    autoComplete: 'new-password'     },
                          { key: 'confirm', placeholder: 'Confirm new password',       autoComplete: 'new-password'     },
                        ].map(({ key, placeholder, autoComplete }) => (
                          <input
                            key={key}
                            type="password"
                            placeholder={placeholder}
                            autoComplete={autoComplete}
                            value={pwForm[key]}
                            onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                            required
                            /* text-base under sm — iOS zooms the viewport on focus for
                               anything under 16px, which the PWA never zooms back out. */
                            className="w-full px-3 py-2 rounded-xl border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
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
                {!hasPassword && (
                  <p className="text-sm text-gray-500">
                    You sign in with Google, so there&apos;s no password to change here.
                  </p>
                )}
                <div className={hasPassword ? 'border-t border-gray-100 pt-3' : ''}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">Logout all devices</p>
                      {profile?.account?.lastLoginAt && (
                        <p className="text-xs text-gray-400 mt-0.5">Last login: {timeAgo(profile.account.lastLoginAt)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setShowLogoutAllConfirm(true)}
                      disabled={logoutAllLoading}
                      className="shrink-0 w-full sm:w-auto px-3 py-1.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {logoutAllLoading
                        ? <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                        : 'Sign out all'
                      }
                    </button>
                  </div>
                  {logoutAllError && (
                    <p className="text-xs text-rose-600 mt-2">{logoutAllError}</p>
                  )}
                </div>
              </div>
            </Card>

            {/* ── Active Sessions ── */}
            <Card title="Active Sessions" subtitle="Devices currently signed in to your account">
              {sessionError && (
                <p className="text-xs text-rose-600 mb-3">{sessionError}</p>
              )}
              {sessionsLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No active sessions found.</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map(s => (
                    <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border ${s.isCurrent ? 'border-teal-200 bg-teal-50 dark:bg-teal-950/30' : 'border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40'}`}>
                      {/* Device icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm ${s.isCurrent ? 'bg-teal-100 dark:bg-teal-900/50' : 'bg-gray-200 dark:bg-slate-700'}`}>
                        {s.device?.os?.toLowerCase().includes('ios') || s.device?.os?.toLowerCase().includes('iphone') || s.device?.os?.toLowerCase().includes('android') ? '📱' : '🖥️'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{s.device?.name || 'Unknown device'}</p>
                          {s.isCurrent && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400 shrink-0">Current</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                          Last seen {timeAgo(s.lastSeen)}
                          {s.device?.ip && s.device.ip !== 'unknown' ? ` · ${s.device.ip}` : ''}
                        </p>
                      </div>
                      {!s.isCurrent && (
                        <button
                          onClick={() => handleRevokeSession(s.id)}
                          disabled={revokingId === s.id}
                          className="shrink-0 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors"
                        >
                          {revokingId === s.id ? '…' : 'Revoke'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── Danger Zone ── */}
            <Card danger title="Danger Zone">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Delete account</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Permanently wipes all your data.{' '}
                    <Link href="/profile" className="text-teal-600 font-medium hover:underline">Export a backup first</Link>.
                  </p>
                </div>
                <button onClick={() => setShowDeleteModal(true)}
                  className="shrink-0 w-full sm:w-auto px-4 py-1.5 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50">
                  Delete
                </button>
              </div>
            </Card>

            <MobileLogoutButton />

          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
