'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState('Processing…');

  useEffect(() => {
    const username = params.get('username');
    const error = params.get('error');
    const nextParam = params.get('next');
    const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/auth/') && nextParam !== '/login'
      ? nextParam
      : '/dashboard';

    if (error) {
      setStatus('Sign-in failed. Redirecting…');
      const loginParams = new URLSearchParams({ error: 'oauth_failed', next });
      setTimeout(() => router.replace(`/login?${loginParams}`), 1500);
      return;
    }

    if (username) {
      try { localStorage.setItem('username', decodeURIComponent(username)); } catch {}
    }
    setStatus('Signed in! Redirecting…');
    router.replace(next);
  }, [params, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 via-white to-teal-50 gap-4">
      <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-500">{status}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
