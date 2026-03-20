'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/components/ThemeContext';

const NAV_LINKS = [
  { href: '/dashboard',      label: 'Dashboard' },
  { href: '/analytics',      label: 'Analytics'  },
  { href: '/reports',        label: 'Reports'    },
  { href: '/recommendation', label: 'Planner'    },
  { href: '/insights',       label: 'Insights'   },
];

function ThemeToggle() {
  const { dark, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`p-2 rounded-lg transition-all duration-200 ${
        dark
          ? 'text-yellow-400 hover:bg-slate-800 hover:text-yellow-300'
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
      }`}
    >
      {dark ? (
        <svg className="w-4 h-4 transition-transform duration-500 hover:rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

function UserMenu({ username, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const pathname = usePathname();
  const initial = username.charAt(0).toUpperCase() || '?';

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all duration-150 ${
          open
            ? 'bg-gray-100 dark:bg-slate-800 ring-1 ring-gray-200 dark:ring-slate-700'
            : 'hover:bg-gray-100 dark:hover:bg-slate-800'
        }`}
      >
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
          {initial}
        </span>
        <span className="text-sm font-medium text-gray-700 dark:text-slate-300 capitalize max-w-[80px] truncate">
          {username}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="dropdown-enter absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-gray-200/70 dark:shadow-black/40 border border-gray-100 dark:border-slate-700 py-1.5 z-50">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
            <p className="text-xs text-gray-400 dark:text-slate-500">Signed in as</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 capitalize truncate">{username}</p>
          </div>
          <div className="py-1">
            <Link
              href="/profile"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors rounded-lg mx-1"
            >
              <span className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              Profile & Settings
            </Link>
          </div>
          <div className="border-t border-gray-100 dark:border-slate-700 mt-1 pt-1">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors rounded-lg mx-0"
            >
              <span className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </span>
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState('');

  useEffect(() => {
    setUsername(localStorage.getItem('username') || 'User');
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    router.replace('/login');
  };

  return (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-200/80 dark:border-slate-700/80 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-15 gap-4" style={{ height: '3.75rem' }}>

        {/* Brand */}
        <Link href="/" className="flex items-center shrink-0">
          <Image src="/logo.png" alt="Finan App" width={120} height={64} className="h-8 w-auto" priority />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800'
                }`}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0.5 left-3 right-3 h-0.5 rounded-full bg-teal-500 dark:bg-teal-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <ThemeToggle />

          {/* Add button — gradient + glow + rotating icon */}
          <Link
            href="/add"
            className="group flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 active:from-teal-600 active:to-teal-700 text-white text-sm font-semibold transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-teal-300/40 dark:hover:shadow-teal-900/60 hover:scale-[1.04] active:scale-95 ml-1"
          >
            <svg
              className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </Link>

          <div className="w-px h-5 bg-gray-200 dark:bg-slate-700 mx-1.5" />
          <UserMenu username={username} onLogout={logout} />
        </div>

        {/* Mobile: theme toggle only */}
        <div className="md:hidden flex items-center">
          <ThemeToggle />
        </div>

      </div>
    </header>
  );
}
