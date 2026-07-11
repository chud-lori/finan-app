'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ImportRedirect() {
  const router = useRouter();
  useEffect(() => {
    const suffix = typeof window !== 'undefined'
      ? `${window.location.search}${window.location.hash}`
      : '';
    router.replace(`/profile${suffix}`);
  }, [router]);
  return null;
}
