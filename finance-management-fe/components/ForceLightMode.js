'use client';
import { useEffect } from 'react';

// Strips `.dark` from <html> while mounted and restores the saved theme on unmount.
export default function ForceLightMode() {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      try {
        if (localStorage.getItem('theme') === 'dark') {
          document.documentElement.classList.add('dark');
        }
      } catch {}
    };
  }, []);
  return null;
}
