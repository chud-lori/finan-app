'use client';
import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, isValid } from 'date-fns';
import 'react-day-picker/style.css';

export default function DateTimePicker({ value, onChange, timezone }) {
  const [open, setOpen]       = useState(false);
  const [timeStr, setTimeStr] = useState(() => value ? format(value, 'HH:mm') : format(new Date(), 'HH:mm'));
  const containerRef          = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (value && isValid(value)) setTimeStr(format(value, 'HH:mm'));
  }, [value]);

  const displayLabel = value && isValid(value)
    ? format(value, 'dd MMM yyyy, HH:mm')
    : 'Pick date & time…';

  const handleDaySelect = (day) => {
    if (!day) return;
    const [h, m] = timeStr.split(':').map(Number);
    const next = new Date(day);
    next.setHours(h || 0, m || 0, 0, 0);
    onChange(next);
    setOpen(false);
  };

  const handleTimeChange = (e) => {
    const t = e.target.value;
    setTimeStr(t);
    if (value && isValid(value) && t.includes(':')) {
      const [h, m] = t.split(':').map(Number);
      const next = new Date(value);
      next.setHours(h, m, 0, 0);
      onChange(next);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-left"
      >
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className={value && isValid(value) ? 'text-gray-900' : 'text-gray-400'}>
          {displayLabel}
        </span>
      </button>

      {open && (
        <div className="absolute z-30 bottom-full mb-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden" style={{ minWidth: 300 }}>
          <div className="rdp-themed p-2">
            <DayPicker
              mode="single"
              selected={value && isValid(value) ? value : undefined}
              onSelect={handleDaySelect}
              captionLayout="dropdown"
              fromYear={2020}
              toYear={new Date().getFullYear() + 1}
            />
          </div>

          <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-3">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <label className="text-xs text-gray-500 font-medium shrink-0">Time</label>
            <input
              type="time"
              value={timeStr}
              onChange={handleTimeChange}
              className="flex-1 text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          {timezone && (
            <div className="px-4 pb-3 flex items-center gap-1.5">
              <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
              </svg>
              <span className="text-xs text-gray-400">{timezone}</span>
            </div>
          )}
        </div>
      )}

      {timezone && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-gray-400">
            Timezone: <span className="font-medium text-gray-600">{timezone}</span>
          </span>
        </div>
      )}
    </div>
  );
}
