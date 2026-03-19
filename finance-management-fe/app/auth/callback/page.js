'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState('Processing…');

  useEffect(() => {
    const token = params.get('token');
    const username = params.get('username');
    const error = params.get('error');

    if (error) {
      setStatus('Sign-in failed. Redirecting…');
      setTimeout(() => router.replace('/login?error=oauth_failed'), 1500);
      return;
    }

    if (!token) {
      setStatus('No token received. Redirecting…');
      setTimeout(() => router.replace('/login'), 1500);
      return;
    }

    localStorage.setItem('token', token);
    if (username) localStorage.setItem('username', decodeURIComponent(username));

    setStatus('Signed in! Redirecting to dashboard…');
    router.replace('/');
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
