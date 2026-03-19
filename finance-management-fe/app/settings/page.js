'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { useTheme } from '@/components/ThemeContext';
import { deleteAccount } from '@/lib/api';

function DeleteAccountModal({ username, onCancel, onConfirmed }) {
  const [input, setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleDelete = async () => {
    if (input !== username) {
      setError('Username does not match');
      return;
    }
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

        {error && (
          <p className="text-xs text-red-600 mb-3">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || input !== username}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Delete account
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { dark, toggleTheme } = useTheme();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setUsername(localStorage.getItem('username') || '');
  }, []);

  const handleConfirmed = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('theme');
    router.replace('/login');
  };

  return (
    <AuthGuard>
      {showModal && (
        <DeleteAccountModal
          username={username}
          onCancel={() => setShowModal(false)}
          onConfirmed={handleConfirmed}
        />
      )}
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile & Settings</h1>

        {/* Profile info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-bold text-lg">
              {username ? username[0].toUpperCase() : 'U'}
            </div>
            <div>
              <p className="font-semibold text-gray-900 capitalize">{username || 'User'}</p>
              <p className="text-sm text-gray-500">Personal finance account</p>
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                {dark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Dark mode</p>
                <p className="text-xs text-gray-500">{dark ? 'On — switch to light' : 'Off — switch to dark'}</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                dark ? 'bg-teal-600' : 'bg-gray-200'
              }`}
              aria-checked={dark}
              role="switch"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  dark ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white border border-red-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wide mb-4">Danger zone</h2>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Delete account</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Permanently delete your account and wipe all transactions and balance data.
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex-shrink-0 px-4 py-2 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
