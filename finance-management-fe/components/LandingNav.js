'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function LandingNav() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem('token'));
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className="font-bold text-xl text-teal-600 tracking-tight">Finan App</span>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-600 font-medium">
          {[['#features','Features'],['#tools','Tools'],['#how','How it works']].map(([href, label]) => (
            <a key={href} href={href}
              className="relative py-1 hover:text-teal-600 transition-colors after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-teal-500 after:transition-all hover:after:w-full">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
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
      </div>
    </header>
  );
}
