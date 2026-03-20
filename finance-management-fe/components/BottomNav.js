'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

// Pages accessible directly from the bottom bar
const MAIN_TABS = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  // centre slot — FAB Add button
  { key: 'add' },
  {
    href: '/reports',
    label: 'Reports',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  // "More" opens a bottom sheet with Planner, Insights, Profile
  { key: 'more' },
];

// Pages surfaced inside the "More" sheet
const MORE_LINKS = [
  {
    href: '/recommendation',
    label: 'Planner',
    desc: 'FIRE calculator & debt payoff',
    icon: '💡',
  },
  {
    href: '/insights',
    label: 'Insights',
    desc: 'AI spending analysis',
    icon: '🔍',
  },
  {
    href: '/profile',
    label: 'Profile & Settings',
    desc: 'Account, preferences, export',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

const MORE_HREFS = MORE_LINKS.map(l => l.href);

export default function BottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close sheet on navigation
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  const moreActive = MORE_HREFS.includes(pathname);

  return (
    <>
      {/* Bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-end justify-around h-16 px-1">
          {MAIN_TABS.map((tab) => {
            // FAB Add
            if (tab.key === 'add') {
              return (
                <Link
                  key="add"
                  href="/add"
                  className="flex flex-col items-center justify-center -mt-5"
                  aria-label="Add Transaction"
                >
                  <span
                    className="flex items-center justify-center rounded-full bg-teal-600 shadow-lg shadow-teal-200 dark:shadow-teal-900 border-4 border-white dark:border-slate-900 active:scale-95 transition-transform"
                    style={{ width: 52, height: 52 }}
                  >
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                  <span className="text-[10px] mt-0.5 text-teal-600 dark:text-teal-400 font-medium">Add</span>
                </Link>
              );
            }

            // More button
            if (tab.key === 'more') {
              return (
                <button
                  key="more"
                  onClick={() => setSheetOpen(v => !v)}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                    moreActive || sheetOpen
                      ? 'text-teal-600 dark:text-teal-400'
                      : 'text-gray-400 dark:text-slate-500'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                  </svg>
                  <span className="text-[10px] font-medium">More</span>
                  {moreActive && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-teal-500" />}
                </button>
              );
            }

            // Regular tab
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  active
                    ? 'text-teal-600 dark:text-teal-400'
                    : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                }`}
              >
                {tab.icon}
                <span className="text-[10px] font-medium">{tab.label}</span>
                {active && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-teal-500" />}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* More sheet */}
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          sheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSheetOpen(false)}
      />

      {/* Sheet panel */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-2xl shadow-xl transition-transform duration-300 ease-out
          ${sheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        <p className="px-5 pb-2 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">
          More pages
        </p>

        <div className="px-3 pb-3 flex flex-col gap-1">
          {MORE_LINKS.map(({ href, label, desc, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-colors ${
                  active
                    ? 'bg-teal-50 dark:bg-teal-900/40'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className={`text-xl w-7 text-center shrink-0 ${active ? '' : 'grayscale-0'}`}>
                  {typeof icon === 'string' ? icon : (
                    <span className={active ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-slate-500'}>
                      {icon}
                    </span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${active ? 'text-teal-700 dark:text-teal-400' : 'text-gray-800 dark:text-slate-200'}`}>
                    {label}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{desc}</p>
                </div>
                {active && <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
