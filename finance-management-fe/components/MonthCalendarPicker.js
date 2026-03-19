'use client';
import { useState, useRef, useEffect } from 'react';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// value: 'YYYY-MM' string or ''
// onChange: (val: 'YYYY-MM') => void
export default function MonthCalendarPicker({ value, onChange, placeholder = 'Select month' }) {
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const [open, setOpen]         = useState(false);
  const [openUp, setOpenUp]     = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    if (value) return parseInt(value.split('-')[0], 10);
    return currentYear;
  });
  const ref     = useRef(null);
  const btnRef  = useRef(null);

  // Parse selected value
  const selYear  = value ? parseInt(value.split('-')[0], 10) : null;
  const selMonth = value ? parseInt(value.split('-')[1], 10) - 1 : null; // 0-indexed

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (!open && value) setViewYear(selYear);
    if (!open && btnRef.current) {
      // ~220px panel height — open upward if not enough space below
      const rect = btnRef.current.getBoundingClientRect();
      setOpenUp(rect.bottom + 240 > window.innerHeight);
    }
    setOpen(v => !v);
  };

  const handleSelect = (monthIdx) => {
    const ym = `${viewYear}-${String(monthIdx + 1).padStart(2, '0')}`;
    onChange(ym);
    setOpen(false);
  };

  const isFuture = (mIdx) =>
    viewYear > currentYear || (viewYear === currentYear && mIdx > currentMonth);

  const displayLabel = value
    ? `${MONTH_LABELS[selMonth]} ${selYear}`
    : placeholder;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 ${
          open
            ? 'border-teal-400 bg-teal-50 text-teal-700'
            : value
              ? 'border-gray-300 bg-white text-gray-800 hover:border-gray-400'
              : 'border-gray-300 bg-white text-gray-400 hover:border-gray-400'
        }`}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={value ? 'font-medium' : ''}>{displayLabel}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className={`absolute z-50 left-0 right-0 bg-white rounded-2xl border border-gray-200 shadow-lg p-3 ${
          openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
        }`}>
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={() => setViewYear(y => y - 1)}
              disabled={viewYear <= 2000}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <span className="text-sm font-bold text-gray-800">{viewYear}</span>

            <button
              type="button"
              onClick={() => setViewYear(y => y + 1)}
              disabled={viewYear >= currentYear}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_LABELS.map((label, idx) => {
              const future   = isFuture(idx);
              const selected = selYear === viewYear && selMonth === idx;
              const isToday  = viewYear === currentYear && idx === currentMonth;

              return (
                <button
                  key={label}
                  type="button"
                  disabled={future}
                  onClick={() => handleSelect(idx)}
                  className={`py-2 rounded-xl text-sm font-medium transition-all ${
                    selected
                      ? 'bg-teal-600 text-white shadow-sm'
                      : future
                        ? 'text-gray-300 cursor-not-allowed'
                        : isToday
                          ? 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
                          : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Clear */}
          {value && (
            <div className="mt-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
