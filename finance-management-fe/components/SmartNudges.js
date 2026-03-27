'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getSmartRecommendations } from '@/lib/api';

const TYPE = {
  warning: {
    bg:     'from-amber-50 to-orange-50',
    border: 'border-amber-200',
    badge:  'bg-amber-100 text-amber-700',
    dot:    'bg-amber-400',
    label:  'Action needed',
  },
  success: {
    bg:     'from-teal-50 to-emerald-50',
    border: 'border-teal-200',
    badge:  'bg-teal-100 text-teal-700',
    dot:    'bg-teal-400',
    label:  'On track',
  },
  info: {
    bg:     'from-blue-50 to-indigo-50',
    border: 'border-blue-200',
    badge:  'bg-blue-100 text-blue-700',
    dot:    'bg-blue-400',
    label:  'AI insight',
  },
  tip: {
    bg:     'from-violet-50 to-purple-50',
    border: 'border-violet-200',
    badge:  'bg-violet-100 text-violet-700',
    dot:    'bg-violet-400',
    label:  'Tip',
  },
};

const INTERVAL_MS = 6000;

export default function SmartNudges() {
  const [recs,    setRecs]    = useState([]);
  const [idx,     setIdx]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false); // slide-out direction
  const [dir,     setDir]     = useState('next'); // 'next' | 'prev'
  const timerRef   = useRef(null);
  const navigateRef = useRef(null);

  useEffect(() => {
    getSmartRecommendations()
      .then(res => setRecs(res.data?.recommendations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const resetTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => navigateRef.current?.('next'), INTERVAL_MS);
  }, []);

  useEffect(() => {
    if (recs.length <= 1) return;
    timerRef.current = setInterval(() => navigateRef.current?.('next'), INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [recs.length]);

  const navigate = (direction) => {
    if (leaving) return;
    setDir(direction);
    setLeaving(true);
    setTimeout(() => {
      setIdx(i => direction === 'next'
        ? (i + 1) % recs.length
        : (i - 1 + recs.length) % recs.length
      );
      setLeaving(false);
    }, 200);
    resetTimer();
  };
  // Keep ref current so the interval always calls the latest navigate (with up-to-date recs/leaving)
  navigateRef.current = navigate;

  const goTo = (i) => {
    if (i === idx || leaving) return;
    setDir(i > idx ? 'next' : 'prev');
    setLeaving(true);
    setTimeout(() => { setIdx(i); setLeaving(false); }, 200);
    resetTimer();
  };

  if (loading) {
    return (
      <div className="mb-6 h-24 bg-white rounded-2xl border border-gray-200 shadow-sm animate-pulse" />
    );
  }

  if (!recs.length) return null;

  const rec = recs[idx];
  const cfg = TYPE[rec.type] || TYPE.tip;

  const slideOut = leaving
    ? dir === 'next' ? 'translate-x-[-18px] opacity-0' : 'translate-x-[18px] opacity-0'
    : 'translate-x-0 opacity-100';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .nudge-content { transition: transform 200ms ease, opacity 200ms ease; }
      `}} />
      <div className="mb-6">
        <div className={`relative bg-gradient-to-r ${cfg.bg} rounded-2xl border ${cfg.border} px-4 pt-3.5 pb-3 shadow-sm overflow-hidden`}>

          {/* Subtle background pattern */}
          <div aria-hidden className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '18px 18px' }} />

          <div className={`nudge-content relative ${slideOut}`}>
            <div className="flex items-start gap-3">

              {/* Icon */}
              <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center text-xl shrink-0 shadow-sm">
                {rec.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  <p className="text-sm font-semibold text-gray-900 truncate">{rec.title}</p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{rec.body}</p>
                {rec.cta && (
                  <Link href={rec.cta.href}
                    className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                    {rec.cta.label}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                )}
              </div>

              {/* Prev / Next arrows */}
              {recs.length > 1 && (
                <div className="flex items-center gap-0.5 shrink-0 self-center">
                  <button
                    onClick={() => navigate('prev')}
                    className="p-1.5 rounded-lg hover:bg-white/60 transition-colors text-gray-400 hover:text-gray-700"
                    aria-label="Previous recommendation"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => navigate('next')}
                    className="p-1.5 rounded-lg hover:bg-white/60 transition-colors text-gray-400 hover:text-gray-700"
                    aria-label="Next recommendation"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Dot indicators */}
          {recs.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-2.5">
              {recs.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === idx ? `w-5 h-1.5 ${cfg.dot}` : 'w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={`Go to recommendation ${i + 1}`}
                />
              ))}
            </div>
          )}

          {/* Count badge top-right */}
          {recs.length > 1 && (
            <span className="absolute top-3 right-3 text-[10px] text-gray-400 font-medium tabular-nums">
              {idx + 1}/{recs.length}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
