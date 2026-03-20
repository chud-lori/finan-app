'use client';
import { useRef, useState } from 'react';

const REVEAL = 72;     // px width of the delete zone shown when fully swiped
const TRIGGER = 56;    // px of drag needed to snap open

export default function SwipeToDelete({ onDelete, disabled, children }) {
  const startX = useRef(null);
  const startY = useRef(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  // undefined → axis not yet decided; 'h' | 'v'
  const axis = useRef(undefined);

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = undefined;
    setDragging(true);
  };

  const onTouchMove = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Lock axis on first meaningful movement
    if (axis.current === undefined && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }

    if (axis.current !== 'h') return; // vertical scroll — ignore
    e.preventDefault(); // prevent page scroll while swiping row

    if (open) {
      // Already open: swiping right closes
      const raw = REVEAL - dx;
      setOffset(Math.max(0, Math.min(REVEAL, raw)));
    } else {
      // Swiping left opens; don't allow swiping right
      const pull = Math.max(0, -dx);
      setOffset(Math.min(pull, REVEAL + 12)); // slight overscroll feel
    }
  };

  const onTouchEnd = () => {
    setDragging(false);
    startX.current = null;
    if (offset >= TRIGGER) {
      setOffset(REVEAL);
      setOpen(true);
    } else {
      setOffset(0);
      setOpen(false);
    }
  };

  const close = () => { setOffset(0); setOpen(false); };

  return (
    <div className="relative overflow-hidden">
      {/* Delete zone — rendered behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch bg-red-500"
        style={{ width: REVEAL }}
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => { close(); onDelete(); }}
          disabled={disabled}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-white disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-wide">Delete</span>
        </button>
      </div>

      {/* Swipeable foreground */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={open ? close : undefined}
        style={{
          transform: `translateX(-${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.2s cubic-bezier(0.25,1,0.5,1)',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
