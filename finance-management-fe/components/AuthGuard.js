'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonLine, SkeletonBox } from '@/components/Skeleton';

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      {/* Navbar skeleton */}
      <div className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-6">
        <SkeletonLine className="h-5 w-24 !bg-indigo-100" />
        <div className="hidden md:flex gap-3 flex-1">
          {[80, 72, 48, 64, 60, 64].map((w, i) => (
            <SkeletonLine key={i} className={`h-3.5 w-${w}`} style={{ width: w }} />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <SkeletonBox className="h-7 w-7 rounded-lg" />
          <SkeletonLine className="h-7 w-20 rounded-lg" />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <SkeletonLine className="h-5 w-40 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5">
              <SkeletonLine className="h-3.5 w-24 mb-3" />
              <SkeletonLine className="h-6 w-32" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <SkeletonLine className="h-4 w-28" />
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-4 px-5 py-3.5 border-b border-gray-50">
              <SkeletonLine className="h-3 w-4" />
              <SkeletonLine className="h-3 flex-1" />
              <SkeletonLine className="h-3 w-20" />
              <SkeletonLine className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AuthGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return <PageSkeleton />;
  return children;
}
