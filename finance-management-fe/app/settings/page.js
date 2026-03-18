'use client';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { useTheme } from '@/components/ThemeContext';

export default function SettingsPage() {
  const { dark, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');

  useEffect(() => {
    setUsername(localStorage.getItem('username') || '');
  }, []);

  return (
    <AuthGuard>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile & Settings</h1>

        {/* Profile info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
              {username ? username[0].toUpperCase() : 'U'}
            </div>
            <div>
              <p className="font-semibold text-gray-900 capitalize">{username || 'User'}</p>
              <p className="text-sm text-gray-500">Personal finance account</p>
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                dark ? 'bg-indigo-600' : 'bg-gray-200'
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
      </main>
    </AuthGuard>
  );
}
