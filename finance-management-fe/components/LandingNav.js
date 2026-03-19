'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function LandingNav() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem('token'));
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="font-bold text-xl text-teal-600 tracking-tight">Finan App</span>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-600 font-medium">
            {[['#features','Features'],['#tools','Tools'],['#how','How it works']].map(([href, label]) => (
              <a key={href} href={href}
                className="relative py-1 hover:text-teal-600 transition-colors after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-teal-500 after:transition-all hover:after:w-full">
                {label}
              </a>
            ))}
          </nav>

          {/* Desktop right buttons */}
          <div className="hidden sm:flex items-center gap-2">
            {loggedIn ? (
              <Link href="/dashboard"
                className="px-4 py-1.5 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 hover:shadow-lg hover:shadow-teal-200 active:scale-95 transition-all">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login"
                  className="px-3.5 py-1.5 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                  Sign in
                </Link>
                <Link href="/register"
                  className="px-3.5 py-1.5 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 hover:shadow-lg hover:shadow-teal-200 active:scale-95 transition-all">
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            onClick={() => setOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {open ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile dropdown */}
        <div className={`sm:hidden overflow-hidden transition-all duration-250 ease-in-out bg-white border-t border-gray-100 ${open ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0 border-t-0'}`}>
          <nav className="px-4 py-3 flex flex-col gap-1">
            {[['#features','Features'],['#tools','Tools'],['#how','How it works']].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}
                className="px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                {label}
              </a>
            ))}
            <div className="border-t border-gray-100 mt-2 pt-2 flex flex-col gap-1">
              {loggedIn ? (
                <Link href="/dashboard" onClick={() => setOpen(false)}
                  className="px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-colors text-center">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)}
                    className="px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    Sign in
                  </Link>
                  <Link href="/register" onClick={() => setOpen(false)}
                    className="px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-colors text-center">
                    Get started &mdash; it&apos;s free
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Backdrop for mobile menu */}
      {open && (
        <div className="sm:hidden fixed inset-0 bg-black/20 z-20" onClick={() => setOpen(false)} />
      )}
    </>
  );
}
