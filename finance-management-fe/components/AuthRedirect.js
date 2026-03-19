'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthRedirect({ to }) {
  const router = useRouter();
  useEffect(() => {
    if (localStorage.getItem('token')) router.replace(to);
  }, [router, to]);
  return null;
}
