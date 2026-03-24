'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkAuth } from '@/lib/api';

export default function AuthRedirect({ to }) {
  const router = useRouter();
  useEffect(() => {
    checkAuth().then(() => router.replace(to)).catch(() => {});
  }, [router, to]);
  return null;
}
