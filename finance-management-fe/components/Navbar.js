'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeContext';

const NAV_LINKS = [
  { href: '/dashboard',      label: 'Dashboard', icon: '📊' },
  { href: '/analytics',      label: 'Analytics',  icon: '📈' },
  { href: '/reports',        label: 'Reports',    icon: '📅' },
  { href: '/recommendation', label: 'Planner',    icon: '💡' },
  { href: '/insights',       label: 'Insights',   icon: '🔍' },
];

function ThemeToggle({ className = '' }) {
  const { dark, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className={`p-2 rounded-lg transition-colors ${dark ? 'text-yellow-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-100'} ${className}`}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setUsername(localStorage.getItem('username') || 'User');
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const close = () => setMobileOpen(false);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    router.replace('/login');
  };

  const initial = username.charAt(0).toUpperCase();

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Brand */}
        <Link href="/" className="flex items-center">
          <Image src="/logo.png" alt="Finan App" width={120} height={64} className="h-8 w-auto" priority />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-base">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/add"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </Link>
          <Link
            href="/profile"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/profile'
                ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="capitalize">{username}</span>
          </Link>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 font-medium transition-colors"
          >
            Log out
          </button>
        </div>

        {/* Mobile: hamburger only */}
        <button
          className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={close}
      />

      {/* Drawer panel */}
      <div
        className={`md:hidden fixed top-0 right-0 h-full w-72 z-50 flex flex-col
          bg-white dark:bg-slate-900 shadow-2xl
          transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <Image src="/logo.png" alt="Finan App" width={100} height={54} className="h-7 w-auto" />
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* User identity */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {initial}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 capitalize">{username}</p>
            <Link
              href="/profile"
              onClick={close}
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
            >
              View profile
            </Link>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5">
          <Link
            href="/add"
            onClick={close}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors mb-2"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add Transaction
          </Link>

          {NAV_LINKS.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-base w-5 text-center shrink-0">{icon}</span>
                {label}
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-500" />
                )}
              </Link>
            );
          })}

          <Link
            href="/profile"
            onClick={close}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              pathname === '/profile'
                ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400'
                : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Profile & Settings
            {pathname === '/profile' && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-500" />
            )}
          </Link>
        </nav>

        {/* Drawer footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700 flex flex-col gap-2">
          {/* Theme toggle row */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="flex items-center gap-3">
              {dark ? (
                <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              {dark ? 'Light mode' : 'Dark mode'}
            </span>
            <div className={`w-9 h-5 rounded-full relative transition-colors ${dark ? 'bg-teal-600' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${dark ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors w-full"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
