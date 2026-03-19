'use client';
import { useState, useEffect, useRef } from 'react';

// Renders a small ⓘ icon that shows a tooltip on hover (desktop) or tap (mobile).
// Usage: <Tooltip text="Explanation here" />
// Or wrap custom trigger: <Tooltip text="..." trigger={<span>?</span>} />
export default function Tooltip({ text, trigger, position = 'top' }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);

  // Close on outside click (mobile tap-away)
  useEffect(() => {
    if (!show) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  const isTop    = position !== 'bottom';
  const bubbleCls = isTop
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
    : 'top-full left-1/2 -translate-x-1/2 mt-2';
  const arrowCls  = isTop
    ? 'absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900'
    : 'absolute bottom-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-b-gray-900';

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label="More info"
        className="focus:outline-none"
      >
        {trigger ?? (
          <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold flex items-center justify-center hover:bg-gray-300 transition-colors leading-none select-none">
            ?
          </span>
        )}
      </button>

      {show && (
        <span className={`absolute ${bubbleCls} w-56 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 leading-relaxed shadow-xl z-50 pointer-events-none whitespace-normal`}>
          {text}
          <span className={arrowCls} />
        </span>
      )}
    </span>
  );
}
