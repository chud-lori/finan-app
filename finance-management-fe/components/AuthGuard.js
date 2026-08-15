'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkAuth } from '@/lib/api';
import { SkeletonLine } from '@/components/Skeleton';
import Navbar from '@/components/Navbar';

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* The navbar is static chrome (no per-request data) — render it for real
          during the auth check so only the content body flashes a skeleton. */}
      <Navbar />
      {/* Content skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4 animate-pulse">
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
    checkAuth()
      .then((data) => {
        // Persist username for display (non-sensitive)
        if (data?.data?.user?.name) {
          try { localStorage.setItem('username', data.data.user.name); } catch {}
        }
        setReady(true);
      })
      .catch(() => {
        try { localStorage.removeItem('username'); } catch {}
        const next = typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : '/dashboard';
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      });
  }, [router]);

  if (!ready) return <PageSkeleton />;
  return children;
}
