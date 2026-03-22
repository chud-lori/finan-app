'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function LandingHeroCTA() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem('token'));
  }, []);

  const primaryCls = "relative inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl btn-cta text-white font-semibold text-base shadow-lg shadow-teal-300/40 hover:shadow-xl hover:shadow-teal-300/60 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 overflow-hidden";

  return (
    <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row gap-3 justify-center">
      {loggedIn ? (
        <Link href="/dashboard" className={primaryCls}>
          Go to Dashboard
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      ) : (
        <>
          <Link href="/register" className={primaryCls}>
            Start for free
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <Link href="/login"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-white border border-gray-200 text-gray-700 font-semibold text-base hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:scale-95 transition-all duration-200">
            Sign in
          </Link>
        </>
      )}
    </div>
  );
}
