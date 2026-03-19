'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Renders a small ? icon that shows a tooltip on hover (desktop) or tap (mobile).
// Usage: <Tooltip text="Explanation here" />
// Or wrap custom trigger: <Tooltip text="..." trigger={<span>?</span>} />
// position: 'top' | 'bottom'
// align:    'center' | 'left' | 'right'
// fixed:    true — renders bubble via portal at position:fixed to escape overflow:auto containers
export default function Tooltip({ text, trigger, position = 'top', align = 'center', fixed: useFixed = false }) {
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState(null);
  const ref    = useRef(null);
  const btnRef = useRef(null);

  // Close on outside click (mobile tap-away)
  useEffect(() => {
    if (!show) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  const measure = () => {
    if (useFixed && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
  };

  const isTop = position !== 'bottom';
  const gap   = isTop ? 'mb-2' : 'mt-2';
  const side  = isTop ? 'bottom-full' : 'top-full';

  const bubbleCls =
    align === 'right'  ? `${side} right-0 ${gap}` :
    align === 'left'   ? `${side} left-0 ${gap}` :
                         `${side} left-1/2 -translate-x-1/2 ${gap}`;

  const arrowAlign =
    align === 'right'  ? 'right-2' :
    align === 'left'   ? 'left-2' :
                         'left-1/2 -translate-x-1/2';

  const arrowCls = isTop
    ? `absolute top-full ${arrowAlign} border-[5px] border-transparent border-t-gray-900`
    : `absolute bottom-full ${arrowAlign} border-[5px] border-transparent border-b-gray-900`;

  // Compute fixed-mode inline style from the trigger's bounding rect
  const fixedStyle = (useFixed && rect) ? (() => {
    const style = { position: 'fixed', zIndex: 9999, width: '14rem' };
    if (isTop) {
      style.bottom = `${window.innerHeight - rect.top + 8}px`;
    } else {
      style.top = `${rect.bottom + 8}px`;
    }
    if (align === 'right') {
      style.right = `${window.innerWidth - rect.right}px`;
    } else if (align === 'left') {
      style.left = `${rect.left}px`;
    } else {
      style.left  = `${rect.left + rect.width / 2}px`;
      style.transform = 'translateX(-50%)';
    }
    return style;
  })() : null;

  const bubbleBody = (
    <>
      {text}
      <span className={arrowCls} />
    </>
  );

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={() => { measure(); setShow(true); }}
        onMouseLeave={() => setShow(false)}
        onClick={() => { measure(); setShow(v => !v); }}
        onFocus={() => { measure(); setShow(true); }}
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

      {/* Default: absolute positioning */}
      {show && !useFixed && (
        <span className={`absolute ${bubbleCls} w-56 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 leading-relaxed shadow-xl z-50 pointer-events-none whitespace-normal`}>
          {bubbleBody}
        </span>
      )}

      {/* Fixed: portal to <body> to escape overflow containers */}
      {show && useFixed && fixedStyle && typeof document !== 'undefined' && createPortal(
        <span
          style={fixedStyle}
          className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 leading-relaxed shadow-xl pointer-events-none whitespace-normal"
        >
          {bubbleBody}
        </span>,
        document.body,
      )}
    </span>
  );
}
