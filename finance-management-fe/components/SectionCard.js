'use client';

// Section primitives shared by /profile and /settings. Both pages render the
// same stack of titled cards, so the chrome lives here rather than being
// duplicated per page.

export function Card({ title, subtitle, danger = false, headerRight, children }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm ${danger ? 'border-red-200' : 'border-gray-200'}`}>
      <div className={`px-4 py-3 border-b rounded-t-2xl flex items-start justify-between gap-3 ${danger ? 'border-red-100' : 'border-gray-100'}`}>
        <div className="min-w-0">
          <h2 className={`text-xs font-semibold uppercase tracking-wide ${danger ? 'text-red-500' : 'text-gray-500'}`}>{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// Segmented control. Columns are driven by the option count so 2- and 4-option
// groups both stay edge-to-edge without wrapping on narrow screens.
export function Toggle({ options, value, onChange }) {
  return (
    <div className="grid p-1 bg-gray-100 rounded-xl" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(o => (
        <button key={o.val} type="button" onClick={() => onChange(o.val)}
          className={`py-1.5 rounded-lg text-sm font-semibold transition-all ${
            value === o.val ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
