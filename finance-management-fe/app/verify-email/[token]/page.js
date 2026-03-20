'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { verifyEmail } from '@/lib/api';
import { useTheme } from '@/components/ThemeContext';

export default function VerifyEmailPage() {
  const { token } = useParams();
  const router = useRouter();
  const { dark } = useTheme();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Invalid verification link.'); return; }
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Verification failed.');
      });
  }, [token]);

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 ${dark ? 'bg-gray-900' : 'bg-gradient-to-br from-teal-50 via-white to-teal-50'}`}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex mb-6">
            <Image src="/logo.png" alt="Finan App" width={160} height={85} className="h-10 w-auto" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          {status === 'loading' && (
            <>
              <div className="w-12 h-12 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-500">Verifying your email…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4 text-3xl">
                ✅
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Email verified!</h2>
              <p className="text-sm text-gray-500 mb-6">
                Your account is now active. You can sign in.
              </p>
              <Link
                href="/login"
                className="inline-block px-6 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
              >
                Sign in
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4 text-3xl">
                ❌
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Verification failed</h2>
              <p className="text-sm text-gray-500 mb-6">{message}</p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/register"
                  className="text-sm text-teal-600 font-medium hover:underline"
                >
                  Register again
                </Link>
                <Link
                  href="/login"
                  className="text-sm text-gray-400 hover:underline"
                >
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
