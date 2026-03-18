export function SkeletonLine({ className = '' }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

export function SkeletonBox({ className = '' }) {
  return <div className={`bg-gray-200 rounded-2xl animate-pulse ${className}`} />;
}

export function SkeletonStatCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {[0, 1, 2].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <SkeletonLine className="h-3.5 w-24" />
            <SkeletonBox className="h-6 w-6 rounded-full" />
          </div>
          <SkeletonLine className="h-6 w-32" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTableRows({ rows = 6 }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <SkeletonLine className="h-3 w-5 flex-shrink-0" />
          <SkeletonLine className="h-3 flex-1" />
          <SkeletonLine className="h-3 w-20 hidden sm:block" />
          <SkeletonLine className="h-3 w-24 flex-shrink-0" />
          <SkeletonLine className="h-5 w-14 rounded-full flex-shrink-0" />
          <SkeletonLine className="h-3 w-24 hidden md:block flex-shrink-0" />
          <SkeletonBox className="h-7 w-7 rounded-lg flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '', children }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm p-5 ${className}`}>
      {children}
    </div>
  );
}
